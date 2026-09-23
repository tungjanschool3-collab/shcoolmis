import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { redirect } from "next/navigation";

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (!["platform_owner", "school_admin", "admin"].includes(profile.role)) redirect("/dashboard");
  return profile;
}

export async function requirePlatformOwner(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "platform_owner") redirect("/dashboard");
  return profile;
}

export async function requireSchoolAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (!["platform_owner", "school_admin", "admin"].includes(profile.role)) redirect("/dashboard");
  return profile;
}
