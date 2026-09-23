"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";
import { createTeacher, resetPassword, setActive, deleteTeacher } from "./actions";
import { usePasswordDelete } from "@/components/PasswordDeleteGuard";

export default function TeachersClient({ teachers }: { teachers: Profile[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const { requestDelete, deletePasswordDialog } = usePasswordDelete();

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await createTeacher(fd);
    setBusy(false);
    if (res.ok) {
      setMsg({ type: "ok", text: "เพิ่มครูสำเร็จ" });
      (e.target as HTMLFormElement).reset();
      setShowForm(false);
      refresh();
    } else {
      setMsg({ type: "err", text: res.error || "เกิดข้อผิดพลาด" });
    }
  }

  async function handleReset(t: Profile) {
    const pw = prompt(`ตั้งรหัสผ่านใหม่สำหรับ ${t.username}`);
    if (!pw) return;
    const res = await resetPassword(t.id, pw);
    setMsg(res.ok ? { type: "ok", text: "เปลี่ยนรหัสผ่านสำเร็จ" } : { type: "err", text: res.error! });
  }

  async function handleToggle(t: Profile) {
    const res = await setActive(t.id, !t.is_active);
    if (res.ok) refresh();
    else setMsg({ type: "err", text: res.error! });
  }

  function handleDelete(t: Profile) {
    requestDelete({
      title: "ยืนยันการลบครู",
      description: `ลบครู ${t.full_name || t.username}? การกระทำนี้ย้อนกลับไม่ได้`,
      onVerified: async () => {
        const res = await deleteTeacher(t.id);
        if (res.ok) refresh();
        else setMsg({ type: "err", text: res.error! });
      },
    });
  }

  return (
    <div className="space-y-5">
      {deletePasswordDialog}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">จัดการครู</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
        >
          {showForm ? "ปิด" : "+ เพิ่มครู"}
        </button>
      </div>

      {msg && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 grid sm:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">อีเมลจริง *</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="teacher@school.ac.th"
            />
            <p className="text-xs text-slate-400 mt-1">ระบบจะส่งลิงก์เชิญให้ครูตั้งรหัสผ่านเอง</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ-นามสกุล</label>
            <input
              name="full_name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="เช่น นางโสภิตรา จิตชู"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ตำแหน่ง</label>
            <input
              name="position"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="เช่น ครูชำนาญการ"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">สิทธิ์</label>
            <select name="role" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="teacher">ครู</option>
              <option value="school_admin">ผู้ดูแลโรงเรียน</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button
              disabled={busy}
              className="rounded-lg bg-indigo-600 text-white px-5 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">ชื่อผู้ใช้</th>
              <th className="text-left px-4 py-3">ชื่อ-นามสกุล</th>
              <th className="text-left px-4 py-3">ตำแหน่ง</th>
              <th className="text-left px-4 py-3">สิทธิ์</th>
              <th className="text-left px-4 py-3">สถานะ</th>
              <th className="text-right px-4 py-3">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{t.username}</td>
                <td className="px-4 py-3">{t.full_name || "-"}</td>
                <td className="px-4 py-3 text-slate-500">{t.position || "-"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      ["platform_owner", "school_admin", "admin"].includes(t.role) ? "bg-purple-100 text-purple-700" : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {t.role === "platform_owner" ? "ผู้ดูแลระบบกลาง" : ["school_admin", "admin"].includes(t.role) ? "ผู้ดูแลโรงเรียน" : "ครู"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={t.is_active ? "text-emerald-600" : "text-slate-400"}>
                    {t.is_active ? "ใช้งาน" : "ระงับ"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                  <button onClick={() => handleReset(t)} className="text-indigo-600 hover:underline">
                    รีเซ็ตรหัส
                  </button>
                  <button onClick={() => handleToggle(t)} className="text-amber-600 hover:underline">
                    {t.is_active ? "ระงับ" : "เปิด"}
                  </button>
                  {t.username !== "admin" && (
                    <button onClick={() => handleDelete(t)} className="text-rose-600 hover:underline">
                      ลบ
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  ยังไม่มีข้อมูลครู
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        ครูจะได้รับอีเมลเชิญและตั้งรหัสผ่านด้วยตนเอง
      </p>
    </div>
  );
}
