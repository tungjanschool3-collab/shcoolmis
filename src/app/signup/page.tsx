"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const schoolName = String(form.get("school_name") || "").trim();
    const contactName = String(form.get("contact_name") || "").trim();
    const phone = String(form.get("phone") || "").trim();

    if (password.length < 10) {
      setError("รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { school_name: schoolName, contact_name: contactName, phone },
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setMessage("ส่งลิงก์ยืนยันไปยังอีเมลแล้ว หลังยืนยันคำขอจะรอผู้ดูแลระบบอนุมัติ");
    event.currentTarget.reset();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-7 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">สมัครใช้งานสำหรับโรงเรียน</h1>
        <p className="mt-2 text-sm text-slate-600">ใช้อีเมลจริงเพื่อรับลิงก์ยืนยันและติดตามการอนุมัติ</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">ชื่อโรงเรียน<input name="school_name" required className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <label className="block text-sm font-medium">ชื่อผู้รับผิดชอบ<input name="contact_name" required className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <label className="block text-sm font-medium">เบอร์โทรศัพท์<input name="phone" inputMode="tel" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <label className="block text-sm font-medium">อีเมล<input name="email" type="email" autoComplete="email" required className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <label className="block text-sm font-medium">รหัสผ่าน<input name="password" type="password" autoComplete="new-password" minLength={10} required className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
          <button disabled={loading} className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white disabled:opacity-60">{loading ? "กำลังสมัคร..." : "สมัครและส่งอีเมลยืนยัน"}</button>
        </form>
        <Link href="/login" className="mt-5 block text-center text-sm text-indigo-700 hover:underline">กลับไปหน้าเข้าสู่ระบบ</Link>
      </div>
    </main>
  );
}
