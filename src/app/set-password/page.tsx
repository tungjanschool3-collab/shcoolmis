"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const confirm = String(data.get("confirm") || "");
    if (password.length < 10 || password !== confirm) return setError("รหัสผ่านอย่างน้อย 10 ตัวอักษรและต้องตรงกัน");
    setBusy(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(updateError.message);
    router.replace("/dashboard");
    router.refresh();
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-lg"><h1 className="text-2xl font-bold">ตั้งรหัสผ่าน</h1><p className="mt-2 text-sm text-slate-500">ตั้งรหัสผ่านสำหรับบัญชีที่ได้รับคำเชิญ</p><input name="password" type="password" minLength={10} required placeholder="รหัสผ่านใหม่" className="mt-5 w-full rounded-lg border px-3 py-2" /><input name="confirm" type="password" minLength={10} required placeholder="ยืนยันรหัสผ่าน" className="mt-3 w-full rounded-lg border px-3 py-2" />{error && <p className="mt-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="mt-5 w-full rounded-lg bg-indigo-600 py-2.5 text-white">{busy ? "กำลังบันทึก..." : "บันทึกรหัสผ่าน"}</button></form></main>;
}
