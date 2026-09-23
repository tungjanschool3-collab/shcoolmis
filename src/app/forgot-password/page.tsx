"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=/set-password`;
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    if (resetError) return setError("ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่อีกครั้ง");
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-100 to-indigo-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-800">ลืมรหัสผ่าน</h1>
        <p className="mt-2 text-sm text-slate-500">กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่</p>
        <label className="mt-5 block text-sm font-medium text-slate-700">อีเมล</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {sent && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">ส่งลิงก์แล้ว กรุณาตรวจสอบอีเมล</p>}
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={busy || sent} className="mt-5 w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white disabled:opacity-60">
          {busy ? "กำลังส่ง..." : sent ? "ส่งลิงก์แล้ว" : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
        </button>
        <div className="mt-4 text-center text-sm">
          <Link href="/login" className="font-medium text-indigo-700 hover:underline">กลับหน้าเข้าสู่ระบบ</Link>
        </div>
      </form>
    </main>
  );
}
