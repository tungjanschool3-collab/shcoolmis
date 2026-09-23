import { requirePlatformOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveSchool } from "@/lib/school-context";
import type { School } from "@/lib/types";
import SchoolsClient from "./SchoolsClient";

export default async function SchoolsPage() {
  const profile = await requirePlatformOwner();
  const supabase = await createClient();
  const [{ data }, activeSchool, { data: registrations }] = await Promise.all([
    supabase.from("school").select("*").order("id"),
    getActiveSchool(profile),
    supabase.from("school_registrations").select("id,email,school_name,contact_name,phone,created_at").eq("status", "pending").order("created_at"),
  ]);
  return <SchoolsClient schools={(data as School[]) ?? []} activeSchoolId={activeSchool?.id ?? null} registrations={registrations ?? []} />;
}

