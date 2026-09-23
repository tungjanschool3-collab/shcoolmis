import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AcademicYear } from "@/lib/types";
import AcademicYearsClient from "./AcademicYearsClient";
import { getActiveSchool } from "@/lib/school-context";

export default async function ClassesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const activeSchool = await getActiveSchool(profile);

  const { data: years } = await supabase.from("academic_years").select("*").eq("school_id", activeSchool?.id ?? -1).order("year", { ascending: false });
  const { data: classes } = await supabase.from("classes").select("academic_year_id").eq("school_id", activeSchool?.id ?? -1);
  const counts = ((classes as { academic_year_id: string | null }[]) ?? []).reduce<Record<string, number>>((result, row) => {
    if (row.academic_year_id) result[row.academic_year_id] = (result[row.academic_year_id] || 0) + 1;
    return result;
  }, {});

  return <AcademicYearsClient profile={profile} years={(years as AcademicYear[]) ?? []} counts={counts} />;
}
