import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { AttendanceRecord, SchoolDay, Student } from "@/lib/types";
import AttendanceClient from "./AttendanceClient";

export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: cls }, { data: students }, { data: days }, { data: records }] = await Promise.all([
    supabase.from("classes").select("academic_year, school_id").eq("id", id).single(),
    supabase.from("students").select("*").eq("class_id", id).order("no"),
    supabase.from("school_days").select("*").eq("class_id", id).order("school_date"),
    supabase.from("attendance_records").select("*, students!inner(class_id)").eq("students.class_id", id),
  ]);

  return (
    <AttendanceClient
      classId={id}
      schoolId={cls?.school_id ?? 0}
      isAdmin={profile.role === "admin"}
      academicYear={cls?.academic_year || ""}
      students={(students as Student[]) ?? []}
      initialDays={(days as SchoolDay[]) ?? []}
      initialRecords={(records as AttendanceRecord[]) ?? []}
    />
  );
}
