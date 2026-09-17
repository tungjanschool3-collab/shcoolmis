"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function RouteLoadingOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLoading = () => {
    setIsLoading(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsLoading(false), 10000);
  };

  useEffect(() => {
    setIsLoading(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      const isSameDocument =
        destination.pathname === current.pathname &&
        destination.search === current.search;

      if (destination.origin !== current.origin || isSameDocument) return;
      startLoading();
    };

    const handleBackOrForward = () => startLoading();

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handleBackOrForward);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handleBackOrForward);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!isLoading) return null;

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
