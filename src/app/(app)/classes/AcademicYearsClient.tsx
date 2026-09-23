"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AcademicYear, Profile } from "@/lib/types";
import { createAcademicYear, deleteAcademicYear } from "./actions";
import { usePasswordDelete } from "@/components/PasswordDeleteGuard";

export default function AcademicYearsClient({ profile, years, counts }: { profile: Profile; years: AcademicYear[]; counts: Record<string, number> }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isAdmin = ["platform_owner", "school_admin", "admin"].includes(profile.role);
  const { requestDelete, deletePasswordDialog } = usePasswordDelete();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await createAcademicYear(new FormData(event.currentTarget));
    setBusy(false);
    if (!result.ok) return setError(result.error || "สร้างปีการศึกษาไม่สำเร็จ");
    setShowForm(false);
    router.refresh();
  }

  return <div className="space-y-5">{deletePasswordDialog}
    <div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-slate-800">ปีการศึกษา</h1>{isAdmin && <button disabled={years.length >= 10} onClick={() => setShowForm((value) => !value)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">+ เพิ่มปีการศึกษา</button>}</div>
    <p className="text-sm text-slate-500">จัดเก็บแล้ว {years.length}/10 ปีการศึกษา</p>
    {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {showForm && <form onSubmit={submit} className="flex max-w-md gap-3 rounded-xl border bg-white p-4"><input name="year" required pattern="[0-9]{4}" placeholder="เช่น 2569" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-white">{busy ? "กำลังสร้าง..." : "สร้าง"}</button></form>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{years.map((year) => <div key={year.id} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"><Link href={`/classes/year/${year.id}`}><div className="text-xl font-bold text-slate-800">ปีการศึกษา {year.year}</div><div className="mt-2 text-sm text-slate-500">{counts[year.id] || 0} ห้องเรียน · {year.status === "active" ? "กำลังใช้งาน" : "ปิดปีแล้ว"}</div><span className="mt-4 inline-block text-sm font-medium text-indigo-700">เปิดดูห้องเรียน →</span></Link>{isAdmin && <div className="mt-4 flex gap-3 border-t pt-3 text-sm"><a href={`/api/academic-years/${year.id}/export`} className="text-emerald-700">ดาวน์โหลดข้อมูล</a><button className="ml-auto text-rose-700" onClick={() => { const confirmation = prompt(`พิมพ์ ${year.year} เพื่อยืนยันการลบ`); if (confirmation !== year.year) return; requestDelete({ title: `ลบปีการศึกษา ${year.year}`, description: "ข้อมูลห้องเรียน นักเรียน คะแนน และการเข้าเรียนทั้งหมดในปีนี้จะถูกลบ ต้องดาวน์โหลดข้อมูลภายใน 24 ชั่วโมงก่อน", onVerified: async () => { const result = await deleteAcademicYear(year.id, confirmation); if (!result.ok) setError(result.error || "ลบไม่สำเร็จ"); else router.refresh(); } }); }}>ลบปี</button></div>}</div>)}</div>
    {!years.length && <div className="rounded-xl border bg-white p-10 text-center text-slate-500">ยังไม่มีปีการศึกษา</div>}
  </div>;
}
