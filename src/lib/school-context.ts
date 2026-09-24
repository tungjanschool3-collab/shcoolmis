import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Profile, School } from "@/lib/types";

export const ACTIVE_SCHOOL_COOKIE = "active_school_id";

export async function getActiveSchool(profile: Profile): Promise<School | null> {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const requestedId = Number(cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value || 0);
  const isPlatformOwner = profile.role === "platform_owner" || profile.role === "admin";
  let schoolId = isPlatformOwner ? requestedId : Number(profile.school_id || 0);

  if (!isPlatformOwner) {
    const { data: membership } = await supabase
      .from("school_memberships")
      .select("school_id")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    schoolId = Number(membership?.school_id || schoolId || 0);
  }

  if (schoolId > 0) {
    const { data } = await supabase.from("school").select("*").eq("id", schoolId).maybeSingle();
    if (data) return data as School;
  }

  const { data } = await supabase.from("school").select("*").order("id").limit(1).maybeSingle();
  return (data as School | null) ?? null;
}

export async function getSchoolForClass(classId: string): Promise<School | null> {
  const supabase = await createClient();
  const { data: classroom } = await supabase.from("classes").select("school_id").eq("id", classId).maybeSingle();
  if (!classroom?.school_id) return null;
  const { data } = await supabase.from("school").select("*").eq("id", classroom.school_id).maybeSingle();
  return (data as School | null) ?? null;
}
