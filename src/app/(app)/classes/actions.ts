"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import {
  SUBJECT_TEMPLATE,
  TRANSFER_SUBJECT_TEMPLATE,
  ACTIVITY_TEMPLATE,
  COMPETENCY_TEMPLATE,
  CHARACTERISTIC_TEMPLATE,
  READ_WRITE_TEMPLATE,
} from "@/lib/template";
import { SUBJECT_COMPETENCY_TEMPLATE } from "@/lib/subject-competency-template";
import { revalidatePath } from "next/cache";
import { getActiveSchool } from "@/lib/school-context";

export type ActionResult = { ok: boolean; error?: string; id?: string };

export async function createAcademicYear(formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!["platform_owner", "school_admin", "admin"].includes(profile.role)) return { ok: false, error: "ต้องเป็นผู้ดูแลโรงเรียน" };
  const year = String(formData.get("year") || "").trim();
  if (!/^\d{4}$/.test(year)) return { ok: false, error: "ปีการศึกษาต้องเป็นตัวเลข 4 หลัก" };
  const supabase = await createClient();
  const school = await getActiveSchool(profile);
  if (!school) return { ok: false, error: "ไม่พบโรงเรียน" };
  const { data, error } = await supabase.from("academic_years").insert({ school_id: school.id, year, created_by: profile.id }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message || "สร้างปีการศึกษาไม่สำเร็จ" };
  revalidatePath("/classes");
  return { ok: true, id: data.id };
}

export async function deleteAcademicYear(yearId: string, confirmation: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!["platform_owner", "school_admin", "admin"].includes(profile.role)) return { ok: false, error: "ต้องเป็นผู้ดูแลโรงเรียน" };
  const supabase = await createClient();
  const { data: year } = await supabase.from("academic_years").select("year").eq("id", yearId).single();
  if (!year || confirmation !== year.year) return { ok: false, error: "ข้อความยืนยันปีการศึกษาไม่ถูกต้อง" };
  const { error } = await supabase.rpc("delete_exported_academic_year", { target_year_id: yearId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/classes");
  return { ok: true };
}

export async function createClassRoom(formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!["platform_owner", "school_admin", "admin"].includes(profile.role)) return { ok: false, error: "ต้องเป็นผู้ดูแลระบบ" };

  const supabase = await createClient();
  const activeSchool = await getActiveSchool(profile);
  if (!activeSchool) return { ok: false, error: "กรุณาเลือกโรงเรียนก่อนสร้างห้องเรียน" };
  const academicYearId = String(formData.get("academic_year_id") || "").trim();
  const { data: yearRow } = await supabase.from("academic_years").select("id,year,school_id").eq("id", academicYearId).eq("school_id", activeSchool.id).single();
  if (!yearRow) return { ok: false, error: "ไม่พบปีการศึกษาของโรงเรียนนี้" };
  const academic_year = yearRow.year;
  const grade_level = String(formData.get("grade_level") || "").trim();
  const room = String(formData.get("room") || "").trim();
  const homeroom_teacher_id = String(formData.get("homeroom_teacher_id") || "").trim() || null;
  const homeroom_teacher_name = String(formData.get("homeroom_teacher_name") || "").trim();
  const homeroom_teacher2_name = String(formData.get("homeroom_teacher2_name") || "").trim();
  const seed = formData.get("seed") === "on";

  if (!grade_level) return { ok: false, error: "กรุณาระบุระดับชั้น" };

  const { data: cls, error } = await supabase
    .from("classes")
    .insert({
      school_id: activeSchool.id,
      academic_year,
      academic_year_id: yearRow.id,
      grade_level,
      room,
      homeroom_teacher_id,
      homeroom_teacher_name,
      homeroom_teacher2_name,
    })
    .select("id")
    .single();

  if (error || !cls) return { ok: false, error: error?.message || "สร้างห้องไม่สำเร็จ" };
  const classId = cls.id as string;

  if (seed) {
    // วิชา (ต้นทาง) — ดึง id กลับมาเพื่อจับคู่เทียบโอน
    const { data: insertedSubjects } = await supabase
      .from("subjects")
      .insert(SUBJECT_TEMPLATE.map((t) => ({ ...t, class_id: classId })))
      .select("id, order_no");

    // วิชาเทียบโอน (ปลายทาง)
    const { data: insertedTransfer } = await supabase
      .from("transfer_subjects")
      .insert(TRANSFER_SUBJECT_TEMPLATE.map((t) => ({ ...t, class_id: classId })))
      .select("id, order_no");

    // จับคู่ 1:1 ตาม order_no
    if (insertedSubjects && insertedTransfer) {
      const subjByOrder = new Map(insertedSubjects.map((s) => [s.order_no, s.id]));
      const links = insertedTransfer
        .map((t) => {
          const subjectId = subjByOrder.get(t.order_no);
          return subjectId ? { transfer_subject_id: t.id, subject_id: subjectId } : null;
        })
        .filter((x): x is { transfer_subject_id: string; subject_id: string } => x !== null);
      if (links.length) await supabase.from("transfer_sources").insert(links);
    }

    await supabase.from("activities").insert(
      ACTIVITY_TEMPLATE.map((t) => ({ ...t, class_id: classId }))
    );
    await supabase.from("subject_competency_levels").insert(
      SUBJECT_COMPETENCY_TEMPLATE.map((t) => ({ ...t, class_id: classId }))
    );
    const items = [
      ...COMPETENCY_TEMPLATE.map((title, i) => ({
        class_id: classId,
        kind: "competency" as const,
        no: i + 1,
        title,
        max_score: 3,
      })),
      ...CHARACTERISTIC_TEMPLATE.map((title, i) => ({
        class_id: classId,
        kind: "characteristic" as const,
        no: i + 1,
        title,
        max_score: 3,
      })),
      ...READ_WRITE_TEMPLATE.map((title, i) => ({
        class_id: classId,
        kind: "read_write" as const,
        no: i + 1,
        title,
        max_score: 3,
      })),
    ];
    await supabase.from("assessment_items").insert(items);
  }

  revalidatePath("/classes");
  return { ok: true, id: classId };
}

export async function deleteClassRoom(classId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!["platform_owner", "school_admin", "admin"].includes(profile.role)) return { ok: false, error: "ต้องเป็นผู้ดูแลระบบ" };
  const supabase = await createClient();
  const { error } = await supabase.from("classes").delete().eq("id", classId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/classes");
  return { ok: true };
}
