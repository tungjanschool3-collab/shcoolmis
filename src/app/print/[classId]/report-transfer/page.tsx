import { loadClassBundle } from "@/lib/report-data";
import {
  computeTransferReport,
  rankByGpaTransfer,
  type TransferRow,
  type TransferTerm,
} from "@/lib/report-compute";
import { gradeText } from "@/lib/grading";
import { fullName } from "@/lib/types";
import PrintToolbar from "@/components/PrintToolbar";
import ReportHeader from "@/components/ReportHeader";

export const dynamic = "force-dynamic";

function num(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "-";
  return String(Math.round(v * 100) / 100);
}

function termLabel(term: TransferTerm): string {
  return term === "year" ? "รายปี" : `ภาคเรียนที่ ${term}`;
}

function TransferRowsTable({
  rows,
  year,
  term,
  blankRows = 0,
}: {
  rows: TransferRow[];
  year: string;
  term: TransferTerm;
  blankRows?: number;
}) {
  const showCode = term === "year";
  return (
    <table className="report-table transfer-report-table">
      <colgroup>
        <col style={{ width: showCode ? "6%" : "7%" }} />
        {showCode && <col style={{ width: "11%" }} />}
        <col style={{ width: showCode ? "29%" : "37%" }} />
        <col style={{ width: "11%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: showCode ? "11%" : "12%" }} />
        <col style={{ width: showCode ? "11%" : "12%" }} />
        <col style={{ width: "11%" }} />
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={3}>ที่</th>
          {showCode && <th rowSpan={3}>รหัสวิชา</th>}
          <th rowSpan={3}>ชื่อวิชา</th>
          <th rowSpan={3}>ประเภท<br />วิชา</th>
          <th rowSpan={3}><span className="vtext">น้ำหนัก</span></th>
          <th colSpan={2}>{term === "year" ? "ปีการศึกษา" : "ภาคเรียนที่"}</th>
          <th rowSpan={3}><span className="vtext">ผลเทียบโอน</span></th>
        </tr>
        <tr><th colSpan={2}>{term === "year" ? year : term}</th></tr>
        <tr>
          <th><span className="vtext">คะแนน</span></th>
          <th><span className="vtext">เกรด</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.transferSubject.id}>
            <td className="text-center">{r.transferSubject.order_no}</td>
            {showCode && <td className="text-center">{r.transferSubject.code}</td>}
            <td className="transfer-subject-name">{r.transferSubject.name}</td>
            <td className="text-center">{r.transferSubject.category}</td>
            <td className="text-center">{r.transferSubject.credits}</td>
            <td className="text-center">{num(r.score)}</td>
            <td className="text-center font-semibold">{gradeText(r.grade) || "-"}</td>
            <td></td>
          </tr>
        ))}
        {Array.from({ length: blankRows }).map((_, i) => (
          <tr key={`blank-${i}`}>
            <td>&nbsp;</td>{showCode && <td></td>}<td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function ReportTransferPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  const { classId } = await params;
  const { term = "1" } = await searchParams;
  const selectedTerm = (term === "2" || term === "year" ? term : "1") as TransferTerm;
  const bundle = await loadClassBundle(classId);
  const { school, cls, students } = bundle;
  const year = cls?.academic_year || school?.academic_year || "";

  const reports = students.map((s) => computeTransferReport(bundle, s, selectedTerm));
  const ranks = rankByGpaTransfer(reports);
  const reportTitle = `แบบเทียบโอนผลการพัฒนาคุณภาพผู้เรียน${selectedTerm === "year" ? "" : ` (ภาคเรียนที่ ${selectedTerm})`}`;

  if (bundle.transferSubjects.filter((t) => t.enabled).length === 0) {
    return (
      <>
        <PrintToolbar title={`รายงานเทียบโอน (${termLabel(selectedTerm)})`} />
        <div className="print-page text-center text-slate-500 pt-20">
          ยังไม่ได้ตั้งค่าวิชาเทียบโอนของห้องนี้ — ไปที่แท็บ “เทียบโอน 2560” เพื่อเลือกวิชาและจับคู่ก่อน
        </div>
      </>
    );
  }

  return (
    <>
      <PrintToolbar title={`แบบเทียบโอนผลการพัฒนาคุณภาพผู้เรียน (${termLabel(selectedTerm)})`} />
      <div className="py-4 print:py-0">
        {reports.map((rep) => {
          const student = rep.student;
          return (
            <div key={student.id} className="print-page sheet transfer-sheet transfer-single-page">
                <ReportHeader school={school} cls={cls} title={reportTitle} />
                <div className="student-heading-line mt-1 mb-2 px-1">
                  <span>เลขที่ <span className="underline px-4">{student.no}</span></span>
                  <span className="student-name">ชื่อ - นามสกุล <span className="underline px-3">{fullName(student)}</span></span>
                </div>
                <TransferRowsTable
                  rows={rep.rows}
                  year={year}
                  term={selectedTerm}
                  blankRows={Math.max(0, 12 - rep.rows.length)}
                />
                <table className="report-table transfer-gpa-table">
                          <tbody>
                            <tr>
                              <td colSpan={4} style={{ width: "65%" }} className="text-center font-semibold">ผลการเรียนเฉลี่ย</td>
                              <td className="text-center font-bold">{rep.gpa !== null ? rep.gpa.toFixed(2) : "-"}</td>
                              <td className="text-center font-semibold">ลำดับที่</td>
                              <td className="text-center font-semibold">{ranks.get(student.id) ?? "-"}</td>
                            </tr>
                          </tbody>
                        </table>

                <table className="report-table transfer-summary-table mt-3">
                          <thead>
                            <tr><th colSpan={3}>สรุปผลการประเมินด้านต่าง ๆ</th></tr>
                            <tr>
                              <th>คุณลักษณะอันพึงประสงค์</th>
                              <th>สมรรถนะของผู้เรียน</th>
                              <th>กิจกรรมพัฒนาผู้เรียน</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="text-center">
                              <td>{rep.characteristicLevel || "-"}</td>
                              <td>{rep.competencyLevel || "-"}</td>
                              <td>{rep.activityOverall || "-"}</td>
                            </tr>
                          </tbody>
                        </table>

                <div className="grid grid-cols-2 gap-16 mt-3 text-center transfer-signatures">
                          <div>
                            <div className="text-left font-semibold">ลงชื่อ ...................................................</div>
                            <div className="mt-2">( {cls?.homeroom_teacher_name || "..............................."} )</div>
                            <div>ครูประจำชั้น</div>
                          </div>
                          <div>
                            <div className="text-left font-semibold">ลงชื่อ ...................................................</div>
                            <div className="mt-2">( {school?.academic_head || "..............................."} )</div>
                            <div>หัวหน้าฝ่ายวิชาการ</div>
                          </div>
                        </div>

                <div className="text-center mt-4 transfer-signatures">
                          <div><span className="font-semibold">ลงชื่อ</span> ...................................................</div>
                          <div className="mt-2">( {school?.director || "..............................."} )</div>
                          <div>{school?.director_position || `ผู้อำนวยการโรงเรียน${school?.name || ""}`}</div>
                        </div>
            </div>
          );
        })}
        {students.length === 0 && (
          <div className="print-page text-center text-slate-400 pt-20">ยังไม่มีนักเรียนในห้องนี้</div>
        )}
      </div>
    </>
  );
}
