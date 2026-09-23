"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { School } from "@/lib/types";
import { approveRegistration, createSchool, rejectRegistration, switchSchool } from "./actions";

type Registration = { id: string; email: string; school_name: string; contact_name: string; phone: string; created_at: string };

export default function SchoolsClient({ schools, activeSchoolId, registrations }: { schools: School[]; activeSchoolId: number | null; registrations: Registration[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await createSchool(new FormData(event.currentTarget));
    setBusy(false);
    if (!result.ok) return setMessage(result.error || "สร้างโรงเรียนไม่สำเร็จ");
    setShowForm(false);
    router.push("/dashboard");
    router.refresh();
  }

  async function handleSwitch(id: number) {
    setBusy(true);
    const result = await switchSchool(id);
    setBusy(false);
    if (!result.ok) return setMessage(result.error || "เปลี่ยนโรงเรียนไม่สำเร็จ");
    router.push("/dashboard");
    router.refresh();
  }

  async function handleApprove(id: string) {
    const year = prompt("ปีการศึกษาเริ่มต้น เช่น 2569");
    if (!year) return;
    setBusy(true);
    const result = await approveRegistration(id, year);
    setBusy(false);
    if (!result.ok) return setMessage(result.error || "อนุมัติไม่สำเร็จ");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-800">จัดการโรงเรียน</h1><p className="text-sm text-slate-500">เลือกโรงเรียนเพื่อใช้หน้าจอและข้อมูลของโรงเรียนนั้น</p></div>
        <button onClick={() => setShowForm((value) => !value)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">+ เพิ่มโรงเรียน</button>
      </div>
      <div className="text-sm text-slate-500">โรงเรียนทั้งหมด {schools.length} แห่ง</div>
      {message && <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{message}</div>}
      {showForm && <form onSubmit={handleCreate} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2"><input name="name" required placeholder="ชื่อโรงเรียน" className="rounded-lg border px-3 py-2" /><input name="academic_year" required pattern="[0-9]{4}" placeholder="ปีการศึกษา เช่น 2569" className="rounded-lg border px-3 py-2" /><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-white sm:col-span-2">{busy ? "กำลังสร้าง..." : "สร้างและเข้าใช้งาน"}</button></form>}
      {registrations.length > 0 && <section className="rounded-xl border bg-white p-5"><h2 className="text-lg font-bold text-slate-800">คำขอสมัครโรงเรียน</h2><div className="mt-3 space-y-3">{registrations.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><div className="font-semibold">{item.school_name}</div><div className="text-sm text-slate-500">{item.contact_name} · {item.email} {item.phone && `· ${item.phone}`}</div></div><button disabled={busy} onClick={() => handleApprove(item.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white">อนุมัติ</button><button disabled={busy} onClick={async () => { setBusy(true); const result = await rejectRegistration(item.id); setBusy(false); if (!result.ok) setMessage(result.error || "ปฏิเสธไม่สำเร็จ"); else router.refresh(); }} className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700">ปฏิเสธ</button></div>)}</div></section>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {schools.map((school) => <div key={school.id} className={`rounded-xl border bg-white p-5 shadow-sm ${school.id === activeSchoolId ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-100"}`}><div className="text-lg font-bold text-slate-800">โรงเรียน{school.name || "ยังไม่ระบุชื่อ"}</div><div className="mt-1 text-sm text-slate-500">ปีการศึกษา {school.academic_year || "-"}</div><button disabled={busy || school.id === activeSchoolId} onClick={() => handleSwitch(school.id)} className="mt-4 rounded-lg border border-indigo-300 px-3 py-2 text-sm text-indigo-700 disabled:opacity-50">{school.id === activeSchoolId ? "กำลังใช้งาน" : "เข้าใช้งานโรงเรียนนี้"}</button></div>)}
      </div>
    </div>
  );
}
