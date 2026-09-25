import Link from "next/link";
import PrintToolbar from "@/components/PrintToolbar";
import ReportHeader from "@/components/ReportHeader";
import { createClient } from "@/lib/supabase/server";
import { loadClassBundle } from "@/lib/report-data";
import { fullName } from "@/lib/types";
import type { LearningOutcomeConfig, LearningOutcomeIndicator, LearningOutcomeQualityLevel, LearningOutcomeScore } from "@/lib/types";

export const dynamic = "force-dynamic";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export default async function LearningOutcomesPrintPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const bundle = await loadClassBundle(classId);
  const { school, cls, students, subjects } = bundle;
  const activeSubjects = subjects.filter((subject) => subject.is_active);
  const supabase = await createClient();
  const subjectIds = activeSubjects.map((subject) => subject.id);
  const { data: configRows } = subjectIds.length
    ? await supabase.from("learning_outcome_configs").select("*").in("subject_id", subjectIds)
    : { data: [] };
  const configs = (configRows as LearningOutcomeConfig[]) ?? [];
  const configIds = configs.map((config) => config.id);
  const { data: indicatorRows } = configIds.length
    ? await supabase.from("learning_outcome_indicators").select("*").in("config_id", configIds).order("order_no")
    : { data: [] };
  const indicators = (indicatorRows as LearningOutcomeIndicator[]) ?? [];
  const indicatorIds = indicators.map((indicator) => indicator.id);
  const { data: scoreRows } = indicatorIds.length
    ? await supabase.from("learning_outcome_scores").select("*").in("indicator_id", indicatorIds)
    : { data: [] };
  const scores = (scoreRows as LearningOutcomeScore[]) ?? [];
  const { data: levelRows } = school
    ? await supabase.from("learning_outcome_quality_levels").select("*").eq("school_id", school.id).order("min_percent")
    : { data: [] };
  const levels = (levelRows as LearningOutcomeQualityLevel[]) ?? [];
  const scoreMap = new Map(scores.map((score) => [`${score.student_id}:${score.indicator_id}`, Number(score.score)]));

  const setupMissing = activeSubjects.flatMap((subject) => [1, 2].flatMap((term) => {
    const config = configs.find((item) => item.subject_id === subject.id && item.term === term);
    return !config || !indicators.some((indicator) => indicator.config_id === config.id) ? [`${subject.name} ภาคเรียนที่ ${term}`] : [];
  }));
  const missingScores = activeSubjects.reduce((count, subject) => count + [1, 2].reduce((termCount, term) => {
    const config = configs.find((item) => item.subject_id === subject.id && item.term === term);
    const termIndicators = indicators.filter((indicator) => indicator.config_id === config?.id);
    return termCount + students.reduce((studentCount, student) => studentCount + termIndicators.filter((indicator) => !scoreMap.has(`${student.id}:${indicator.id}`)).length, 0);
  }, 0), 0);
  const ready = students.length > 0 && activeSubjects.length > 0 && setupMissing.length === 0 && missingScores === 0;

  if (!ready) {
    return <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
      <h1 className="text-xl font-bold">ยังไม่สามารถพิมพ์ผลลัพธ์การเรียนรู้ได้</h1>
      <p className="mt-2">ต้องกำหนดตัวชี้วัดและกรอกคะแนนให้ครบทั้งภาคเรียนที่ 1 และภาคเรียนที่ 2 ก่อนนำออกเป็น PDF</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
        {!students.length && <li>ยังไม่มีนักเรียนในห้อง</li>}
        {!activeSubjects.length && <li>ยังไม่มีรายวิชาที่เปิดใช้งาน</li>}
        {!!setupMissing.length && <li>ยังไม่ได้ตั้งค่าตัวชี้วัด {setupMissing.length} ชุด: {setupMissing.slice(0, 3).join(", ")}</li>}
        {!!missingScores && <li>คะแนนยังไม่ครบ {missingScores} ช่อง</li>}
      </ul>
      <Link href={`/classes/${classId}/learning-outcomes`} className="mt-5 inline-block rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white">กลับไปกรอกคะแนน</Link>
    </div>;
  }

  const qualityOf = (percent: number) => [...levels].reverse().find((level) => percent >= Number(level.min_percent))?.label ?? "-";

  return <>
    <PrintToolbar title="ผลลัพธ์การเรียนรู้" />
    <div className="py-4 print:py-0">
      {activeSubjects.map((subject) => {
        const termData = ([1, 2] as const).map((term) => {
          const config = configs.find((item) => item.subject_id === subject.id && item.term === term)!;
          const termIndicators = indicators.filter((indicator) => indicator.config_id === config.id);
          return { config, indicators: termIndicators, rawMax: termIndicators.reduce((sum, indicator) => sum + Number(indicator.max_score), 0) };
        });
        return <div key={subject.id} className="print-page">
          <ReportHeader school={school} cls={cls} title={`ผลลัพธ์การเรียนรู้ รายวิชา ${subject.name}`} />
          <table className="report-table mt-4 text-[11px]">
            <thead><tr><th rowSpan={2} className="w-10">ที่</th><th rowSpan={2}>ชื่อ–สกุล</th><th colSpan={3}>ภาคเรียนที่ 1</th><th colSpan={3}>ภาคเรียนที่ 2</th><th rowSpan={2}>เฉลี่ยสองภาค</th></tr><tr><th>ดิบ</th><th>ถ่วงน้ำหนัก</th><th>ระดับ</th><th>ดิบ</th><th>ถ่วงน้ำหนัก</th><th>ระดับ</th></tr></thead>
            <tbody>{students.map((student) => {
              const terms = termData.map((data) => {
                const raw = data.indicators.reduce((sum, indicator) => sum + (scoreMap.get(`${student.id}:${indicator.id}`) ?? 0), 0);
                const percent = data.rawMax > 0 ? raw / data.rawMax * 100 : 0;
                return { raw: round2(raw), weighted: round2(percent / 100 * Number(data.config.target_max)), level: qualityOf(percent) };
              });
              return <tr key={student.id}><td className="text-center">{student.no}</td><td>{fullName(student)}</td><td className="text-center">{terms[0].raw}</td><td className="text-center">{terms[0].weighted}</td><td className="text-center">{terms[0].level}</td><td className="text-center">{terms[1].raw}</td><td className="text-center">{terms[1].weighted}</td><td className="text-center">{terms[1].level}</td><td className="text-center font-semibold">{round2((terms[0].weighted + terms[1].weighted) / 2)}</td></tr>;
            })}</tbody>
          </table>
          <div className="mt-8 grid grid-cols-2 gap-16 text-center text-[12px]"><div>ลงชื่อ ................................................ ครูผู้สอน</div><div>ลงชื่อ ................................................ ผู้รับรอง</div></div>
        </div>;
      })}
    </div>
  </>;
}
