"use client";

import { useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Student, Subject, SubjectScore, GradeCriterion } from "@/lib/types";
import { fullName } from "@/lib/types";
import { computeSubjectResult, gradeText } from "@/lib/grading";
import { decodeCsv, downloadCsvTemplate } from "@/lib/curriculum-csv";
import { parseCsv } from "@/lib/student-csv";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

type ScoreMap = Record<string, Partial<SubjectScore> & { _dirty?: boolean }>;
type ImportMode = "fill_empty" | "overwrite" | "skip_existing";

export default function GradesClient({
  subjects,
  students,
  scores,
  criteria,
}: {
  classId: string;
  subjects: Subject[];
  students: Student[];
  scores: SubjectScore[];
  criteria: GradeCriterion[];
}) {
  const supabase = createClient();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("fill_empty");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // map[subjectId][studentId] = score
  const [map, setMap] = useState<Record<string, ScoreMap>>(() => {
    const m: Record<string, ScoreMap> = {};
    for (const s of scores) {
      if (!m[s.subject_id]) m[s.subject_id] = {};
      m[s.subject_id][s.student_id] = { ...s };
    }
    return m;
  });
  const undoMapRef = useRef<Record<string, ScoreMap> | null>(null);

  const subject = subjects.find((s) => s.id === subjectId);

  function getScore(studentId: string): Partial<SubjectScore> & { _dirty?: boolean } {
    return map[subjectId]?.[studentId] ?? {};
  }

  function setField(studentId: string, field: keyof SubjectScore, value: string) {
    const num = value === "" ? null : Number(value);
    setMap((prev) => {
      const sub = { ...(prev[subjectId] ?? {}) };
      sub[studentId] = { ...(sub[studentId] ?? {}), [field]: num, _dirty: true, student_id: studentId, subject_id: subjectId };
      return { ...prev, [subjectId]: sub };
    });
  }

  function pasteScoreGrid(event: ClipboardEvent<HTMLInputElement>, startRow: number, startCol: number) {
    if (!subject) return;
    const rows = event.clipboardData.getData("text").trimEnd().split(/\r?\n/).map((row) => row.split("\t"));
    if (!rows.length || (rows.length === 1 && rows[0].length === 1)) return;
    event.preventDefault();
    undoMapRef.current = map;
    const fields: { field: keyof SubjectScore; max: number }[] = [
      { field: "sem1_mid", max: Number(subject.midterm_max) },
      { field: "sem1_final", max: Number(subject.final_max) },
      { field: "sem2_mid", max: Number(subject.midterm_max) },
      { field: "sem2_final", max: Number(subject.final_max) },
      { field: "override_grade", max: 4 },
    ];
    let changed = 0;
    let invalid = 0;
    setMap((current) => {
      const next = { ...current, [subjectId]: { ...(current[subjectId] ?? {}) } };
      rows.forEach((values, rowOffset) => values.forEach((raw, colOffset) => {
        const student = students[startRow + rowOffset];
        const target = fields[startCol + colOffset];
        if (!student || !target) return;
        const text = raw.trim();
        const value = text === "" ? null : Number(text);
        if (value !== null && (!Number.isFinite(value) || value < 0 || value > target.max)) { invalid += 1; return; }
        next[subjectId][student.id] = { ...(next[subjectId][student.id] ?? {}), [target.field]: value, student_id: student.id, subject_id: subjectId, _dirty: true };
        changed += 1;
      }));
      return next;
    });
    setMsg(`วางคะแนนแล้ว ${changed} ช่อง${invalid ? ` · ข้ามค่าที่ไม่ถูกต้อง ${invalid} ช่อง` : ""}`);
  }

  async function importCsv(file: File) {
    setImportErrors([]);
    try {
      const table = parseCsv(decodeCsv(await file.arrayBuffer()).replace(/^\uFEFF/, ""));
      if (table.length < 2) throw new Error("ไฟล์ CSV ไม่มีข้อมูลคะแนน");
      const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_.\-()]/g, "");
      const headers = table[0].map(normalize);
      const col = (...aliases: string[]) => headers.findIndex((header) => aliases.some((alias) => header === normalize(alias)));
      const idx = {
        no: col("เลขที่", "ที่"), code: col("เลขประจำตัว", "รหัสนักเรียน"),
        subjectCode: col("รหัสวิชา", "subjectcode"), subjectName: col("ชื่อวิชา", "รายวิชา", "subjectname"),
        s1m: col("ภาค1ระหว่าง", "sem1mid"), s1f: col("ภาค1ปลาย", "sem1final"),
        s2m: col("ภาค2ระหว่าง", "sem2mid"), s2f: col("ภาค2ปลาย", "sem2final"),
        grade: col("แก้เกรด", "overridegrade"),
      };
      if (idx.no < 0 && idx.code < 0) throw new Error("ไม่พบคอลัมน์เลขที่หรือเลขประจำตัว");
      const allSubjectsMode = idx.subjectCode >= 0 || idx.subjectName >= 0;
      const errors: string[] = [];
      const updates: { targetId: string; studentId: string; patch: Partial<SubjectScore> }[] = [];
      table.slice(1).forEach((values, rowIndex) => {
        const student = students.find((item) => (idx.code >= 0 && item.student_code === (values[idx.code] ?? "").trim()) || (idx.no >= 0 && item.no === Number(values[idx.no])));
        if (!student) { errors.push(`แถว ${rowIndex + 2}: ไม่พบนักเรียน`); return; }
        const targetSubject = allSubjectsMode
          ? subjects.find((item) => (idx.subjectCode >= 0 && item.code.trim() === (values[idx.subjectCode] ?? "").trim()) || (idx.subjectName >= 0 && item.name.trim() === (values[idx.subjectName] ?? "").trim()))
          : subject;
        if (!targetSubject) { errors.push(`แถว ${rowIndex + 2}: ไม่พบรายวิชา`); return; }

        const fields: [keyof SubjectScore, number, number][] = [
          ["sem1_mid", idx.s1m, Number(targetSubject.midterm_max)],
          ["sem1_final", idx.s1f, Number(targetSubject.final_max)],
          ["sem2_mid", idx.s2m, Number(targetSubject.midterm_max)],
          ["sem2_final", idx.s2f, Number(targetSubject.final_max)],
          ["override_grade", idx.grade, 4],
        ];
        const patch: Partial<SubjectScore> = {};
        for (const [field, index, max] of fields) {
          const raw = index < 0 ? "" : (values[index] ?? "").trim();
          if (raw === "") continue;
          const value = Number(raw);
          if (!Number.isFinite(value) || value < 0 || value > max) {
            errors.push(`แถว ${rowIndex + 2}: ${field} ต้องอยู่ระหว่าง 0–${max}`);
            return;
          }
          Object.assign(patch, { [field]: value });
        }
        if (!Object.keys(patch).length) return;
        updates.push({ targetId: targetSubject.id, studentId: student.id, patch });
      });
      if (!updates.length) throw new Error(errors[0] || "ไม่พบคะแนนที่นำเข้าได้");

      let skippedExisting = 0;
      const applicableUpdates = updates.flatMap((update) => {
        const existing = map[update.targetId]?.[update.studentId] ?? {};
        if (importMode === "skip_existing" && [existing.sem1_mid, existing.sem1_final, existing.sem2_mid, existing.sem2_final, existing.override_grade].some((value) => value !== null && value !== undefined)) {
          skippedExisting += 1;
          return [];
        }
        if (importMode === "overwrite") return [update];
        const patch = Object.fromEntries(Object.entries(update.patch).filter(([field]) => existing[field as keyof SubjectScore] === null || existing[field as keyof SubjectScore] === undefined)) as Partial<SubjectScore>;
        if (!Object.keys(patch).length) { skippedExisting += 1; return []; }
        return [{ ...update, patch }];
      });
      if (!applicableUpdates.length) throw new Error("ไม่มีช่องว่างที่สามารถนำเข้าคะแนนได้");

      undoMapRef.current = map;
      setMap((previous) => {
        const next = { ...previous };
        for (const { targetId, studentId, patch } of applicableUpdates) {
          const subjectRows = { ...(next[targetId] ?? {}) };
          subjectRows[studentId] = { ...(subjectRows[studentId] ?? {}), ...patch, student_id: studentId, subject_id: targetId, _dirty: true };
          next[targetId] = subjectRows;
        }
        return next;
      });
      setImportErrors(errors);
      setMsg(`นำเข้าคะแนน ${applicableUpdates.length} รายการ${skippedExisting ? ` · ข้ามคะแนนเดิม ${skippedExisting} รายการ` : ""}${errors.length ? ` · ข้อมูลผิด ${errors.length} รายการ (${errors.slice(0, 2).join("; ")})` : ""} กรุณาตรวจสอบและกดบันทึก`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "รูปแบบไฟล์ไม่ถูกต้อง";
      setImportErrors([detail]);
      setMsg(`นำเข้าไม่สำเร็จ: ${detail}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const rows = students.flatMap((student) => subjects.map((item) => [
      String(student.no), student.student_code || "", item.code, item.name, "", "", "", "", "",
    ]));
    downloadCsvTemplate("scores-all-subjects-template.csv", [
      ["เลขที่", "เลขประจำตัว", "รหัสวิชา", "ชื่อวิชา", "ภาค 1 ระหว่าง", "ภาค 1 ปลาย", "ภาค 2 ระหว่าง", "ภาค 2 ปลาย", "แก้เกรด"],
      ...(rows.length ? rows : [["1", "65001", subjects[0]?.code || "TH101", subjects[0]?.name || "ภาษาไทย", "", "", "", "", ""]]),
    ]);
  }

  async function saveAll() {
    setSaving(true);
    setMsg(null);
    const payload = Object.entries(map).flatMap(([currentSubjectId, rows]) =>
      Object.entries(rows).filter(([, value]) => value._dirty).map(([studentId, value]) => ({
        student_id: studentId,
        subject_id: currentSubjectId,
        sem1_mid: value.sem1_mid ?? null,
        sem1_final: value.sem1_final ?? null,
        sem2_mid: value.sem2_mid ?? null,
        sem2_final: value.sem2_final ?? null,
        override_grade: value.override_grade ?? null,
        updated_at: new Date().toISOString(),
      }))
    );
    if (payload.length === 0) { setSaving(false); return; }
    const { error } = await supabase
      .from("subject_scores")
      .upsert(payload, { onConflict: "student_id,subject_id" });
    setSaving(false);
    if (error) { setMsg("บันทึกไม่สำเร็จ: " + error.message); return; }
    setMap((prev) => {
      const next: typeof prev = {};
      for (const [currentSubjectId, rows] of Object.entries(prev)) {
        next[currentSubjectId] = {};
        for (const [studentId, value] of Object.entries(rows)) next[currentSubjectId][studentId] = { ...value, _dirty: false };
      }
      return next;
    });
    undoMapRef.current = null;
    setMsg(`บันทึกคะแนนแล้ว ${payload.length} รายการ`);
  }

  function downloadImportErrors() {
    downloadCsvTemplate("scores-import-errors.csv", [["ลำดับ", "สาเหตุ"], ...importErrors.map((error, index) => [String(index + 1), error])]);
  }

  async function copyCurrentSubjectToClipboard() {
    if (!subject) return;
    const rows = [
      ["เลขที่", "เลขประจำตัว", "ชื่อ–สกุล", "รหัสวิชา", "ชื่อวิชา", "ภาค 1 ระหว่าง", "ภาค 1 ปลาย", "ภาค 2 ระหว่าง", "ภาค 2 ปลาย", "แก้เกรด"],
      ...students.map((student) => {
        const score = map[subject.id]?.[student.id] ?? {};
        return [String(student.no), student.student_code || "", fullName(student), subject.code, subject.name, score.sem1_mid ?? "", score.sem1_final ?? "", score.sem2_mid ?? "", score.sem2_final ?? "", score.override_grade ?? ""].map(String);
      }),
    ];
    try {
      await navigator.clipboard.writeText(rows.map((row) => row.join("\t")).join("\r\n"));
      setMsg(`คัดลอกตาราง ${subject.name} แล้ว สามารถวางใน Excel ได้ทันที`);
    } catch {
      setMsg("คัดลอกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์คลิปบอร์ดของเบราว์เซอร์");
    }
  }

  function undoBulkChange(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || !undoMapRef.current) return;
    event.preventDefault();
    setMap(undoMapRef.current);
    undoMapRef.current = null;
    setMsg("ย้อนกลับการนำเข้าหรือวางข้อมูลครั้งล่าสุดแล้ว");
  }

  const dirtyCount = useMemo(
    () => Object.values(map).reduce((count, rows) => count + Object.values(rows).filter((value) => value._dirty).length, 0),
    [map]
  );
  useUnsavedChangesWarning(dirtyCount > 0);
  const completion = useMemo(() => {
    const status = subjects.map((item) => {
      const rows = map[item.id] ?? {};
      const required = students.length * 4;
      const completed = students.reduce((count, student) => {
        const value = rows[student.id] ?? {};
        return count + [value.sem1_mid, value.sem1_final, value.sem2_mid, value.sem2_final].filter((score) => score !== null && score !== undefined).length;
      }, 0);
      return { subjectId: item.id, required, completed, missing: required - completed, ready: required > 0 && completed === required };
    });
    return { status, allReady: status.length > 0 && status.every((item) => item.ready) };
  }, [map, students, subjects]);

  if (subjects.length === 0) {
    return <div className="text-slate-400 py-10 text-center">ยังไม่มีรายวิชา — เพิ่มรายวิชาก่อน</div>;
  }

  return (
    <div className="space-y-4" onKeyDownCapture={undoBulkChange}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm max-w-md"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.order_no}. {s.name} ({s.category})
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          {msg && <span className="text-sm text-slate-500">{msg}</span>}
          <select value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" aria-label="วิธีจัดการคะแนนเดิม">
            <option value="fill_empty">เติมเฉพาะช่องว่าง</option>
            <option value="overwrite">เขียนทับคะแนนเดิม</option>
            <option value="skip_existing">ข้ามรายการที่มีคะแนน</option>
          </select>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} />
          <button onClick={downloadTemplate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">CSV ทุกวิชา</button>
          <button onClick={() => void copyCurrentSubjectToClipboard()} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">คัดลอกไป Excel</button>
          <button onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">นำเข้าคะแนนทุกวิชา</button>
          {!!importErrors.length && <button onClick={downloadImportErrors} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">ดาวน์โหลดข้อผิดพลาด ({importErrors.length})</button>}
          <button
            onClick={saveAll}
            disabled={saving || dirtyCount === 0}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : `บันทึก${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </button>
        </div>
      </div>

      {subject && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>คะแนนเต็ม: ระหว่างภาค {subject.midterm_max} + ปลายภาค {subject.final_max} = {subject.midterm_max + subject.final_max}</span>
          {(() => { const status = completion.status.find((item) => item.subjectId === subject.id); return <span className={`rounded-full px-2.5 py-1 font-medium ${status?.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{status?.ready ? "คะแนนครบสองภาคเรียน" : `ยังขาด ${status?.missing ?? 0} ช่อง`}</span>; })()}
          <span className={`rounded-full px-2.5 py-1 font-medium ${completion.allReady ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{completion.allReady ? "ทุกวิชาพร้อมพิมพ์ PDF" : "ยังไม่พร้อมพิมพ์ PDF"}</span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="text-sm min-w-[900px] w-full report-like">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2 w-10" rowSpan={2}>ที่</th>
              <th className="px-2 py-2 text-left" rowSpan={2}>ชื่อ - นามสกุล</th>
              <th className="px-2 py-2 text-center border-l" colSpan={4}>ภาคเรียนที่ 1</th>
              <th className="px-2 py-2 text-center border-l" colSpan={4}>ภาคเรียนที่ 2</th>
              <th className="px-2 py-2 text-center border-l" colSpan={3}>ตลอดปี</th>
            </tr>
            <tr className="text-xs">
              <th className="px-1 py-1 border-l">ระหว่าง</th>
              <th className="px-1 py-1">ปลาย</th>
              <th className="px-1 py-1">รวม</th>
              <th className="px-1 py-1">ผล</th>
              <th className="px-1 py-1 border-l">ระหว่าง</th>
              <th className="px-1 py-1">ปลาย</th>
              <th className="px-1 py-1">รวม</th>
              <th className="px-1 py-1">ผล</th>
              <th className="px-1 py-1 border-l">เฉลี่ย</th>
              <th className="px-1 py-1">เกรด</th>
              <th className="px-1 py-1 border-l">แก้เกรด</th>
            </tr>
          </thead>
          <tbody>
            {students.map((st, rowIndex) => {
              const sc = getScore(st.id);
              const res = computeSubjectResult(
                {
                  sem1_mid: sc.sem1_mid ?? null,
                  sem1_final: sc.sem1_final ?? null,
                  sem2_mid: sc.sem2_mid ?? null,
                  sem2_final: sc.sem2_final ?? null,
                  override_grade: sc.override_grade ?? null,
                },
                criteria
              );
              return (
                <tr key={st.id} className={`border-t border-slate-100 ${sc._dirty ? "bg-amber-50" : ""}`}>
                  <td className="px-1 py-1 text-center">{st.no}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{fullName(st)}</td>
                  <Num v={sc.sem1_mid} onC={(v) => setField(st.id, "sem1_mid", v)} onP={(event) => pasteScoreGrid(event, rowIndex, 0)} row={rowIndex} col={0} border />
                  <Num v={sc.sem1_final} onC={(v) => setField(st.id, "sem1_final", v)} onP={(event) => pasteScoreGrid(event, rowIndex, 1)} row={rowIndex} col={1} />
                  <td className="px-1 py-1 text-center text-slate-500">{res.sem1Total ?? ""}</td>
                  <td className="px-1 py-1 text-center font-medium">{gradeText(res.sem1Grade)}</td>
                  <Num v={sc.sem2_mid} onC={(v) => setField(st.id, "sem2_mid", v)} onP={(event) => pasteScoreGrid(event, rowIndex, 2)} row={rowIndex} col={2} border />
                  <Num v={sc.sem2_final} onC={(v) => setField(st.id, "sem2_final", v)} onP={(event) => pasteScoreGrid(event, rowIndex, 3)} row={rowIndex} col={3} />
                  <td className="px-1 py-1 text-center text-slate-500">{res.sem2Total ?? ""}</td>
                  <td className="px-1 py-1 text-center font-medium">{gradeText(res.sem2Grade)}</td>
                  <td className="px-1 py-1 text-center text-slate-500 border-l">
                    {res.yearAvg !== null ? res.yearAvg.toFixed(2) : ""}
                  </td>
                  <td className="px-1 py-1 text-center font-bold text-indigo-700">{gradeText(res.yearGrade)}</td>
                  <td className="px-1 py-1 border-l">
                    <input
                      type="number"
                      step="0.5"
                      placeholder="-"
                      value={sc.override_grade ?? ""}
                      onChange={(e) => setField(st.id, "override_grade", e.target.value)}
                      onPaste={(event) => pasteScoreGrid(event, rowIndex, 4)}
                      onKeyDown={moveScoreCell}
                      data-score-row={rowIndex}
                      data-score-col={4}
                      className="w-14 rounded border border-amber-300 px-1 py-1 text-center"
                      title="กรอกเพื่อแก้เกรดรายปีด้วยตนเอง (เว้นว่าง = ใช้ค่าที่ระบบคำนวณ)"
                    />
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr><td colSpan={13} className="px-4 py-8 text-center text-slate-400">ยังไม่มีนักเรียน</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Num({
  v,
  onC,
  onP,
  row,
  col,
  border,
}: {
  v: number | null | undefined;
  onC: (val: string) => void;
  onP: (event: ClipboardEvent<HTMLInputElement>) => void;
  row: number;
  col: number;
  border?: boolean;
}) {
  return (
    <td className={`px-1 py-1 ${border ? "border-l" : ""}`}>
      <input
        type="number"
        value={v ?? ""}
        onChange={(e) => onC(e.target.value)}
        onPaste={onP}
        onKeyDown={moveScoreCell}
        data-score-row={row}
        data-score-col={col}
        className="w-14 rounded border border-slate-200 px-1 py-1 text-center"
      />
    </td>
  );
}

function moveScoreCell(event: KeyboardEvent<HTMLInputElement>) {
  const movement: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };
  const delta = movement[event.key];
  if (!delta) return;

  const row = Number(event.currentTarget.dataset.scoreRow);
  const col = Number(event.currentTarget.dataset.scoreCol);
  const next = document.querySelector<HTMLInputElement>(
    `[data-score-row="${row + delta[0]}"][data-score-col="${col + delta[1]}"]`
  );
  if (!next) return;

  event.preventDefault();
  next.focus();
  next.select();
}
