import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { signOut } from "@/app/(app)/actions";

export default async function PendingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "pending") redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="max-w-lg rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">รอการอนุมัติโรงเรียน</h1>
        <p className="mt-3 text-slate-600">ยืนยันอีเมลเรียบร้อยแล้ว ผู้ดูแลระบบกลางกำลังตรวจสอบคำขอ เมื่ออนุมัติแล้วจึงจะเข้าถึงข้อมูลโรงเรียนได้</p>
        <form action={signOut}><button className="mt-6 rounded-lg border px-4 py-2 text-sm text-slate-700">ออกจากระบบ</button></form>
      </div>
    </main>
  );
}
