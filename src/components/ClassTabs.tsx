"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ClassTabs({ classId }: { classId: string }) {
  const pathname = usePathname();
  const base = `/classes/${classId}`;
  const tabs = [
    { href: base, label: "ภาพรวม", icon: "📊", color: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100", activeColor: "border-sky-500 bg-sky-500 text-white shadow-sky-200" },
    { href: `${base}/students`, label: "นักเรียน", icon: "👨‍🎓", color: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100", activeColor: "border-emerald-500 bg-emerald-500 text-white shadow-emerald-200" },
    { href: `${base}/subjects`, label: "รายวิชา 2568", icon: "📚", color: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100", activeColor: "border-violet-500 bg-violet-500 text-white shadow-violet-200" },
    { href: `${base}/competency-levels`, label: "เกณฑ์ความสามารถ", icon: "🎯", color: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100", activeColor: "border-amber-500 bg-amber-500 text-white shadow-amber-200" },
    { href: `${base}/grades`, label: "กรอกคะแนน", icon: "✏️", color: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100", activeColor: "border-rose-500 bg-rose-500 text-white shadow-rose-200" },
    { href: `${base}/competencies`, label: "สมรรถนะผู้เรียน", icon: "⭐", color: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100", activeColor: "border-indigo-500 bg-indigo-500 text-white shadow-indigo-200" },
    { href: `${base}/characteristics`, label: "คุณลักษณะฯ", icon: "💎", color: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100", activeColor: "border-fuchsia-500 bg-fuchsia-500 text-white shadow-fuchsia-200" },
    { href: `${base}/readwrite`, label: "พื้นฐานและประยุกต์", icon: "📝", color: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100", activeColor: "border-cyan-500 bg-cyan-500 text-white shadow-cyan-200" },
    { href: `${base}/activities`, label: "กิจกรรมพัฒนาผู้เรียน", icon: "🏃", color: "border-lime-200 bg-lime-50 text-lime-700 hover:bg-lime-100", activeColor: "border-lime-500 bg-lime-500 text-white shadow-lime-200" },
    { href: `${base}/attendance`, label: "ปฏิทิน/เวลาเรียน", icon: "📅", color: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100", activeColor: "border-orange-500 bg-orange-500 text-white shadow-orange-200" },
    { href: `${base}/transfer`, label: "เทียบโอน 2560", icon: "🔄", color: "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100", activeColor: "border-teal-500 bg-teal-500 text-white shadow-teal-200" },
  ];

  return (
    <div className="no-print my-4 flex gap-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex min-w-36 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-4 py-3 text-center text-sm font-semibold transition-all duration-200 ${
              active ? `${t.activeColor} shadow-lg -translate-y-0.5` : t.color
            }`}
          >
            <span className="text-xl" aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
