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
  const sourceClassId = String(formData.get("source_class_id") || "").trim();

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
  const failCopiedClass = async (message: string): Promise<ActionResult> => {
    await supabase.from("classes").delete().eq("id", classId);
    return { ok: false, error: message };
  };

  if (sourceClassId) {
    const { data: sourceClass } = await supabase
      .from("classes")
      .select("id,school_id")
      .eq("id", sourceClassId)
      .eq("school_id", activeSchool.id)
      .neq("academic_year_id", yearRow.id)
      .maybeSingle();
    if (!sourceClass) {
      await supabase.from("classes").delete().eq("id", classId);
      return { ok: false, error: "ไม่พบห้องเรียนปีเก่าที่เลือก" };
    }

    const [subjectsResult, activitiesResult, levelsResult, itemsResult, transferResult] = await Promise.all([
      supabase.from("subjects").select("*").eq("class_id", sourceClassId).order("order_no"),
      supabase.from("activities").select("*").eq("class_id", sourceClassId).order("order_no"),
      supabase.from("subject_competency_levels").select("*").eq("class_id", sourceClassId).order("order_no"),
      supabase.from("assessment_items").select("*").eq("class_id", sourceClassId).order("kind").order("no"),
      supabase.from("transfer_subjects").select("*").eq("class_id", sourceClassId).order("order_no"),
    ]);
    const readError = [subjectsResult.error, activitiesResult.error, levelsResult.error, itemsResult.error, transferResult.error].find(Boolean);
    if (readError) return failCopiedClass(`อ่านข้อมูลปีเก่าไม่สำเร็จ: ${readError.message}`);
    const oldSubjects = subjectsResult.data;
    const oldActivities = activitiesResult.data;
    const oldLevels = levelsResult.data;
    const oldItems = itemsResult.data;
    const oldTransferSubjects = transferResult.data;

    const subjectMap = new Map<string, string>();
    for (const row of oldSubjects ?? []) {
      const { data, error: copyError } = await supabase.from("subjects").insert({
        class_id: classId, order_no: row.order_no, category: row.category, name: row.name,
        code: row.code, hours: row.hours, credits: row.credits, midterm_max: row.midterm_max,
        final_max: row.final_max, competency_text: row.competency_text, is_active: row.is_active,
      }).select("id").single();
      if (copyError || !data) return failCopiedClass(copyError?.message || "คัดลอกรายวิชาไม่สำเร็จ");
      subjectMap.set(row.id, data.id);
    }

    if (oldActivities?.length) { const { error: copyError } = await supabase.from("activities").insert(oldActivities.map((row) => ({ class_id: classId, order_no: row.order_no, code: row.code, name: row.name, hours: row.hours }))); if (copyError) return failCopiedClass(`คัดลอกกิจกรรมไม่สำเร็จ: ${copyError.message}`); }
    if (oldLevels?.length) { const { error: copyError } = await supabase.from("subject_competency_levels").insert(oldLevels.map((row) => ({ class_id: classId, order_no: row.order_no, subject_name: row.subject_name, competency_text: row.competency_text, beginner_text: row.beginner_text, developing_text: row.developing_text, proficient_text: row.proficient_text, expert_text: row.expert_text }))); if (copyError) return failCopiedClass(`คัดลอกเกณฑ์ความสามารถไม่สำเร็จ: ${copyError.message}`); }
    if (oldItems?.length) { const { error: copyError } = await supabase.from("assessment_items").insert(oldItems.map((row) => ({ class_id: classId, kind: row.kind, no: row.no, title: row.title, max_score: row.max_score }))); if (copyError) return failCopiedClass(`คัดลอกหัวข้อประเมินไม่สำเร็จ: ${copyError.message}`); }

    const transferMap = new Map<string, string>();
    for (const row of oldTransferSubjects ?? []) {
      const { data, error: copyError } = await supabase.from("transfer_subjects").insert({ class_id: classId, order_no: row.order_no, category: row.category, code: row.code, name: row.name, credits: row.credits, enabled: row.enabled }).select("id").single();
      if (copyError || !data) return failCopiedClass(copyError?.message || "คัดลอกรายวิชาเทียบโอนไม่สำเร็จ");
      transferMap.set(row.id, data.id);
    }
    if (transferMap.size) {
      const { data: oldSources, error: sourceReadError } = await supabase.from("transfer_sources").select("transfer_subject_id,subject_id").in("transfer_subject_id", [...transferMap.keys()]);
      if (sourceReadError) return failCopiedClass(`อ่านการจับคู่วิชาปีเก่าไม่สำเร็จ: ${sourceReadError.message}`);
      const links = (oldSources ?? []).flatMap((row) => {
        const transferSubjectId = transferMap.get(row.transfer_subject_id);
        const subjectId = subjectMap.get(row.subject_id);
        return transferSubjectId && subjectId ? [{ transfer_subject_id: transferSubjectId, subject_id: subjectId }] : [];
      });
      if (links.length) { const { error: copyError } = await supabase.from("transfer_sources").insert(links); if (copyError) return failCopiedClass(`คัดลอกการจับคู่วิชาไม่สำเร็จ: ${copyError.message}`); }
    }

    if (subjectMap.size) {
      const { data: oldConfigs, error: configReadError } = await supabase.from("learning_outcome_configs").select("*").in("subject_id", [...subjectMap.keys()]);
      if (configReadError) return failCopiedClass(`อ่านผลลัพธ์การเรียนรู้ปีเก่าไม่สำเร็จ: ${configReadError.message}`);
      for (const oldConfig of oldConfigs ?? []) {
        const newSubjectId = subjectMap.get(oldConfig.subject_id);
        if (!newSubjectId) continue;
        const { data: newConfig, error: configCopyError } = await supabase.from("learning_outcome_configs").insert({
          subject_id: newSubjectId, term: oldConfig.term, target_max: oldConfig.target_max,
          calculation_method: oldConfig.calculation_method, status: "draft", created_by: profile.id,
        }).select("id").single();
        if (configCopyError || !newConfig) return failCopiedClass(configCopyError?.message || "คัดลอกชุดผลลัพธ์การเรียนรู้ไม่สำเร็จ");
        const { data: oldIndicators, error: indicatorReadError } = await supabase.from("learning_outcome_indicators").select("*").eq("config_id", oldConfig.id).order("order_no");
        if (indicatorReadError) return failCopiedClass(`อ่านตัวชี้วัดปีเก่าไม่สำเร็จ: ${indicatorReadError.message}`);
        if (oldIndicators?.length) { const { error: indicatorCopyError } = await supabase.from("learning_outcome_indicators").insert(oldIndicators.map((row) => ({ config_id: newConfig.id, order_no: row.order_no, code: row.code, title: row.title, max_score: row.max_score, weight_percent: row.weight_percent }))); if (indicatorCopyError) return failCopiedClass(`คัดลอกตัวชี้วัดไม่สำเร็จ: ${indicatorCopyError.message}`); }
      }
    }
  } else if (seed) {
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
