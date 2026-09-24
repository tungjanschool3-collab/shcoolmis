import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { ClassRoom } from "@/lib/types";
import ClassTabs from "@/components/ClassTabs";
import TableArrowNavigation from "@/components/TableArrowNavigation";

export default async function ClassLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("classes").select("*").eq("id", id).single();
  const cls = data as ClassRoom | null;
  if (!cls) notFound();

  return (
    <div className="space-y-5">
      <div className="no-print">
        <Link href="/classes" className="text-sm text-slate-500 hover:underline">
          ← ห้องเรียนทั้งหมด
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 mt-1">
          {cls.grade_level} {cls.room && `ห้อง ${cls.room}`}
          <span className="text-base font-normal text-slate-400 ml-2">ปีการศึกษา {cls.academic_year}</span>
        </h1>
      </div>
      <ClassTabs classId={id} />
      <TableArrowNavigation>{children}</TableArrowNavigation>
    </div>
  );
}
