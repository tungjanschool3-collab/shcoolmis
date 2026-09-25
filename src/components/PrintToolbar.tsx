"use client";

import { useEffect, useState } from "react";

const THAI_DIGIT_ZERO = "๐".charCodeAt(0);

function useArabicDigitsForPrint() {
  useEffect(() => {
    const normalizePrintPages = () => {
      document.querySelectorAll<HTMLElement>(".print-page").forEach((page) => {
        const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          if (/[๐-๙]/.test(node.nodeValue || "")) {
            node.nodeValue = (node.nodeValue || "").replace(/[๐-๙]/g, (digit) =>
              String(digit.charCodeAt(0) - THAI_DIGIT_ZERO),
            );
          }
          node = walker.nextNode();
        }
      });
    };

    window.addEventListener("beforeprint", normalizePrintPages);
    return () => window.removeEventListener("beforeprint", normalizePrintPages);
  }, []);
}

export default function PrintToolbar({ title }: { title: string }) {
  useArabicDigitsForPrint();
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    const updatePageCount = () =>
      setPageCount(document.querySelectorAll(".print-page").length);

    updatePageCount();
    const observer = new MutationObserver(updatePageCount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="print-toolbar no-print sticky top-0 z-10 bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between">
      <div className="text-sm">
        <button onClick={() => window.close()} className="text-slate-300 hover:text-white mr-3">✕ ปิด</button>
        <span>{title}</span>
        {pageCount > 0 && (
          <span className="ml-3 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
            ตัวอย่าง {pageCount} หน้า
          </span>
        )}
      </div>
      <button
        onClick={async () => {
          window.dispatchEvent(new Event("beforeprint"));
          await document.fonts.ready;
          await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => undefined)));
          window.print();
        }}
        className="rounded-lg bg-indigo-500 hover:bg-indigo-400 px-4 py-1.5 text-sm font-medium"
      >
        🖨️ พิมพ์ทุกหน้า / บันทึกเป็น PDF
      </button>
    </div>
  );
}
