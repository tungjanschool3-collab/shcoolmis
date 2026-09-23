import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { School } from "@/lib/types";
import { getActiveSchool } from "@/lib/school-context";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const s = (await getActiveSchool(profile)) as School | null;
  const isAdmin = ["platform_owner", "school_admin", "admin"].includes(profile.role);

  const { data: schoolClasses, count: classCount } = await supabase
    .from("classes")
    .select("id", { count: "exact" })
    .eq("school_id", s?.id ?? -1);
  const classIds = (schoolClasses ?? []).map((item) => item.id);
  const { count: studentCount } = classIds.length
    ? await supabase.from("students").select("*", { count: "exact", head: true }).in("class_id", classIds)
    : { count: 0 };

  let teacherCount: number | null = null;
  if (isAdmin) {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "teacher")
      .eq("school_id", s?.id ?? -1);
    teacherCount = count ?? 0;
  }

  const stats = [
    { label: "ห้องเรียน", value: classCount ?? 0, href: "/classes", icon: "🏫" },
    { label: "นักเรียนทั้งหมด", value: studentCount ?? 0, href: "/classes", icon: "🧑‍🎓" },
    ...(isAdmin
      ? [{ label: "ครูผู้ใช้งาน", value: teacherCount ?? 0, href: "/teachers", icon: "👩‍🏫" }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          สวัสดี, {profile.full_name || profile.username}
        </h1>
        <p className="text-slate-500 mt-1">
          {s?.name ? `โรงเรียน${s.name}` : "ยังไม่ได้ตั้งค่าข้อมูลโรงเรียน"}
        </p>
      </div>

      {isAdmin && !s?.name && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
          เริ่มต้นใช้งาน: กรุณา{" "}
          <Link href="/settings" className="underline font-medium">
            ตั้งค่าข้อมูลโรงเรียน
          </Link>{" "}
          และ{" "}
          <Link href="/classes" className="underline font-medium">
            สร้างห้องเรียน
          </Link>{" "}
          ก่อนเริ่มบันทึกคะแนน
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((st) => (
          <Link
            key={st.label}
            href={st.href}
            className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition border border-slate-100"
          >
            <div className="text-3xl">{st.icon}</div>
            <div className="mt-3 text-3xl font-bold text-slate-800">{st.value}</div>
            <div className="text-slate-500 text-sm">{st.label}</div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
        <h2 className="font-semibold text-slate-800 mb-3">เริ่มต้นใช้งาน</h2>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1.5">
          <li>ผู้ดูแลระบบตั้งค่า <b>ข้อมูลโรงเรียน</b> และเกณฑ์การตัดเกรด</li>
          <li>เพิ่ม <b>ครู</b> และมอบหมายห้องเรียน</li>
          <li>สร้าง <b>ห้องเรียน</b> (ระบบเติมรายวิชา/หัวข้อประเมินให้อัตโนมัติ)</li>
          <li>เพิ่ม <b>นักเรียน</b> และ <b>กรอกคะแนน</b> — ระบบตัดเกรดให้อัตโนมัติ</li>
          <li>สั่ง <b>พิมพ์/บันทึก PDF</b> รายงาน ปพ.5</li>
        </ol>
      </div>
    </div>
  );
}
