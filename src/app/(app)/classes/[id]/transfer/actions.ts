"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { TRANSFER_SUBJECT_TEMPLATE } from "@/lib/template";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: boolean; error?: string };

// สร้างวิชาเทียบโอนเริ่มต้น + จับคู่ 1:1 กับวิชาต้นทางตามลำดับ (ใช้เมื่อยังไม่มี)
export async function seedTransferDefaults(classId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  // ตรวจว่ามีอยู่แล้วหรือไม่
  const { count } = await supabase
    .from("transfer_subjects")
    .select("*", { count: "exact", head: true })
    .eq("class_id", classId);
  if ((count ?? 0) > 0) return { ok: false, error: "มีวิชาเทียบโอนอยู่แล้ว" };

  // สิทธิ์: admin หรือ เจ้าของห้อง (RLS จะบังคับอีกชั้น)
  if (!["platform_owner", "school_admin", "admin"].includes(profile.role)) {
    const { data: cls } = await supabase.from("classes").select("homeroom_teacher_id").eq("id", classId).single();
    if (!cls || cls.homeroom_teacher_id !== profile.id) return { ok: false, error: "ไม่มีสิทธิ์" };
  }

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, order_no")
    .eq("class_id", classId)
    .order("order_no");

  const { data: inserted } = await supabase
    .from("transfer_subjects")
    .insert(TRANSFER_SUBJECT_TEMPLATE.map((t) => ({ ...t, class_id: classId })))
    .select("id, order_no");

  if (subjects && inserted) {
    const subjByOrder = new Map(subjects.map((s) => [s.order_no, s.id]));
    const links = inserted
      .map((t) => {
        const subjectId = subjByOrder.get(t.order_no);
        return subjectId ? { transfer_subject_id: t.id, subject_id: subjectId } : null;
      })
      .filter((x): x is { transfer_subject_id: string; subject_id: string } => x !== null);
    if (links.length) await supabase.from("transfer_sources").insert(links);
  }

  revalidatePath(`/classes/${classId}/transfer`);
  return { ok: true };
}
