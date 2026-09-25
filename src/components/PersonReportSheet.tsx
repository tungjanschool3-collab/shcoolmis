import type { School, ClassRoom, SubjectCompetencyLevel } from "@/lib/types";
import type { StudentReport } from "@/lib/report-compute";
import { fullName } from "@/lib/types";
import ReportHeader from "@/components/ReportHeader";

function abilityForGrade(grade: number | null): string {
  if (grade === null) return "-";
  if (grade <= 0) return "ไม่ผ่าน";
  if (grade < 2) return "เริ่มต้น";
  if (grade < 3) return "พัฒนา";
  if (grade < 4) return "ชำนาญ";
  return "เชี่ยวชาญ";
}

function behaviorForGrade(grade: number | null, rubric?: SubjectCompetencyLevel): string {
  if (grade === null) return "-";
  if (grade <= 0) return "ไม่ผ่าน";
  if (!rubric) return abilityForGrade(grade);
  if (grade < 2) return rubric.beginner_text || "เริ่มต้น";
  if (grade < 3) return rubric.developing_text || "พัฒนา";
  if (grade < 4) return rubric.proficient_text || "ชำนาญ";
  return rubric.expert_text || "เชี่ยวชาญ";
}

function selectedGrade(
  row: StudentReport["rows"][number] | undefined,
  term: "1" | "2" | "year"
): number | null {
  if (!row) return null;
  return term === "1" ? row.sem1Grade : term === "2" ? row.sem2Grade : row.yearGrade;
}

function averageGrade(grades: (number | null)[]): number | null {
  const values = grades.filter((grade): grade is number => grade !== null);
  if (!values.length) return null;
  return values.reduce((sum, grade) => sum + grade, 0) / values.length;
}

export default function PersonReportSheet({
  school,
  cls,
  report,
  term,
  competencyLevels,
}: {
  school: School | null;
  cls: ClassRoom | null;
  report: StudentReport;
  term: "1" | "2" | "year";
  competencyLevels: SubjectCompetencyLevel[];
}) {
  const s = report.student;
  const isYear = term === "year";
  const title = "แบบรายงานผลการพัฒนาคุณภาพผู้เรียน" + (isYear ? "" : ` (ภาคเรียนที่ ${term})`);
  const rubricByOrder = new Map(competencyLevels.map((item) => [item.order_no, item]));
  const thai = report.rows.find((row) => row.subject.order_no === 1);
  const english = report.rows.find((row) => row.subject.order_no === 2);
  const math = report.rows.find((row) => row.subject.order_no === 3);
  const applied = report.rows.filter((row) => row.subject.category === "ประยุกต์");
  const termKey = term === "1" ? "sem1" : term === "2" ? "sem2" : "year";
  const languageGrade = averageGrade([
    selectedGrade(thai, term),
    selectedGrade(english, term),
  ]);
  const readingLevel = abilityForGrade(languageGrade);
  const writingLevel = abilityForGrade(languageGrade);
  const numeracyLevel = abilityForGrade(selectedGrade(math, term));
  const appliedLevel = abilityForGrade(
    averageGrade(applied.map((row) => selectedGrade(row, term)))
  );
  const activityLevel = report.activityLevels[termKey] || "-";
  const characteristicLevel = report.assessmentLevels.characteristic[termKey] || "-";
  const competencyLevel = report.assessmentLevels.competency[termKey] || "-";

  return (
    <>
      <div className="print-page sheet evaluation-sheet">
        <div className="report-page-number">หน้า 1</div>
        <ReportHeader school={school} cls={cls} title={title} />

        <div className="student-heading-line mt-2 mb-2 px-1">
          <span>เลขที่ <span className="underline px-4">{s.no}</span></span>
          <span className="student-name">ชื่อ - สกุล <span className="underline px-3">{fullName(s)}</span></span>
        </div>

        <table className="report-table evaluation-report-table">
        <thead>
          <tr>
            <th style={{ width: "5%" }}>ที่</th>
            <th style={{ width: "17%" }}>รายวิชา</th>
            <th style={{ width: "10%" }}>ผลการเรียน</th>
            <th style={{ width: "18%" }}>ความสามารถที่ได้</th>
            <th style={{ width: "50%" }}>คำอธิบายพฤติกรรม</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => {
            const grade = isYear ? r.yearGrade : term === "1" ? r.sem1Grade : r.sem2Grade;
            const score = isYear ? r.yearAvg : term === "1" ? r.sem1Total : r.sem2Total;
            const rubric = rubricByOrder.get(r.subject.order_no);
            return (
              <tr key={r.subject.id}>
                <td className="text-center">{r.subject.order_no}</td>
                <td>{r.subject.name}</td>
                <td className="text-center font-semibold">{score ?? "-"}</td>
                <td className="text-center font-semibold">{abilityForGrade(grade)}</td>
                <td>{behaviorForGrade(grade, rubric)}</td>
              </tr>
            );
          })}
        </tbody>
        </table>

        <div className="grow" />

        <div className="grid grid-cols-3 gap-8 mt-5 text-center text-[12px] report-signatures">
        <div>
          <div>ลงชื่อ ...................................................</div>
          <div className="mt-1">( {cls?.homeroom_teacher_name || "..............................."} )</div>
          <div>ครูประจำชั้น</div>
        </div>
        <div>
          <div>ลงชื่อ ...................................................</div>
          <div className="mt-1">( {school?.academic_head || "..............................."} )</div>
          <div>หัวหน้าวิชาการ</div>
        </div>
        <div>
          <div>ลงชื่อ ...................................................</div>
          <div className="mt-1">( {school?.director || "..............................."} )</div>
          <div>{school?.director_position || `ผู้อำนวยการโรงเรียน${school?.name || ""}`}</div>
        </div>
        </div>
      </div>

      <div className="print-page sheet evaluation-sheet summary-sheet">
        <div className="report-page-number">หน้า 2</div>
        <ReportHeader
          school={school}
          cls={cls}
          title={title}
        />

        <div className="student-heading-line mt-2 mb-2 px-1">
          <span>เลขที่ <span className="underline px-4">{s.no}</span></span>
          <span className="student-name">ชื่อ - สกุล <span className="underline px-3">{fullName(s)}</span></span>
        </div>

        <table className="report-table summary-report-table">
          <thead>
            <tr>
              <th style={{ width: "5%" }}>ที่</th>
              <th colSpan={2} style={{ width: "45%" }}>ความสามารถ/กิจกรรม</th>
              <th style={{ width: "18%" }}>ระดับ<br />ความสามารถที่คาดหวัง</th>
              <th style={{ width: "18%" }}>ระดับ<br />ความสามารถที่ได้</th>
              <th style={{ width: "14%" }}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td rowSpan={3} className="text-center">1</td>
              <td rowSpan={3} className="text-center font-semibold">ความสามารถพื้นฐาน<br />ด้านการเรียนรู้</td>
              <td>การอ่าน</td>
              <td rowSpan={3} className="text-center font-semibold">{s.expected_basic_level || "ชำนาญ"}</td>
              <td className="text-center font-semibold">{readingLevel}</td>
              <td></td>
            </tr>
            <tr>
              <td>การเขียน</td>
              <td className="text-center font-semibold">{writingLevel}</td>
              <td></td>
            </tr>
            <tr>
              <td>การคิดคำนวณ</td>
              <td className="text-center font-semibold">{numeracyLevel}</td>
              <td></td>
            </tr>
            <tr>
              <td className="text-center">2</td>
              <td colSpan={2}>ความสามารถในการประยุกต์ใช้ในชีวิตประจำวัน</td>
              <td className="text-center font-semibold">{s.expected_applied_level || "ชำนาญ"}</td>
              <td className="text-center font-semibold">{appliedLevel}</td>
              <td></td>
            </tr>
            <tr>
              <td className="text-center">3</td>
              <td colSpan={2}>กิจกรรมพัฒนาผู้เรียน</td>
              <td className="text-center font-semibold">{s.expected_activity_level || "ผ่าน"}</td>
              <td className="text-center font-semibold">{activityLevel}</td>
              <td></td>
            </tr>
            <tr>
              <td className="text-center">4</td>
              <td colSpan={2}>คุณลักษณะอันพึงประสงค์</td>
              <td className="text-center">{s.expected_characteristic_level || "กำหนด"}</td>
              <td className="text-center font-semibold">{characteristicLevel}</td>
              <td></td>
            </tr>
            <tr>
              <td className="text-center">5</td>
              <td colSpan={2}>สมรรถนะของผู้เรียน</td>
              <td className="text-center">{s.expected_competency_level || "กำหนด"}</td>
              <td className="text-center font-semibold">{competencyLevel}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div className="teacher-comment">
          <div className="teacher-comment-title">ความคิดเห็นครูประจำชั้น</div>
          <div className="teacher-comment-line"></div>
          <div className="teacher-comment-line"></div>
          <div className="teacher-comment-line"></div>
        </div>

        <div className="summary-signature text-center text-[13px]">
          <div className="signature-line">ลงชื่อ ...................................................</div>
          <div className="mt-1">( {cls?.homeroom_teacher_name || "..............................."} )</div>
          <div>ครูประจำชั้น</div>
        </div>
        <div className="grow" />
      </div>
    </>
  );
}
