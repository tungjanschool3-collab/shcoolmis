import Link from "next/link";
import { loadClassBundle } from "@/lib/report-data";
import { computeStudentReport, type StudentSubjectRow } from "@/lib/report-compute";
import { fullName } from "@/lib/types";

type Term = "1" | "2" | "year";

function selectedGrade(row: StudentSubjectRow | undefined, term: Term): number | null {
  if (!row) return null;
  return term === "1" ? row.sem1Grade : term === "2" ? row.sem2Grade : row.yearGrade;
}

function averageGrade(grades: (number | null)[]): number | null {
  const values = grades.filter((grade): grade is number => grade !== null);
  if (!values.length) return null;
  return values.reduce((sum, grade) => sum + grade, 0) / values.length;
}

function abilityLevel(grade: number | null): string {
  if (grade === null) return "-";
  if (grade < 2) return "เริ่มต้น";
  if (grade < 3) return "พัฒนา";
  if (grade < 4) return "ชำนาญ";
  return "เชี่ยวชาญ";
}

function gradeDisplay(grade: number | null): string {
  if (grade === null) return "-";
  return Number.isInteger(grade) ? String(grade) : grade.toFixed(2).replace(/0$/, "");
}

export default async function ReadWritePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  const { id } = await params;
  const { term: requestedTerm } = await searchParams;
  const term: Term = requestedTerm === "1" || requestedTerm === "2" ? requestedTerm : "year";
  const bundle = await loadClassBundle(id);
  const reports = bundle.students.map((student) => computeStudentReport(bundle, student));
  const termLabel = term === "1" ? "ภาคเรียนที่ 1" : term === "2" ? "ภาคเรียนที่ 2" : "รายปี";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-700">การประเมินความสามารถพื้นฐานและการประยุกต์</h1>
        <p className="mt-1 text-sm text-slate-500">ระบบดึงเกรดรายวิชามาคำนวณอัตโนมัติ แล้วแปลงเป็นระดับ เริ่มต้น พัฒนา ชำนาญ และเชี่ยวชาญ</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["การอ่าน", "ค่าเฉลี่ยเกรดภาษาไทยและภาษาอังกฤษ"],
          ["การเขียน", "ค่าเฉลี่ยเกรดภาษาไทยและภาษาอังกฤษ"],
          ["การคิดคำนวณ", "เกรดวิชาคณิตศาสตร์"],
          ["การประยุกต์ใช้", "ค่าเฉลี่ยเกรดของทุกวิชาประเภทประยุกต์"],
        ].map(([title, description], index) => (
          <div key={title} className="rounded-xl border border-cyan-100 bg-cyan-50 p-4">
            <div className="text-xs font-semibold text-cyan-600">ข้อ {index + 1}</div>
            <div className="mt-1 font-semibold text-slate-700">{title}</div>
            <div className="mt-1 text-sm text-slate-500">{description}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-600">ผลการประเมิน: {termLabel}</div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          {(["1", "2", "year"] as Term[]).map((value) => (
            <Link key={value} href={`/classes/${id}/readwrite?term=${value}`} className={`rounded-md px-3 py-1.5 text-sm ${term === value ? "bg-cyan-600 font-semibold text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {value === "year" ? "รายปี" : `ภาค ${value}`}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-3 text-center">ที่</th>
              <th className="px-3 py-3 text-left">ชื่อ - นามสกุล</th>
              <th className="px-3 py-3 text-center">การอ่าน<br /><span className="font-normal">เกรดเฉลี่ย / ระดับ</span></th>
              <th className="px-3 py-3 text-center">การเขียน<br /><span className="font-normal">เกรดเฉลี่ย / ระดับ</span></th>
              <th className="px-3 py-3 text-center">การคิดคำนวณ<br /><span className="font-normal">เกรด / ระดับ</span></th>
              <th className="px-3 py-3 text-center">การประยุกต์ใช้<br /><span className="font-normal">เกรดเฉลี่ย / ระดับ</span></th>
              <th className="px-3 py-3 text-center">ระดับพื้นฐาน<br />ที่คาดหวัง</th>
              <th className="px-3 py-3 text-center">ระดับประยุกต์<br />ที่คาดหวัง</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reports.map((report) => {
              const thai = report.rows.find((row) => row.subject.order_no === 1);
              const english = report.rows.find((row) => row.subject.order_no === 2);
              const math = report.rows.find((row) => row.subject.order_no === 3);
              const applied = report.rows.filter((row) => row.subject.category === "ประยุกต์");
              const languageGrade = averageGrade([selectedGrade(thai, term), selectedGrade(english, term)]);
              const mathGrade = selectedGrade(math, term);
              const appliedGrade = averageGrade(applied.map((row) => selectedGrade(row, term)));
              const result = (grade: number | null) => <><span className="font-semibold text-slate-700">{gradeDisplay(grade)}</span><br /><span className="text-cyan-700">{abilityLevel(grade)}</span></>;

              return (
                <tr key={report.student.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-3 text-center">{report.student.no}</td>
                  <td className="px-3 py-3 font-medium text-slate-700">{fullName(report.student)}</td>
                  <td className="px-3 py-3 text-center">{result(languageGrade)}</td>
                  <td className="px-3 py-3 text-center">{result(languageGrade)}</td>
                  <td className="px-3 py-3 text-center">{result(mathGrade)}</td>
                  <td className="px-3 py-3 text-center">{result(appliedGrade)}</td>
                  <td className="px-3 py-3 text-center">{report.student.expected_basic_level || "-"}</td>
                  <td className="px-3 py-3 text-center">{report.student.expected_applied_level || "-"}</td>
                </tr>
              );
            })}
            {!reports.length && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">ยังไม่มีนักเรียนในห้องนี้</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold">เกณฑ์แปลงเกรดเป็นระดับความสามารถ</div>
        <div className="mt-1">ต่ำกว่า 2 = เริ่มต้น · ตั้งแต่ 2 แต่ต่ำกว่า 3 = พัฒนา · ตั้งแต่ 3 แต่ต่ำกว่า 4 = ชำนาญ · ตั้งแต่ 4 = เชี่ยวชาญ</div>
        <div className="mt-1 text-amber-700">ถ้าไม่มีเกรดจะแสดงเครื่องหมาย - และไม่นำวิชานั้นเข้าคำนวณค่าเฉลี่ย</div>
      </div>
    </div>
  );
}
