import { requireProfile } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { getActiveSchool } from "@/lib/school-context";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (profile.role === "pending") redirect("/pending");
  const activeSchool = await getActiveSchool(profile);

  return (
    <div className="min-h-screen flex bg-slate-100">
      <Sidebar profile={profile} activeSchool={activeSchool} />
      <main className="flex-1 min-w-0 md:ml-0">
        <div className="w-full max-w-none p-4 md:p-6 pt-16 md:pt-6">{children}</div>
      </main>
    </div>
  );
}
