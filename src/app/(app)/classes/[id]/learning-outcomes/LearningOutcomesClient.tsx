"use client";

import { useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { fullName } from "@/lib/types";
import type {
  LearningOutcomeConfig,
  LearningOutcomeIndicator,
  LearningOutcomeQualityLevel,
  LearningOutcomeScore,
  Student,
  Subject,
} from "@/lib/types";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

type IndicatorRow = Partial<LearningOutcomeIndicator> & {
  _key: string;
  _new?: boolean;
  _dirty?: boolean;
};

type ScoreValue = { value: number | null; dirty?: boolean };
type ScoreMap = Record<string, ScoreValue>;

const DEFAULT_LEVELS: Omit<LearningOutcomeQualityLevel, "id" | "school_id" | "updated_at">[] = [
  { code: "beginner", label: "เริ่มต้น", min_percent: 0, sort: 1 },
  { code: "developing", label: "พัฒนา", min_percent: 50, sort: 2 },
  { code: "proficient", label: "ชำนาญ", min_percent: 65, sort: 3 },
  { code: "expert", label: "เชี่ยวชาญ", min_percent: 80, sort: 4 },
];

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moveScoreCell(event: KeyboardEvent<HTMLInputElement>) {
  const movement: Record<string, [number, number]> = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  };
  const delta = movement[event.key];
  if (!delta) return;
  const row = Number(event.currentTarget.dataset.scoreRow);
  const col = Number(event.currentTarget.dataset.scoreCol);
  const next = document.querySelector<HTMLInputElement>(`[data-learning-score-row="${row + delta[0]}"][data-learning-score-col="${col + delta[1]}"]`);
  if (!next) return;
  event.preventDefault();
  event.stopPropagation();
  next.focus();
  next.select();
}

export default function LearningOutcomesClient({
  classId,
  schoolId,
  subjects,
  students,
  initialConfigs,
  initialIndicators,
  initialScores,
  initialQualityLevels,
}: {
  classId: string;
  schoolId: number;
  subjects: Subject[];
  students: Student[];
  initialConfigs: LearningOutcomeConfig[];
  initialIndicators: LearningOutcomeIndicator[];
  initialScores: LearningOutcomeScore[];
  initialQualityLevels: LearningOutcomeQualityLevel[];
}) {
  const supabase = createClient();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [term, setTerm] = useState<1 | 2>(1);
  const [configs, setConfigs] = useState(initialConfigs);
  const [indicators, setIndicators] = useState<IndicatorRow[]>(
    initialIndicators.map((row) => ({ ...row, _key: row.id }))
  );
  const [targetMaxDraft, setTargetMaxDraft] = useState<Record<string, number>>({});
  const [scores, setScores] = useState<ScoreMap>(() => {
    const map: ScoreMap = {};
    for (const score of initialScores) map[`${score.student_id}:${score.indicator_id}`] = { value: Number(score.score) };
    return map;
  });
  const undoScoresRef = useRef<ScoreMap | null>(null);
  const [qualityLevels, setQualityLevels] = useState<(LearningOutcomeQualityLevel | (typeof DEFAULT_LEVELS)[number])[]>(
    initialQualityLevels.length ? initialQualityLevels : DEFAULT_LEVELS
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingScores, setSavingScores] = useState(false);
  const [savingLevels, setSavingLevels] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const config = configs.find((item) => item.subject_id === subjectId && item.term === term);
  const configKey = `${subjectId}:${term}`;
  const activeIndicators = indicators
    .filter((item) => item.config_id === config?.id)
    .sort((a, b) => Number(a.order_no) - Number(b.order_no));
  const targetMax = targetMaxDraft[configKey] ?? Number(config?.target_max ?? 70);
  const rawMax = activeIndicators.reduce((sum, item) => sum + Number(item.max_score || 0), 0);

  const sortedLevels = useMemo(
    () => [...qualityLevels].sort((a, b) => Number(a.min_percent) - Number(b.min_percent)),
    [qualityLevels]
  );

  const completion = useMemo(() => ([1, 2] as const).map((targetTerm) => {
    const targetConfig = configs.find((item) => item.subject_id === subjectId && item.term === targetTerm);
    const targetIndicators = indicators.filter((item) => item.config_id === targetConfig?.id && !item._new);
    const required = students.length * targetIndicators.length;
    const completed = students.reduce((count, student) => count + targetIndicators.filter((indicator) => scores[`${student.id}:${indicator.id}`]?.value !== null && scores[`${student.id}:${indicator.id}`]?.value !== undefined).length, 0);
    return { term: targetTerm, configured: targetIndicators.length > 0, required, completed, missing: required - completed, ready: required > 0 && completed === required };
  }), [configs, indicators, scores, students, subjectId]);

  function qualityOf(percent: number | null): string {
    if (percent === null || !Number.isFinite(percent)) return "-";
    return [...sortedLevels].reverse().find((level) => percent >= Number(level.min_percent))?.label ?? "-";
  }

  function updateIndicator(key: string, field: keyof LearningOutcomeIndicator, value: string | number) {
    setIndicators((current) => current.map((item) => item._key === key ? { ...item, [field]: value, _dirty: true } : item));
  }

  function addIndicator(targetConfig: LearningOutcomeConfig | undefined = config) {
    if (!targetConfig) {
      setMessage("กรุณาบันทึกการตั้งค่ารายวิชาและภาคเรียนก่อนเพิ่มตัวชี้วัด");
      return;
    }
    if (activeIndicators.length >= 10) {
      setMessage("กำหนดตัวชี้วัดได้สูงสุด 10 ช่องต่อภาคเรียน");
      return;
    }
    const nextNo = activeIndicators.reduce((max, item) => Math.max(max, Number(item.order_no) || 0), 0) + 1;
    setIndicators((current) => [...current, {
      _key: `new-${Date.now()}`,
      _new: true,
      _dirty: true,
      config_id: targetConfig.id,
      order_no: nextNo,
      code: `T${term}-${String(nextNo).padStart(2, "0")}`,
      title: "",
      max_score: 10,
      weight_percent: null,
    }]);
    setMessage(null);
  }

  async function removeIndicator(row: IndicatorRow) {
    if (!window.confirm(`ลบตัวชี้วัด “${row.title || row.code}” หรือไม่?`)) return;
    if (row._new) {
      setIndicators((current) => current.filter((item) => item._key !== row._key));
      return;
    }
    const { error } = await supabase.from("learning_outcome_indicators").delete().eq("id", row.id!);
    if (error) setMessage(`ลบไม่ได้: ${error.message}`);
    else setIndicators((current) => current.filter((item) => item._key !== row._key));
  }

  async function ensureConfig(): Promise<LearningOutcomeConfig | null> {
    if (config) return config;
    if (!subjectId) return null;
    const { data, error } = await supabase.from("learning_outcome_configs").insert({
      subject_id: subjectId,
      term,
      target_max: targetMax,
      calculation_method: "proportional",
      status: "draft",
    }).select("*").single();
    if (error) {
      setMessage(`สร้างชุดตัวชี้วัดไม่สำเร็จ: ${error.message}`);
      return null;
    }
    const created = data as LearningOutcomeConfig;
    setConfigs((current) => [...current, created]);
    return created;
  }

  async function saveConfiguration() {
    setSavingConfig(true);
    setMessage(null);
    const currentConfig = await ensureConfig();
    if (!currentConfig) { setSavingConfig(false); return; }

    const { error: configError } = await supabase
      .from("learning_outcome_configs")
      .update({ target_max: targetMax, calculation_method: "proportional" })
      .eq("id", currentConfig.id);
    if (configError) {
      setMessage(`บันทึกการตั้งค่าไม่สำเร็จ: ${configError.message}`);
      setSavingConfig(false);
      return;
    }

    const rows = indicators.filter((item) => item.config_id === currentConfig.id && item._dirty);
    for (const row of rows) {
      const title = row.title?.trim() || "";
      const code = row.code?.trim() || "";
      const maxScore = Number(row.max_score);
      if (!title || !code || !Number.isFinite(maxScore) || maxScore <= 0) {
        setMessage("กรุณากรอกรหัส ชื่อตัวชี้วัด และคะแนนเต็มให้ถูกต้อง");
        setSavingConfig(false);
        return;
      }
      const payload = {
        config_id: currentConfig.id,
        order_no: Number(row.order_no),
        code,
        title,
        max_score: maxScore,
        weight_percent: null,
      };
      if (row._new) {
        const { data, error } = await supabase.from("learning_outcome_indicators").insert(payload).select("*").single();
        if (error) { setMessage(`บันทึกตัวชี้วัดไม่สำเร็จ: ${error.message}`); setSavingConfig(false); return; }
        Object.assign(row, data, { _key: data.id, _new: false, _dirty: false });
      } else {
        const { error } = await supabase.from("learning_outcome_indicators").update(payload).eq("id", row.id!);
        if (error) { setMessage(`บันทึกตัวชี้วัดไม่สำเร็จ: ${error.message}`); setSavingConfig(false); return; }
        row._dirty = false;
      }
    }
    setConfigs((current) => current.map((item) => item.id === currentConfig.id ? { ...item, target_max: targetMax } : item));
    setIndicators((current) => [...current]);
    setSavingConfig(false);
    setMessage("บันทึกการตั้งค่าแล้ว");
  }

  function setScore(studentId: string, indicatorId: string, value: string) {
    const parsed = value === "" ? null : Number(value);
    setScores((current) => ({ ...current, [`${studentId}:${indicatorId}`]: { value: parsed, dirty: true } }));
  }

  function pasteScoreGrid(event: ClipboardEvent<HTMLInputElement>, startRow: number, startCol: number) {
    const rows = event.clipboardData.getData("text").trimEnd().split(/\r?\n/).map((row) => row.split("\t"));
    if (!rows.length || (rows.length === 1 && rows[0].length === 1)) return;
    event.preventDefault();
    undoScoresRef.current = scores;
    let changed = 0;
    const invalid: string[] = [];
    setScores((current) => {
      const next = { ...current };
      rows.forEach((values, rowOffset) => values.forEach((raw, colOffset) => {
        const student = students[startRow + rowOffset];
        const indicator = activeIndicators[startCol + colOffset];
        if (!student || !indicator?.id) return;
        const text = raw.trim();
        const value = text === "" ? null : Number(text);
        const max = Number(indicator.max_score);
        if (value !== null && (!Number.isFinite(value) || value < 0 || value > max)) {
          invalid.push(`${indicator.code || `ช่อง ${startCol + colOffset + 1}`} แถว ${startRow + rowOffset + 1}`);
          return;
        }
        next[`${student.id}:${indicator.id}`] = { value, dirty: true };
        changed += 1;
      }));
      return next;
    });
    setMessage(`วางคะแนนแล้ว ${changed} ช่อง${invalid.length ? ` · ข้ามค่าที่ไม่ถูกต้อง ${invalid.length} ช่อง` : ""}`);
  }

  function undoBulkPaste(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || !undoScoresRef.current) return;
    event.preventDefault();
    setScores(undoScoresRef.current);
    undoScoresRef.current = null;
    setMessage("ย้อนกลับการวางคะแนนครั้งล่าสุดแล้ว");
  }

  async function copyLearningOutcomesToClipboard() {
    const subject = subjects.find((item) => item.id === subjectId);
    const rows = [
      ["เลขที่", "เลขประจำตัว", "ชื่อ–สกุล", ...activeIndicators.map((indicator) => `${indicator.code} ${indicator.title}`), "รวมดิบ", "ถ่วงน้ำหนัก", "ระดับ"],
      ...students.map((student) => {
        const values = activeIndicators.map((indicator) => scores[`${student.id}:${indicator.id}`]?.value ?? "");
        const complete = activeIndicators.length > 0 && values.every((value) => value !== "");
        const raw = values.reduce<number>((sum, value) => sum + (value === "" ? 0 : Number(value)), 0);
        const weighted = complete && rawMax > 0 ? round2(raw / rawMax * targetMax) : "";
        const percent = complete && rawMax > 0 ? raw / rawMax * 100 : null;
        return [String(student.no), student.student_code || "", fullName(student), ...values.map(String), String(raw), String(weighted), qualityOf(percent)];
      }),
    ];
    try {
      await navigator.clipboard.writeText(rows.map((row) => row.join("\t")).join("\r\n"));
      setMessage(`คัดลอกผลลัพธ์การเรียนรู้ ${subject?.name || ""} ภาคเรียนที่ ${term} แล้ว`);
    } catch {
      setMessage("คัดลอกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์คลิปบอร์ดของเบราว์เซอร์");
    }
  }

  async function saveScores() {
    const dirty = Object.entries(scores).filter(([, value]) => value.dirty);
    if (!dirty.length) return;
    setSavingScores(true);
    setMessage(null);
    for (const [key, item] of dirty) {
      const [studentId, indicatorId] = key.split(":");
      if (item.value === null) {
        const { error } = await supabase.from("learning_outcome_scores").delete().eq("student_id", studentId).eq("indicator_id", indicatorId);
        if (error) { setMessage(`ล้างคะแนนไม่สำเร็จ: ${error.message}`); setSavingScores(false); return; }
      } else {
        const indicator = activeIndicators.find((row) => row.id === indicatorId);
        if (!Number.isFinite(item.value) || item.value < 0 || item.value > Number(indicator?.max_score ?? 0)) {
          setMessage(`คะแนนต้องอยู่ระหว่าง 0–${indicator?.max_score ?? 0}`);
          setSavingScores(false);
          return;
        }
        const { error } = await supabase.from("learning_outcome_scores").upsert({
          student_id: studentId,
          indicator_id: indicatorId,
          score: item.value,
        }, { onConflict: "student_id,indicator_id" });
        if (error) { setMessage(`บันทึกคะแนนไม่สำเร็จ: ${error.message}`); setSavingScores(false); return; }
      }
    }
    setScores((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { value: value.value }])));
    undoScoresRef.current = null;
    setSavingScores(false);
    setMessage("บันทึกคะแนนแล้ว");
  }

  async function saveQualityLevels() {
    setSavingLevels(true);
    setMessage(null);
    for (const level of qualityLevels) {
      const payload = {
        school_id: schoolId,
        code: level.code,
        label: level.label.trim(),
        min_percent: Number(level.min_percent),
        sort: level.sort,
      };
      const { error } = await supabase.from("learning_outcome_quality_levels").upsert(payload, { onConflict: "school_id,code" });
      if (error) { setMessage(`บันทึกเกณฑ์ไม่สำเร็จ: ${error.message}`); setSavingLevels(false); return; }
    }
    setSavingLevels(false);
    setMessage("บันทึกเกณฑ์ระดับคุณภาพแล้ว");
  }

  const dirtyScoreCount = Object.values(scores).filter((item) => item.dirty).length;
  const hasDirtyConfiguration = indicators.some((item) => item._dirty);
  useUnsavedChangesWarning(dirtyScoreCount > 0 || hasDirtyConfiguration);

  if (!subjects.length) return <div className="rounded-xl bg-white p-8 text-center text-slate-500">กรุณาเพิ่มรายวิชาก่อนใช้งานผลลัพธ์การเรียนรู้</div>;

  return (
    <div className="space-y-5" onKeyDownCapture={undoBulkPaste}>
      <div>
        <h2 className="text-xl font-bold text-slate-800">ผลลัพธ์การเรียนรู้</h2>
        <p className="text-sm text-slate-500">ตั้งค่าตัวชี้วัดและบันทึกคะแนน แยกตามรายวิชาและภาคเรียน</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm text-slate-600">รายวิชา
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-3 py-2">
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.order_no}. {subject.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-600">ภาคเรียน
          <select value={term} onChange={(event) => setTerm(Number(event.target.value) as 1 | 2)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2">
            <option value={1}>ภาคเรียนที่ 1</option><option value={2}>ภาคเรียนที่ 2</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">คะแนนหลังถ่วงน้ำหนัก
          <input type="number" min={0.01} step="0.01" value={targetMax} onChange={(event) => setTargetMaxDraft((current) => ({ ...current, [configKey]: Number(event.target.value) }))} className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <div className="text-sm text-slate-500">วิธีคิด: ตามสัดส่วนคะแนนเต็ม</div>
        <button onClick={saveConfiguration} disabled={savingConfig} className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingConfig ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}</button>
        <div className="flex w-full flex-wrap gap-2 border-t border-slate-100 pt-3">
          {completion.map((status) => <span key={status.term} className={`rounded-full px-3 py-1 text-xs font-medium ${status.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            ภาคเรียนที่ {status.term}: {status.ready ? "คะแนนครบ" : status.configured ? `ยังขาด ${status.missing} ช่อง` : "ยังไม่มีตัวชี้วัด"}
          </span>)}
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${completion.every((status) => status.ready) ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{completion.every((status) => status.ready) ? "พร้อมนำออกเป็น PDF" : "ยังไม่พร้อมพิมพ์ PDF"}</span>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h3 className="font-semibold text-slate-800">ตัวชี้วัด</h3><p className="text-xs text-slate-500">สูงสุด 10 ช่องต่อภาคเรียน · คะแนนดิบเต็มรวม {round2(rawMax)}</p></div>
          <button onClick={async () => { const current = await ensureConfig(); if (current) addIndicator(current); }} disabled={activeIndicators.length >= 10} className="rounded-lg border border-blue-300 px-3 py-2 text-sm text-blue-700 disabled:opacity-40">+ เพิ่มตัวชี้วัด</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50"><tr><th className="p-2">ลำดับ</th><th className="p-2">รหัส</th><th className="p-2 text-left">ชื่อ/คำอธิบายตัวชี้วัด</th><th className="p-2">คะแนนเต็ม</th><th className="p-2"></th></tr></thead>
            <tbody>{activeIndicators.map((row) => <tr key={row._key} className={`border-t ${row._dirty ? "bg-amber-50" : ""}`}>
              <td className="p-2"><input type="number" min={1} max={10} value={row.order_no ?? ""} onChange={(event) => updateIndicator(row._key, "order_no", event.target.value)} className="w-16 rounded border px-2 py-1.5 text-center" /></td>
              <td className="p-2"><input value={row.code ?? ""} onChange={(event) => updateIndicator(row._key, "code", event.target.value)} className="w-24 rounded border px-2 py-1.5" /></td>
              <td className="p-2"><input value={row.title ?? ""} onChange={(event) => updateIndicator(row._key, "title", event.target.value)} className="w-full rounded border px-2 py-1.5" placeholder="เช่น ข้อ 1 แบบฝึกหัด" /></td>
              <td className="p-2"><input type="number" min={0.01} step="0.01" value={row.max_score ?? ""} onChange={(event) => updateIndicator(row._key, "max_score", event.target.value)} className="w-24 rounded border px-2 py-1.5 text-center" /></td>
              <td className="p-2"><button onClick={() => void removeIndicator(row)} className="text-rose-600">ลบ</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold text-slate-800">กรอกคะแนน</h3><p className="text-xs text-slate-500">ใช้ปุ่มลูกศรเลื่อนไปยังนักเรียนหรือช่องถัดไปได้ · ช่องว่างถือว่าเป็นคะแนนที่ยังกรอกไม่ครบ</p></div>
          <div className="flex items-center gap-3">{message && <span className="text-sm text-slate-600">{message}</span>}<button onClick={() => void copyLearningOutcomesToClipboard()} disabled={!activeIndicators.length} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 disabled:opacity-50">คัดลอกไป Excel</button><button onClick={saveScores} disabled={savingScores || !dirtyScoreCount || !activeIndicators.length} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingScores ? "กำลังบันทึก..." : `บันทึกคะแนน${dirtyScoreCount ? ` (${dirtyScoreCount})` : ""}`}</button></div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-max text-sm">
            <thead className="sticky top-0 bg-slate-50"><tr><th className="sticky left-0 z-20 bg-slate-50 p-2">ที่</th><th className="sticky left-12 z-20 min-w-52 bg-slate-50 p-2 text-left">ชื่อ–สกุล</th>{activeIndicators.map((indicator) => <th key={indicator._key} className="min-w-32 p-2"><div>{indicator.code}</div><div className="max-w-36 whitespace-normal text-xs font-normal">{indicator.title}</div><div className="text-xs">เต็ม {indicator.max_score}</div></th>)}<th className="min-w-24 p-2">รวมดิบ</th><th className="min-w-28 p-2">ถ่วงน้ำหนัก</th><th className="min-w-24 p-2">ระดับ</th></tr></thead>
            <tbody>{students.map((student, rowIndex) => {
              const values = activeIndicators.map((indicator) => scores[`${student.id}:${indicator.id}`]?.value ?? null);
              const complete = activeIndicators.length > 0 && values.every((value) => value !== null);
              const raw = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
              const weighted = complete && rawMax > 0 ? round2((raw / rawMax) * targetMax) : null;
              const overallPercent = complete && rawMax > 0 ? (raw / rawMax) * 100 : null;
              return <tr key={student.id} className="border-t">
                <td className="sticky left-0 bg-white p-2 text-center">{student.no}</td><td className="sticky left-12 bg-white p-2 whitespace-nowrap">{fullName(student)}</td>
                {activeIndicators.map((indicator, colIndex) => { const key = `${student.id}:${indicator.id}`; const value = scores[key]?.value ?? null; const invalid = value !== null && (value < 0 || value > Number(indicator.max_score)); const percent = value === null ? null : (value / Number(indicator.max_score)) * 100; return <td key={indicator._key} className="p-2 text-center"><input type="number" min={0} max={Number(indicator.max_score)} step="0.01" value={value ?? ""} onChange={(event) => setScore(student.id, indicator.id!, event.target.value)} onKeyDown={moveScoreCell} onPaste={(event) => pasteScoreGrid(event, rowIndex, colIndex)} data-learning-score-row={rowIndex} data-learning-score-col={colIndex} className={`w-24 rounded border px-2 py-1.5 text-center ${invalid ? "border-rose-500 bg-rose-50" : scores[key]?.dirty ? "border-amber-400 bg-amber-50" : "border-slate-200"}`} /><div className="mt-1 text-xs text-slate-400">{qualityOf(percent)}</div></td>; })}
                <td className="p-2 text-center font-medium">{activeIndicators.length ? round2(raw) : "-"}</td><td className="p-2 text-center font-semibold text-blue-700">{weighted ?? "-"}</td><td className="p-2 text-center">{qualityOf(overallPercent)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-slate-800">เกณฑ์ระดับคุณภาพ</h3><p className="text-xs text-slate-500">ใช้ทั้งระดับรายตัวชี้วัดและภาพรวม คำนวณจากร้อยละ</p></div><button onClick={saveQualityLevels} disabled={savingLevels} className="rounded-lg border border-indigo-300 px-3 py-2 text-sm text-indigo-700 disabled:opacity-50">{savingLevels ? "กำลังบันทึก..." : "บันทึกเกณฑ์"}</button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{qualityLevels.map((level, index) => <div key={level.code} className="rounded-lg border border-slate-200 p-3"><input value={level.label} onChange={(event) => setQualityLevels((current) => current.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} className="w-full rounded border px-2 py-1.5 font-medium" /><label className="mt-2 block text-xs text-slate-500">ร้อยละขั้นต่ำ<input type="number" min={0} max={100} step="0.01" value={level.min_percent} onChange={(event) => setQualityLevels((current) => current.map((item, i) => i === index ? { ...item, min_percent: Number(event.target.value) } : item))} className="mt-1 w-full rounded border px-2 py-1.5" /></label></div>)}</div>
      </section>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">คะแนนที่บันทึกแล้วสามารถกลับมาแก้ไขได้ ระบบจะแสดงช่องว่างเป็นข้อมูลที่ยังกรอกไม่ครบ</div>
    </div>
  );
}
