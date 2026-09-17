import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import { Suspense } from "react";
import RouteLoadingOverlay from "@/components/RouteLoadingOverlay";
import "./globals.css";

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sarabun",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ระบบตัดเกรด ปพ.5",
  description: "ระบบบันทึกผลการเรียนและออกรายงาน ปพ.5",
  authors: [{ name: "นางโสภิตรา จิตชู" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body>
        <Suspense fallback={null}>
          <RouteLoadingOverlay />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
