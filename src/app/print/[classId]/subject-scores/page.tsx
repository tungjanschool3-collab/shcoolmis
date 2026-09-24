import { loadClassBundle } from "@/lib/report-data";
import { computeSubjectResult, gradeText } from "@/lib/grading";
import { fullName } from "@/lib/types";
import PrintToolbar from "@/components/PrintToolbar";

export const dynamic = "force-dynamic";

function n2(v: number | null): string {
  return v === null || Number.isNaN(v) ? "" : v.toFixed(2);
}

export default async function SubjectScoresPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const bundle = await loadClassBundle(classId);
  const { school, cls, students, subjects, subjectScores, criteria } = bundle;

  const scoreOf = (studentId: string, subjectId: string) =>
    subjectScores.find((s) => s.student_id === studentId && s.subject_id === subjectId);

  return (
    <>
      <PrintToolbar title="ตารางคะแนนรายวิชา" />
      <div className="py-4 print:py-0">
        {subjects.flatMap((subject) => Array.from({ length: Math.max(1, Math.ceil(students.length / 30)) }, (_, pageIndex) => (
          <div key={`${subject.id}-${pageIndex}`} className="print-page score-sheet">
            <header className="plain-form-header">
              <div className="plain-form-title">รายวิชา{subject.category === "เพิ่มเติม" ? "เพิ่มเติม" : "พื้นฐาน"} : {subject.name} คะแนนเฉลี่ย</div>
              <div className="plain-form-context">{cls?.grade_level} {cls?.room ? `ห้อง ${cls.room}` : ""} ปีการศึกษา {cls?.academic_year || school?.academic_year}</div>
            </header>
            <table className="report-table score-table">
              <colgroup>
                <col style={{ width: "4.5%" }} />
                <col style={{ width: "26%" }} />
                {Array.from({ length: 8 }, (_, i) => <col key={`score-${i}`} style={{ width: "5.25%" }} />)}
                <col style={{ width: "7%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "7.25%" }} />
                <col style={{ width: "7.25%" }} />
              </colgroup>
              <thead>
                <tr><th rowSpan={3}>ที่</th><th rowSpan={3}>{subject.category} : {subject.name}<br />ชื่อ - นามสกุล</th><th colSpan={4}>ภาคเรียนที่ 1</th><th colSpan={4}>ภาคเรียนที่ 2</th><th rowSpan={3}><span className="vtext">คะแนนเฉลี่ย 2 ภาคเรียน</span></th><th rowSpan={3}><span className="vtext">ผลการเรียนตลอดปี</span></th><th colSpan={2} rowSpan={2}>สรุปผลการประเมิน</th></tr>
                <tr>{[1,2].flatMap(term => ["ระหว่างภาค","ปลายภาค","รวม","ผลการเรียน"].map(label => <th key={`${term}-${label}`}><span className="vtext">{label}</span></th>))}</tr>
                <tr>{[1,2].flatMap(term => [subject.midterm_max,subject.final_max,subject.midterm_max+subject.final_max,""].map((value,i) => <th key={`${term}-${i}`}>{value}</th>))}<th>ผ่าน</th><th>ไม่ผ่าน</th></tr>
              </thead>
              <tbody>
                {students.slice(pageIndex * 30, (pageIndex + 1) * 30).map((st) => {
                  const sc = scoreOf(st.id, subject.id);
                  const res = computeSubjectResult(
                    {
                      sem1_mid: sc?.sem1_mid ?? null,
                      sem1_final: sc?.sem1_final ?? null,
                      sem2_mid: sc?.sem2_mid ?? null,
                      sem2_final: sc?.sem2_final ?? null,
                      override_grade: sc?.override_grade ?? null,
                    },
                    criteria
                  );
                  return (
                    <tr key={st.id}>
                      <td className="text-center">{st.no}</td>
                      <td>{fullName(st)}</td>
                      <td className="text-center">{sc?.sem1_mid ?? ""}</td>
                      <td className="text-center">{sc?.sem1_final ?? ""}</td>
                      <td className="text-center">{res.sem1Total ?? ""}</td>
                      <td className="text-center font-semibold">{gradeText(res.sem1Grade)}</td>
                      <td className="text-center">{sc?.sem2_mid ?? ""}</td>
                      <td className="text-center">{sc?.sem2_final ?? ""}</td>
                      <td className="text-center">{res.sem2Total ?? ""}</td>
                      <td className="text-center font-semibold">{gradeText(res.sem2Grade)}</td>
                      <td className="text-center">{n2(res.yearAvg)}</td>
                      <td className="text-center font-bold">{gradeText(res.yearGrade)}</td>
                      <td className="text-center">{res.yearGrade !== null && res.yearGrade > 0 ? "✓" : ""}</td>
                      <td className="text-center">{res.yearGrade === 0 ? "✓" : ""}</td>
                    </tr>
                  );
                })}
                {Array.from({ length: Math.max(0, 30 - students.slice(pageIndex * 30, (pageIndex + 1) * 30).length) }).map((_, i) => (
                  <tr key={`b${i}`}>
                    <td className="text-center">{pageIndex * 30 + students.slice(pageIndex * 30, (pageIndex + 1) * 30).length + i + 1}</td>
                    <td></td><td></td><td></td><td></td><td></td>
                    <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="score-note">
              คะแนนเต็ม: ระหว่างภาค {subject.midterm_max} + ปลายภาค {subject.final_max} = {subject.midterm_max + subject.final_max}
            </div>
          </div>
        )))}
        {subjects.length === 0 && (
          <div className="print-page text-center text-slate-400 pt-20">ยังไม่มีรายวิชา</div>
        )}
      </div>
    </>
  );
}
