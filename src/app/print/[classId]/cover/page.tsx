import { loadClassBundle } from "@/lib/report-data";
import { computeStudentReport } from "@/lib/report-compute";
import { fullName } from "@/lib/types";
import PrintToolbar from "@/components/PrintToolbar";
import { qualityLabelsFromSchool, type QualityLabels } from "@/lib/grading";

export const dynamic = "force-dynamic";

const GRADE_BUCKETS = [4, 3.5, 3, 2.5, 2, 1.5, 1, 0];

function levelToCol(level: string, labels: QualityLabels): number {
  if (level === labels.excellent) return 3;
  if (level === labels.good) return 2;
  if (level === labels.pass) return 1;
  if (level === labels.fail) return 0;
  return -1;
}

function formatThaiBirthDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(date);
}

function calculateAge(value: string): string {
  if (!value) return "";
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age--;
  return String(Math.max(0, age));
}

export default async function CoverPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const bundle = await loadClassBundle(classId);
  const { school, cls, students, subjects } = bundle;
  const qualityLabels = qualityLabelsFromSchool(school);
  const reports = students.map((s) => computeStudentReport(bundle, s));

  // นับเกรดรายวิชา
  const subjectCounts: Record<string, number[]> = {};
  for (const subj of subjects) subjectCounts[subj.id] = new Array(GRADE_BUCKETS.length).fill(0);
  for (const rep of reports) {
    for (const row of rep.rows) {
      if (row.yearGrade === null) continue;
      const idx = GRADE_BUCKETS.indexOf(row.yearGrade);
      if (idx >= 0) subjectCounts[row.subject.id][idx]++;
    }
  }

  // นับคุณลักษณะ / สมรรถนะ / กิจกรรม / เพศ
  const charCount = [0, 0, 0, 0]; // index = col 3,2,1,0 -> store as [3,2,1,0]
  const competencyCount = [0, 0, 0, 0];
  let actPass = 0;
  let actFail = 0;
  let male = 0;
  let female = 0;
  for (const rep of reports) {
    const c = levelToCol(rep.characteristicLevel, qualityLabels);
    if (c >= 0) charCount[3 - c]++;
    const competency = levelToCol(rep.assessmentLevels.competency.year, qualityLabels);
    if (competency >= 0) competencyCount[3 - competency]++;
    if (rep.activityOverall === "ผ่าน") actPass++;
    else if (rep.activityOverall === "ไม่ผ่าน") actFail++;
    if (rep.student.gender === "ชาย") male++;
    else if (rep.student.gender === "หญิง") female++;
  }

  return (
    <>
      <PrintToolbar title="ปก ปพ.5 + บัญชีรายชื่อ" />
      <div className="py-4 print:py-0">
        {/* ---- หน้าปกสรุป ---- */}
        <div className="print-page cover-sheet">
          <div className="cover-document-code text-right font-semibold">ปพ.5</div>
          <div className="text-center">
            {school?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.logo_url} alt="" className="mx-auto h-16 object-contain" />
            ) : null}
            <div className="cover-main-title">สมุดบันทึกการพัฒนาคุณภาพผู้เรียน</div>
            <div className="cover-grade-title">{cls?.grade_level}</div>
          </div>

          <table className="w-full cover-info-table">
            <tbody>
              <tr>
                <td className="py-0.5 w-24">โรงเรียน</td>
                <td className="border-b border-dotted border-slate-500">{school?.name}</td>
                <td className="py-0.5 w-24 pl-3">ตำบล/แขวง</td>
                <td className="border-b border-dotted border-slate-500">{school?.tambon}</td>
              </tr>
              <tr>
                <td className="py-0.5">อำเภอ/เขต</td>
                <td className="border-b border-dotted border-slate-500">{school?.amphoe}</td>
                <td className="py-0.5 pl-3">จังหวัด</td>
                <td className="border-b border-dotted border-slate-500">{school?.province}</td>
              </tr>
              <tr>
                <td className="py-0.5">สำนักงานเขตพื้นที่การศึกษา</td>
                <td className="border-b border-dotted border-slate-500">{school?.area}</td>
                <td className="py-0.5 pl-3">ปีการศึกษา</td>
                <td className="border-b border-dotted border-slate-500">
                  {cls?.academic_year || school?.academic_year} &nbsp; จำนวนนักเรียน {students.length} คน
                </td>
              </tr>
            </tbody>
          </table>

          <div className="flex gap-2 cover-summary-grid items-start">
            {/* ตารางระดับผลการเรียนรายวิชา */}
            <table className="report-table" style={{ width: 440, flex: "none" }}>
              <colgroup>
                <col style={{ width: 24 }} />
                <col style={{ width: 176 }} />
                {GRADE_BUCKETS.map((g) => <col key={g} style={{ width: 30 }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: 24 }}>ที่</th>
                  <th rowSpan={2}>ชื่อวิชา</th>
                  <th colSpan={8}>ระดับผลการเรียนรายวิชา (คน)</th>
                </tr>
                <tr>
                  {GRADE_BUCKETS.map((g) => (
                    <th key={g} style={{ width: 30 }}>{g}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjects.map((subj) => (
                  <tr key={subj.id}>
                    <td className="text-center">{subj.order_no}</td>
                    <td>{subj.name}</td>
                    {subjectCounts[subj.id].map((c, i) => (
                      <td key={i} className="text-center">{c || ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* แผงสรุปด้านขวา — ตารางเดียวตามแบบ ปพ.5 */}
            <table className="report-table" style={{ width: 260 }}>
              <colgroup>
                {Array.from({ length: 8 }, (_, i) => (
                  <col key={i} style={{ width: i < 4 ? 37.5 : 27.5 }} />
                ))}
              </colgroup>
              <thead>
                <tr><th colSpan={4}><span style={{ fontSize: 20, fontWeight: 700 }}>ผลการประเมิน</span></th><th colSpan={4}><span style={{ fontSize: 20, fontWeight: 700 }}>ผลการประเมิน</span></th></tr>
                <tr className="cover-assessment-scale">
                  <th colSpan={4}></th>
                  {[3, 2, 1, 0].map((level) => <th key={level}>{level}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={4} className="text-left font-semibold">คุณลักษณะอันพึงประสงค์</td>
                  {charCount.map((v, i) => <td key={i} className="text-center">{v}</td>)}
                </tr>
                <tr>
                  <td colSpan={4} className="text-left font-semibold">สมรรถนะของผู้เรียน</td>
                  {competencyCount.map((v, i) => <td key={i} className="text-center">{v}</td>)}
                </tr>
                <tr>
                  <td colSpan={4} className="text-left font-semibold">ผลการประเมิน</td>
                  <td colSpan={2} className="text-center">ผ่าน</td>
                  <td colSpan={2} className="text-center">ไม่ผ่าน</td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-left font-semibold">กิจกรรมพัฒนาผู้เรียน</td>
                  <td colSpan={2} className="text-center">{actPass}</td>
                  <td colSpan={2} className="text-center">{actFail}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-left shade font-semibold">การอนุมัติผลการเรียน</td>
                  <td colSpan={2} className="text-center shade">ชาย</td>
                  <td colSpan={2} className="text-center shade">หญิง</td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-left">จำนวนนักเรียนในบัญชี</td>
                  <td colSpan={2} className="text-center">{male || ""}</td>
                  <td colSpan={2} className="text-center">{female || ""}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-left">เข้าระหว่างปี</td>
                  <td colSpan={2}></td><td colSpan={2}></td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-left">ออกระหว่างปี</td>
                  <td colSpan={2}></td><td colSpan={2}></td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-left">ตัดสินเลื่อนชั้นปลายปี</td>
                  <td colSpan={2}></td><td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ลายเซ็น */}
          <div className="grid grid-cols-2 gap-8 mt-8 text-center text-[12px] report-signatures">
            <div>
              <div>ลงชื่อ ...................................................</div>
              <div className="mt-1">( {cls?.homeroom_teacher_name || "..............................."} )</div>
              <div>ครูประจำชั้น</div>
            </div>
            <div>
              <div>ลงชื่อ ...................................................</div>
              <div className="mt-1">( {school?.registrar_head || "..............................."} )</div>
              <div>หัวหน้าทะเบียนและวัดผล</div>
            </div>
          </div>
          <div className="text-center mt-5 text-[12px] report-signatures">
            <div>ลงชื่อ ...................................................</div>
            <div className="mt-1">( {school?.academic_head || "..............................."} )</div>
            <div>หัวหน้าฝ่ายวิชาการ</div>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 text-[12px]">
            <span>☐ อนุมัติ</span>
            <span>☐ ไม่อนุมัติ</span>
          </div>
          <div className="text-center mt-3 text-[12px] report-signatures">
            <div>ลงชื่อ ...................................................</div>
            <div className="mt-1">( {school?.director || "..............................."} )</div>
            <div>{school?.director_position || "ผู้อำนวยการโรงเรียน"}</div>
            <div className="mt-2">............../.........................../....................</div>
          </div>
        </div>

        {/* ---- บัญชีรายชื่อนักเรียน ---- */}
        {Array.from({ length: Math.max(1, Math.ceil(students.length / 30)) }, (_, pageIndex) => (<div key={pageIndex} className="print-page roster-sheet">
          <header className="plain-form-header roster-form-header">
            <div className="plain-form-title">รายชื่อนักเรียน</div>
            <div className="plain-form-context">{cls?.grade_level} {cls?.room ? `ห้อง ${cls.room}` : ""} โรงเรียน{school?.name} ปีการศึกษา {cls?.academic_year || school?.academic_year}</div>
          </header>
          <table className="report-table roster-table">
            <thead>
              <tr>
                <th style={{ width: 46 }}>เลขที่</th>
                <th style={{ width: 92 }}>เลขประจำตัว<br />นักเรียน</th>
                <th style={{ width: 138 }}>เลขประจำตัวประชาชน</th>
                <th>ชื่อ - นามสกุล</th>
                <th style={{ width: 122 }}>วัน/เดือน/ปี เกิด</th>
                <th style={{ width: 54 }}>อายุ</th>
              </tr>
            </thead>
            <tbody>
              {students.slice(pageIndex*30,(pageIndex+1)*30).map((s) => (
                <tr key={s.id}>
                  <td className="text-center">{s.no}</td>
                  <td className="text-center">{s.student_code}</td>
                  <td className="text-center">{s.national_id}</td>
                  <td>{fullName(s)}</td>
                  <td className="text-center">{formatThaiBirthDate(s.birth_date)}</td>
                  <td className="text-center">{calculateAge(s.birth_date)}</td>
                </tr>
              ))}
              {Array.from({length: Math.max(0,30-students.slice(pageIndex*30,(pageIndex+1)*30).length)}, (_, i) => <tr key={`blank-${i}`}><td className="text-center">{pageIndex*30+students.slice(pageIndex*30,(pageIndex+1)*30).length+i+1}</td>{Array.from({length:5},(_,j)=><td key={j}></td>)}</tr>)}
            </tbody>
          </table>
          <div className="mt-2 text-right">รวมนักเรียนทั้งสิ้น {students.length} คน (ชาย {male} · หญิง {female})</div>
        </div>))}
      </div>
    </>
  );
}
