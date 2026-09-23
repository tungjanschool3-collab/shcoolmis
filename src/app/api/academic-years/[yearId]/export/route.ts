import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ yearId: string }> }) {
  const { yearId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["platform_owner", "school_admin", "admin"].includes(profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: year } = await supabase.from("academic_years").select("*").eq("id", yearId).single();
  if (!year) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: school } = await supabase.from("school").select("*").eq("id", year.school_id).single();
  const { data: gradeCriteria } = await supabase.from("grade_criteria").select("*").eq("school_id", year.school_id).order("sort");
  const { data: classes } = await supabase.from("classes").select("*").eq("academic_year_id", yearId).eq("school_id", year.school_id);
  const classIds = (classes ?? []).map((row) => row.id);
  const empty = { data: [] as any[] };
  const [studentsResult, subjectsResult, levelsResult, itemsResult, activitiesResult, transfersResult, daysResult] = classIds.length ? await Promise.all([
    supabase.from("students").select("*").in("class_id", classIds),
    supabase.from("subjects").select("*").in("class_id", classIds),
    supabase.from("subject_competency_levels").select("*").in("class_id", classIds),
    supabase.from("assessment_items").select("*").in("class_id", classIds),
    supabase.from("activities").select("*").in("class_id", classIds),
    supabase.from("transfer_subjects").select("*").in("class_id", classIds),
    supabase.from("school_days").select("*").in("class_id", classIds),
  ]) : [empty, empty, empty, empty, empty, empty, empty];

  const students = studentsResult.data ?? [];
  const studentIds = students.map((row) => row.id);
  const subjectIds = (subjectsResult.data ?? []).map((row) => row.id);
  const itemIds = (itemsResult.data ?? []).map((row) => row.id);
  const activityIds = (activitiesResult.data ?? []).map((row) => row.id);
  const transferIds = (transfersResult.data ?? []).map((row) => row.id);
  const dayIds = (daysResult.data ?? []).map((row) => row.id);
  const queryOrEmpty = async (table: string, column: string, ids: string[]) => ids.length ? await supabase.from(table).select("*").in(column, ids) : empty;
  const [scores, assessmentScores, activityResults, transferSources, attendance] = await Promise.all([
    queryOrEmpty("subject_scores", "student_id", studentIds),
    queryOrEmpty("assessment_scores", "student_id", studentIds),
    queryOrEmpty("activity_results", "student_id", studentIds),
    queryOrEmpty("transfer_sources", "transfer_subject_id", transferIds),
    queryOrEmpty("attendance_records", "school_day_id", dayIds),
  ]);

  const payload = {
    format: "shcoolmis-academic-year-v1",
    exported_at: new Date().toISOString(),
    school,
    grade_criteria: gradeCriteria ?? [],
    academic_year: year,
    classes: classes ?? [], students,
    subjects: subjectsResult.data ?? [], subject_competency_levels: levelsResult.data ?? [],
    subject_scores: scores.data ?? [], assessment_items: itemsResult.data ?? [], assessment_scores: assessmentScores.data ?? [],
    activities: activitiesResult.data ?? [], activity_results: activityResults.data ?? [],
    transfer_subjects: transfersResult.data ?? [], transfer_sources: transferSources.data ?? [],
    school_days: daysResult.data ?? [], attendance_records: attendance.data ?? [],
  };
  const manifest = Object.fromEntries(Object.entries(payload).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
  const { error: exportError } = await supabase.from("academic_year_exports").insert({ academic_year_id: year.id, school_id: year.school_id, created_by: user.id, manifest });
  if (exportError) return NextResponse.json({ error: exportError.message }, { status: 500 });
  const safeYear = String(year.year).replace(/[^0-9]/g, "");
  return new NextResponse(JSON.stringify({ manifest, ...payload }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="academic-year-${safeYear}.json"`, "Cache-Control": "no-store" } });
}
