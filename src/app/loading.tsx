export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/35 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="กำลังโหลดหน้า"
    >
      <div className="flex min-w-48 flex-col items-center gap-4 rounded-2xl bg-white px-8 py-7 shadow-2xl">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
        <p className="font-medium text-slate-700">กำลังโหลด...</p>
      </div>
    </div>
  );
}
