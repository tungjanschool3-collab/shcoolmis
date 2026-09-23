"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getActiveSchool } from "@/lib/school-context";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่ได้เข้าสู่ระบบ");
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!data || !["platform_owner", "school_admin", "admin"].includes(data.role)) throw new Error("ต้องเป็นผู้ดูแลระบบ");
  return data;
}

async function assertCanManageUser(userId: string) {
  const actor = await assertAdmin();
  if (actor.role === "platform_owner" || actor.role === "admin") return actor;
  const supabase = await createClient();
  const activeSchool = await getActiveSchool(actor);
  const { data: target } = await supabase.from("school_memberships").select("role").eq("school_id", activeSchool?.id ?? -1).eq("user_id", userId).maybeSingle();
  if (!target || target.role === "school_admin") throw new Error("ไม่มีสิทธิ์จัดการบัญชีนี้");
  return actor;
}

export type ActionResult = { ok: boolean; error?: string };

export async function createTeacher(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await requireAdmin();
    const activeSchool = await getActiveSchool(profile);
    if (!activeSchool) return { ok: false, error: "กรุณาเลือกโรงเรียนก่อนเพิ่มครู" };
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const full_name = String(formData.get("full_name") || "").trim();
    const position = String(formData.get("position") || "").trim();
    const role = String(formData.get("role") || "teacher");

    if (!email || !email.includes("@")) return { ok: false, error: "กรุณากรอกอีเมลจริง" };

    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "https://shcoolmis.vercel.app"}/auth/callback?next=/set-password`,
      data: { full_name },
    });
    if (createErr || !created.user) {
      const msg = createErr?.message || "";
      if (msg.includes("registered")) return { ok: false, error: "ชื่อผู้ใช้นี้มีอยู่แล้ว" };
      return { ok: false, error: "สร้างบัญชีไม่สำเร็จ: " + msg };
    }

    const { error: profErr } = await admin.from("profiles").insert({
      id: created.user.id,
      school_id: activeSchool.id,
      username: email,
      full_name,
      position,
      role: role === "school_admin" ? "school_admin" : "teacher",
    });
    if (profErr) {
      // ย้อนกลับหากบันทึกโปรไฟล์ไม่สำเร็จ
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: "บันทึกข้อมูลครูไม่สำเร็จ: " + profErr.message };
    }

    const { error: memberError } = await admin.from("school_memberships").insert({
      school_id: activeSchool.id,
      user_id: created.user.id,
      role: role === "school_admin" ? "school_admin" : "teacher",
      status: "active",
    });
    if (memberError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: "ผูกบัญชีกับโรงเรียนไม่สำเร็จ: " + memberError.message };
    }

    revalidatePath("/teachers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function resetPassword(userId: string, newPassword: string): Promise<ActionResult> {
  try {
    await assertCanManageUser(userId);
    if (newPassword.length < 6) return { ok: false, error: "รหัสผ่านอย่างน้อย 6 ตัวอักษร" };
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setActive(userId: string, isActive: boolean): Promise<ActionResult> {
  try {
    await assertCanManageUser(userId);
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").update({ is_active: isActive }).eq("id", userId);
    if (error) return { ok: false, error: error.message };
    // ปิดการเข้าสู่ระบบด้วยการ ban ผู้ใช้
    await admin.auth.admin.updateUserById(userId, {
      ban_duration: isActive ? "none" : "876000h",
    });
    revalidatePath("/teachers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteTeacher(userId: string): Promise<ActionResult> {
  try {
    const actor = await assertCanManageUser(userId);
    if (userId === actor.id) return { ok: false, error: "ลบบัญชีตัวเองไม่ได้" };
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/teachers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
