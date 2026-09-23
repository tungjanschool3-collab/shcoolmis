"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePlatformOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SCHOOL_COOKIE, getActiveSchool } from "@/lib/school-context";

export type SchoolActionResult = { ok: boolean; error?: string; id?: number };
const DEFAULT_CRITERIA = [
  { min_score: 0, grade_point: 0 }, { min_score: 50, grade_point: 1 },
  { min_score: 55, grade_point: 1.5 }, { min_score: 60, grade_point: 2 },
  { min_score: 65, grade_point: 2.5 }, { min_score: 70, grade_point: 3 },
  { min_score: 75, grade_point: 3.5 }, { min_score: 80, grade_point: 4 },
];

export async function switchSchool(schoolId: number): Promise<SchoolActionResult> {
  await requirePlatformOwner();
  const supabase = await createClient();
  const { data } = await supabase.from("school").select("id").eq("id", schoolId).maybeSingle();
  if (!data) return { ok: false, error: "ไม่พบโรงเรียน" };
  (await cookies()).set(ACTIVE_SCHOOL_COOKIE, String(schoolId), { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function createSchool(formData: FormData): Promise<SchoolActionResult> {
  const profile = await requirePlatformOwner();
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const academicYear = String(formData.get("academic_year") || "").trim();
  if (!name) return { ok: false, error: "กรุณาระบุชื่อโรงเรียน" };
  if (!/^\d{4}$/.test(academicYear)) return { ok: false, error: "ปีการศึกษาต้องเป็นตัวเลข 4 หลัก" };

  const current = await getActiveSchool(profile);
  const { data: school, error } = await supabase.from("school").insert({ name, academic_year: academicYear }).select("id").single();
  if (error || !school) return { ok: false, error: error?.message || "สร้างโรงเรียนไม่สำเร็จ" };

  const newId = Number(school.id);
  const { error: yearError } = await supabase.from("academic_years").insert({ school_id: newId, year: academicYear, created_by: profile.id });
  if (yearError) return { ok: false, error: "สร้างปีการศึกษาไม่สำเร็จ: " + yearError.message };
  const { data: criteria } = current
    ? await supabase.from("grade_criteria").select("min_score,grade_point,sort").eq("school_id", current.id).order("sort")
    : { data: null };
  const rows = criteria?.length ? criteria : DEFAULT_CRITERIA.map((row, sort) => ({ ...row, sort }));
  await supabase.from("grade_criteria").insert(rows.map((row) => ({ ...row, school_id: newId })));

  (await cookies()).set(ACTIVE_SCHOOL_COOKIE, String(newId), { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
  return { ok: true, id: newId };
}

export async function approveRegistration(registrationId: string, academicYear: string): Promise<SchoolActionResult> {
  await requirePlatformOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_school_registration", {
    registration_id: registrationId,
    initial_year: academicYear.trim(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/schools");
  return { ok: true, id: Number(data) };
}

export async function rejectRegistration(registrationId: string): Promise<SchoolActionResult> {
  await requirePlatformOwner();
  const supabase = await createClient();
  const { error } = await supabase.from("school_registrations").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", registrationId).eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/schools");
  return { ok: true };
}
