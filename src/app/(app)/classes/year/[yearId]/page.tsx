import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveSchool } from "@/lib/school-context";
import type { ClassRoom, Profile } from "@/lib/types";
import ClassesClient from "../../ClassesClient";

export default async function AcademicYearClassesPage({ params }: { params: Promise<{ yearId: string }> }) {
  const { yearId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const school = await getActiveSchool(profile);
  if (!school) notFound();

  const { data: year } = await supabase.from("academic_years").select("id,year,school_id").eq("id", yearId).eq("school_id", school.id).maybeSingle();
  if (!year) notFound();

  const { data: classes } = await supabase.from("classes").select("*").eq("school_id", school.id).eq("academic_year_id", year.id).order("grade_level").order("room");
  const { data: templateClasses } = await supabase.from("classes").select("*").eq("school_id", school.id).neq("academic_year_id", year.id).order("academic_year", { ascending: false }).order("grade_level").order("room");
  const list = (classes as ClassRoom[]) ?? [];
  const counts: Record<string, number> = {};
  if (list.length) {
    const { data: students } = await supabase.from("students").select("class_id").in("class_id", list.map((item) => item.id));
    for (const student of (students as { class_id: string }[]) ?? []) counts[student.class_id] = (counts[student.class_id] || 0) + 1;
  }

  let teachers: Profile[] = [];
  if (["platform_owner", "school_admin", "admin"].includes(profile.role)) {
    const { data: memberships } = await supabase.from("school_memberships").select("user_id").eq("school_id", school.id).eq("role", "teacher").eq("status", "active");
    const ids = (memberships ?? []).map((row) => row.user_id);
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("*").in("id", ids).order("full_name");
      teachers = (data as Profile[]) ?? [];
    }
  }

  return <ClassesClient profile={profile} classes={list} counts={counts} teachers={teachers} templateClasses={(templateClasses as ClassRoom[]) ?? []} academicYearId={year.id} academicYear={year.year} />;
}
