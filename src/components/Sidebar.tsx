"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Profile, School } from "@/lib/types";
import { signOut } from "@/app/(app)/actions";

const nav = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: "🏠", adminOnly: false },
  { href: "/schools", label: "จัดการโรงเรียน", icon: "🏢", adminOnly: true },
  { href: "/classes", label: "ห้องเรียน", icon: "🏫", adminOnly: false },
  { href: "/teachers", label: "จัดการครู", icon: "👩‍🏫", adminOnly: true },
  { href: "/settings", label: "ข้อมูลโรงเรียน", icon: "⚙️", adminOnly: true },
];

export default function Sidebar({ profile, activeSchool }: { profile: Profile; activeSchool: School | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = nav.filter((n) => !n.adminOnly || profile.role === "admin");
  const classMatch = pathname.match(/^\/classes\/([^/]+)/);
  const reportsHref = classMatch ? `/classes/${classMatch[1]}/reports` : null;
  if (reportsHref) {
    const classesIndex = items.findIndex((item) => item.href === "/classes");
    items.splice(classesIndex + 1, 0, {
      href: reportsHref,
      label: "รายงาน/การพิมพ์",
      icon: "🖨️",
      adminOnly: false,
    });
  }

  return (
    <>
      {/* ปุ่มเมนูมือถือ */}
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden fixed top-3 left-3 z-30 bg-white rounded-lg shadow p-2 no-print"
        aria-label="เมนู"
      >
        ☰
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 bg-black/30 z-30 no-print" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`no-print fixed md:static z-40 top-0 left-0 h-full w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="px-5 py-5 border-b border-slate-700">
          <div className="font-bold text-lg">ระบบตัดเกรด ปพ.5</div>
          <div className="text-xs text-slate-400 mt-1">หลักสูตรใหม่ 2568</div>
          <div className="mt-2 truncate text-xs text-indigo-200">{activeSchool?.name ? `โรงเรียน${activeSchool.name}` : "ยังไม่ได้เลือกโรงเรียน"}</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map((n) => {
            const isReportsItem = n.href === reportsHref;
            const active = isReportsItem
              ? pathname.startsWith(n.href)
              : n.href === "/classes"
                ? pathname.startsWith("/classes") && !pathname.includes("/reports")
                : pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  active ? "bg-indigo-600 text-white" : "hover:bg-slate-800 text-slate-200"
                }`}
              >
                <span>{n.icon}</span>
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-700">
          <div className="text-sm font-medium">{profile.full_name || profile.username}</div>
          <div className="text-xs text-slate-400 mb-3">
            {profile.role === "admin" ? "ผู้ดูแลระบบ" : "ครู"}
          </div>
          <form action={signOut}>
            <button className="w-full text-left text-sm text-rose-300 hover:text-rose-200">
              ออกจากระบบ →
            </button>
          </form>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] leading-relaxed text-slate-500">
            <div>ผู้พัฒนาระบบ</div>
            <div className="text-slate-400">นางโสภิตรา จิตชู</div>
          </div>
        </div>
      </aside>
    </>
  );
}
