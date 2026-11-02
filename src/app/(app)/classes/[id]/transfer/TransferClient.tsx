"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { GradeCriterion, Student, Subject, SubjectScore, TransferSubject, TransferSource } from "@/lib/types";
import { fullName } from "@/lib/types";
import { computeSubjectResult, gradeText, scoreToGrade } from "@/lib/grading";
import { decodeCsv, downloadCsvTemplate } from "@/lib/curriculum-csv";
import { parseCsv } from "@/lib/student-csv";
import { seedTransferDefaults } from "./actions";
import { usePasswordDelete } from "@/components/PasswordDeleteGuard";

type Row = Partial<TransferSubject> & { _key: string; _new?: boolean };

function formatRoundedAverage(value: number | null): string {
  return value === null ? "-" : Math.round(value).toString();
}
const CATS = ["พื้นฐาน", "ประยุกต์", "เพิ่มเติม"];

export default function TransferClient({
  classId,
  students,
  subjects,
  transferSubjects,
  transferSources,
  scores,
  criteria,
}: {
  classId: string;
  students: Student[];
  subjects: Subject[];
  transferSubjects: TransferSubject[];
  transferSources: TransferSource[];
  scores: SubjectScore[];
  criteria: GradeCriterion[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(transferSubjects.map((t) => ({ ...t, _key: t.id })));
  const [sourceMap, setSourceMap] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {};
    for (const t of transferSubjects) m[t.id] = new Set();
    for (const s of transferSources) {
      if (!m[s.transfer_subject_id]) m[s.transfer_subject_id] = new Set();
      m[s.transfer_subject_id].add(s.subject_id);
    }
    return m;
  });
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showCalculated, setShowCalculated] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "");
  const [calculatedStudentId, setCalculatedStudentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const { requestDelete, deletePasswordDialog } = usePasswordDelete();

  function upd(key: string, field: keyof TransferSubject, val: string | number | boolean) {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, [field]: val } : r)));
  }
  function addRow() {
    const nextNo = rows.reduce((m, r) => Math.max(m, r.order_no || 0), 0) + 1;
    const key = `new-${Date.now()}`;
    setRows((rs) => [...rs, { _key: key, _new: true, class_id: classId, order_no: nextNo, category: "พื้นฐาน", code: "", name: "", credits: 0, enabled: true }]);
    setSourceMap((m) => ({ ...m, [key]: new Set() }));
  }
  function removeRow(key: string) {
    const row = rows.find((item) => item._key === key);
    requestDelete({
      title: "ยืนยันการลบวิชาเทียบโอน",
      description: `ลบวิชา “${row?.name || "รายการนี้"}”? ต้องกดบันทึกเพื่อบันทึกการเปลี่ยนแปลง`,
      onVerified: () => setRows((rs) => rs.filter((r) => r._key !== key)),
    });
  }
  function toggleSource(key: string, subjectId: string) {
    setSourceMap((m) => {
      const set = new Set(m[key] ?? []);
      if (set.has(subjectId)) set.delete(subjectId);
      else set.add(subjectId);
      return { ...m, [key]: set };
    });
  }

  function calculatedResult(key: string): { average: number | null; grade: number | null } {
    const selected = subjects.filter((subject) => (sourceMap[key] ?? new Set()).has(subject.id));
    if (!selected.length) return { average: null, grade: null };
    const scoreByStudent = new Map<string, { weighted: number; weight: number }>();
    for (const subject of selected) {
      const weight = Number(subject.credits) > 0 ? Number(subject.credits) : 1;
      for (const score of scores.filter((item) => item.subject_id === subject.id)) {
        const result = computeSubjectResult(score, criteria);
        if (result.yearAvg === null) continue;
        const current = scoreByStudent.get(score.student_id) ?? { weighted: 0, weight: 0 };
        current.weighted += result.yearAvg * weight;
        current.weight += weight;
        scoreByStudent.set(score.student_id, current);
      }
    }
    const studentAverages = [...scoreByStudent.values()]
      .filter((item) => item.weight > 0)
      .map((item) => item.weighted / item.weight);
    const average = studentAverages.length
      ? studentAverages.reduce((sum, value) => sum + value, 0) / studentAverages.length
      : null;
    return { average, grade: scoreToGrade(average, criteria) };
  }

  function studentCalculation(key: string, studentId: string) {
    const sourceRows = subjects
      .filter((subject) => (sourceMap[key] ?? new Set()).has(subject.id))
      .sort((a, b) => a.order_no - b.order_no)
      .map((subject) => {
        const score = scores.find((item) => item.subject_id === subject.id && item.student_id === studentId);
        const result = score ? computeSubjectResult(score, criteria) : null;
        return {
          subject,
          weight: Number(subject.credits) > 0 ? Number(subject.credits) : 1,
          sem1: result?.sem1Total ?? null,
          sem2: result?.sem2Total ?? null,
          year: result?.yearAvg ?? null,
        };
      });

    const resultFor = (field: "sem1" | "sem2" | "year") => {
      const available = sourceRows.filter((item) => item[field] !== null);
      const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
      const average = totalWeight
        ? available.reduce((sum, item) => sum + (item[field] ?? 0) * item.weight, 0) / totalWeight
        : null;
      return { average, grade: scoreToGrade(average, criteria) };
    };

    return { sourceRows, sem1: resultFor("sem1"), sem2: resultFor("sem2"), year: resultFor("year") };
  }

  async function importCsv(file: File) {
    try {
      const table = parseCsv(decodeCsv(await file.arrayBuffer()).replace(/^\uFEFF/, ""));
      if (table.length < 2) throw new Error("ไฟล์ CSV ไม่มีข้อมูล");
      const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_.\-()]/g, "");
      const headers = table[0].map(normalize);
      const col = (...aliases: string[]) => headers.findIndex((header) => aliases.some((alias) => header === normalize(alias)));
      const idx = {
        order: col("ที่", "ลำดับ"), code: col("รหัสวิชา", "รหัส"),
        name: col("รายวิชา 2560", "รายวิชาหลักสูตร 2560", "ชื่อวิชา"),
        category: col("ประเภท"), credits: col("น้ำหนัก", "หน่วยกิต"),
        sources: col("รหัสวิชาต้นทาง", "วิชาต้นทาง 2568"),
      };
      if (idx.name < 0) throw new Error("ไม่พบคอลัมน์รายวิชา 2560");
      const imported: Row[] = [];
      const importedMap: Record<string, Set<string>> = {};
      table.slice(1).forEach((values, index) => {
        const name = (values[idx.name] ?? "").trim();
        if (!name) return;
        const key = `csv-${Date.now()}-${index}`;
        imported.push({
          _key: key, _new: true, class_id: classId,
          order_no: Number(values[idx.order]) || index + 1,
          code: (values[idx.code] ?? "").trim(), name,
          category: (values[idx.category] ?? "").trim() || "พื้นฐาน",
          credits: Number(values[idx.credits]) || 0, enabled: true,
        });
        const sourceCodes = (values[idx.sources] ?? "").split(/[|;]+/).map((value) => value.trim()).filter(Boolean);
        importedMap[key] = new Set(subjects.filter((subject) => sourceCodes.includes(subject.code)).map((subject) => subject.id));
      });
      if (!imported.length) throw new Error("ไม่พบรายการที่นำเข้าได้");
      setRows(imported);
      setSourceMap(importedMap);
      setShowCalculated(false);
      setMsg({ t: "ok", m: `นำเข้า ${imported.length} วิชาแล้ว กรุณาตรวจสอบและกดบันทึก` });
    } catch (error) {
      setMsg({ t: "err", m: `นำเข้าไม่สำเร็จ: ${error instanceof Error ? error.message : "รูปแบบไฟล์ไม่ถูกต้อง"}` });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function downloadTemplate() {
    downloadCsvTemplate("transfer-2560-template.csv", [
      ["ที่", "รหัสวิชา", "รายวิชา 2560", "ประเภท", "น้ำหนัก", "รหัสวิชาต้นทาง"],
      ["1", "ท16101", "ภาษาไทย", "พื้นฐาน", "3", subjects[0]?.code || "ท16101"],
    ]);
  }

  async function handleSeed() {
    setSeeding(true);
    const res = await seedTransferDefaults(classId);
    setSeeding(false);
    if (res.ok) router.refresh();
    else setMsg({ t: "err", m: res.error || "ไม่สำเร็จ" });
  }

  async function saveAll() {
    setSaving(true);
    setMsg(null);
    // 1) upsert transfer subjects, จับคู่ _key -> id จริง
    const keyToId: Record<string, string> = {};
    for (const r of rows) {
      const payload = {
        class_id: classId,
        order_no: Number(r.order_no) || 0,
        category: r.category || "พื้นฐาน",
        code: r.code || "",
        name: r.name || "",
        credits: Number(r.credits) || 0,
        enabled: r.enabled ?? true,
      };
      if (r._new) {
        const { data, error } = await supabase.from("transfer_subjects").insert(payload).select("id").single();
        if (error) { setSaving(false); setMsg({ t: "err", m: error.message }); return; }
        keyToId[r._key] = data!.id;
      } else {
        const { error } = await supabase.from("transfer_subjects").update(payload).eq("id", r.id!);
        if (error) { setSaving(false); setMsg({ t: "err", m: error.message }); return; }
        keyToId[r._key] = r.id!;
      }
    }
    // ลบวิชาเทียบโอนที่ถูกเอาออก
    const keepIds = Object.values(keyToId);
    const removed = transferSubjects.filter((t) => !keepIds.includes(t.id)).map((t) => t.id);
    if (removed.length) await supabase.from("transfer_subjects").delete().in("id", removed);

    // 2) sync sources: ลบของทั้งหมดแล้วใส่ใหม่
    if (keepIds.length) await supabase.from("transfer_sources").delete().in("transfer_subject_id", keepIds);
    const inserts: { transfer_subject_id: string; subject_id: string }[] = [];
    for (const [key, id] of Object.entries(keyToId)) {
      for (const subjectId of sourceMap[key] ?? []) inserts.push({ transfer_subject_id: id, subject_id: subjectId });
    }
    if (inserts.length) {
      const { error } = await supabase.from("transfer_sources").insert(inserts);
      if (error) { setSaving(false); setMsg({ t: "err", m: error.message }); return; }
    }
    setSaving(false);
    setMsg({ t: "ok", m: "บันทึกการเทียบโอนแล้ว" });
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-14 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">บันทึกรายวิชาเทียบโอน หลักสูตร 2560</h2>
        <div className="text-slate-500">ยังไม่ได้ตั้งค่าวิชาเทียบโอนสำหรับห้องนี้</div>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          การเทียบโอนคือการจับคู่ “วิชาหลักสูตรใหม่ (ต้นทาง)” เข้ากับ “วิชาโครงสร้างเดิม (ปลายทาง)”
          ระบบจะดึงคะแนนรายปีจากวิชาต้นทางมาคำนวณให้ (รวมได้หลายวิชา → 1)
        </p>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="rounded-lg bg-indigo-600 text-white px-5 py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
        >
          {seeding ? "กำลังสร้าง..." : "สร้างวิชาเทียบโอนเริ่มต้น (12 วิชา + จับคู่ 1:1)"}
        </button>
        {msg && <div className="text-sm text-red-600">{msg.m}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {deletePasswordDialog}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">บันทึกรายวิชาเทียบโอน หลักสูตร 2560</h2>
        <p className="text-sm text-slate-500">จับคู่รายวิชาหลักสูตรใหม่ 2568 กับรายวิชาในหลักสูตร 2560</p>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-slate-500">
          จับคู่วิชาต้นทาง (หลักสูตรใหม่ 2568) → วิชาปลายทาง (หลักสูตร 2560) · รวมหลายวิชาเป็น 1 ได้
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {msg && <span className={`text-sm ${msg.t === "ok" ? "text-emerald-600" : "text-red-600"}`}>{msg.m}</span>}
          <Link href={`/print/${classId}/transfer-summary?term=1`} target="_blank" className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
            ภาพรวม / สถิติ ↗
          </Link>
          <Link href={`/print/${classId}/report-transfer?term=1`} target="_blank" className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
            PDF รายบุคคล ↗
          </Link>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} />
          <button onClick={downloadTemplate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">CSV ตัวอย่าง</button>
          <button onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">นำเข้า CSV</button>
          <button onClick={() => setShowCalculated(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">คำนวณค่าเฉลี่ยถ่วงน้ำหนัก</button>
          <button onClick={addRow} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">+ เพิ่มวิชา</button>
          <button onClick={saveAll} disabled={saving} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="transfer-student" className="mb-1 block text-sm font-medium text-slate-700">
              ตรวจสอบการคำนวณเทียบโอนรายนักเรียน
            </label>
            <select
              id="transfer-student"
              value={selectedStudentId}
              onChange={(event) => {
                setSelectedStudentId(event.target.value);
                setCalculatedStudentId(null);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {students.length === 0 && <option value="">— ยังไม่มีนักเรียน —</option>}
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.no}. {fullName(student)}{student.student_code ? ` (${student.student_code})` : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!selectedStudentId}
            onClick={() => setCalculatedStudentId(selectedStudentId)}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            คำนวณและตรวจสอบ
          </button>
        </div>

        {calculatedStudentId && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-emerald-200 bg-white">
            <div className="border-b border-emerald-100 px-4 py-2 text-sm font-semibold text-slate-700">
              ผลการตรวจสอบ: {fullName(students.find((student) => student.id === calculatedStudentId)!)}
            </div>
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">วิชาปลายทาง 2560</th>
                  <th className="px-3 py-2 text-left">คะแนนวิชาต้นทาง 2568 (น้ำหนัก)</th>
                  <th className="px-2 py-2">ภาค 1</th>
                  <th className="px-2 py-2">เกรด</th>
                  <th className="px-2 py-2">ภาค 2</th>
                  <th className="px-2 py-2">เกรด</th>
                  <th className="px-2 py-2">รายปี</th>
                  <th className="px-2 py-2">เกรด</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter((row) => row.enabled ?? true).map((row) => {
                  const calculation = studentCalculation(row._key, calculatedStudentId);
                  const resultCell = (result: { average: number | null; grade: number | null }) =>
                    formatRoundedAverage(result.average);
                  return (
                    <tr key={row._key} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 font-medium text-slate-800">{row.order_no}. {row.name || "-"}</td>
                      <td className="px-3 py-2">
                        {calculation.sourceRows.length ? calculation.sourceRows.map((item) => (
                          <div key={item.subject.id} className="mb-1 last:mb-0">
                            {item.subject.name}: ภ1 {item.sem1?.toFixed(2) ?? "-"} · ภ2 {item.sem2?.toFixed(2) ?? "-"} · ปี {item.year?.toFixed(2) ?? "-"} <span className="text-slate-400">(น้ำหนัก {item.weight})</span>
                          </div>
                        )) : <span className="text-rose-500">ยังไม่ได้เลือกวิชาต้นทาง</span>}
                      </td>
                      <td className="px-2 py-2 text-center font-semibold text-emerald-700">{resultCell(calculation.sem1)}</td>
                      <td className="px-2 py-2 text-center font-bold text-indigo-700">{gradeText(calculation.sem1.grade) || "-"}</td>
                      <td className="px-2 py-2 text-center font-semibold text-emerald-700">{resultCell(calculation.sem2)}</td>
                      <td className="px-2 py-2 text-center font-bold text-indigo-700">{gradeText(calculation.sem2.grade) || "-"}</td>
                      <td className="px-2 py-2 text-center font-semibold text-emerald-700">{resultCell(calculation.year)}</td>
                      <td className="px-2 py-2 text-center font-bold text-indigo-700">{gradeText(calculation.year.grade) || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-emerald-100 px-4 py-2 text-xs text-slate-500">
              สูตร: รวม (คะแนนวิชาต้นทาง × น้ำหนัก) ÷ ผลรวมน้ำหนักของวิชาที่มีคะแนน แล้วตัดเกรดตามเกณฑ์ของโรงเรียน
            </p>
          </div>
        )}
      </section>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="text-sm min-w-[1420px] w-full">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2 w-12">ใช้</th>
              <th className="px-2 py-2 w-12">ที่</th>
              <th className="px-2 py-2 w-24">รหัสวิชา</th>
              <th className="px-2 py-2 w-52">รายวิชาหลักสูตร 2560</th>
              <th className="px-2 py-2 w-24">ประเภท</th>
              <th className="px-2 py-2 w-20">น้ำหนัก</th>
              <th className="px-2 py-2 w-24">เทียบโอน<br />รายวิชา</th>
              <th className="px-2 py-2 w-64">รายวิชาหลักสูตรใหม่ 2568</th>
              <th className="px-2 py-2 w-28">ประเภท</th>
              <th className="px-2 py-2 w-24">น้ำหนัก</th>
              <th className="px-2 py-2 w-28">เพิ่มรายวิชา</th>
              <th className="px-2 py-2 w-24">ค่าเฉลี่ย</th>
              <th className="px-2 py-2 w-20">เกรด</th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sources = sourceMap[r._key] ?? new Set<string>();
              const sourceRows = subjects
                .filter((subject) => sources.has(subject.id))
                .sort((a, b) => a.order_no - b.order_no);
              const calculated = calculatedResult(r._key);
              return (
                <tr key={r._key} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-center">
                    <input type="checkbox" checked={r.enabled ?? true} onChange={(e) => upd(r._key, "enabled", e.target.checked)} />
                  </td>
                  <td className="px-1 py-1"><input type="number" value={r.order_no ?? ""} onChange={(e) => upd(r._key, "order_no", e.target.value)} className="w-11 rounded border border-slate-200 px-1 py-1" /></td>
                  <td className="px-1 py-1"><input value={r.code ?? ""} onChange={(e) => upd(r._key, "code", e.target.value)} className="w-full rounded border border-slate-200 px-1.5 py-1" /></td>
                  <td className="px-1 py-1"><input value={r.name ?? ""} onChange={(e) => upd(r._key, "name", e.target.value)} className="w-full rounded border border-slate-200 px-1.5 py-1" /></td>
                  <td className="px-1 py-1">
                    <select value={r.category ?? ""} onChange={(e) => upd(r._key, "category", e.target.value)} className="w-full rounded border border-slate-200 px-1 py-1">
                      {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1"><input type="number" value={r.credits ?? ""} onChange={(e) => upd(r._key, "credits", e.target.value)} className="w-16 rounded border border-slate-200 px-1 py-1" /></td>
                  <td className="px-1 py-1">
                    <span className="block text-center font-semibold text-indigo-700">{sourceRows.length || "-"}</span>
                  </td>
                  <td className="px-2 py-2">
                    {sourceRows.length === 0 ? (
                      <span className="text-rose-500 text-xs">ยังไม่ได้เลือกวิชา</span>
                    ) : (
                      <div className="space-y-1">
                        {sourceRows.map((subject) => <div key={subject.id} className="text-xs">{subject.order_no}. {subject.name}</div>)}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center text-xs">{sourceRows.map((subject) => subject.category).join(" / ") || "-"}</td>
                  <td className="px-2 py-2 text-center text-xs">{sourceRows.map((subject) => subject.credits).join(" / ") || "-"}</td>
                  <td className="px-1 py-1 text-center">
                    <button onClick={() => setPickFor(r._key)} className="rounded-md border border-indigo-200 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50">
                      + เลือก / เพิ่ม
                    </button>
                  </td>
                  <td className="px-2 py-2 text-center font-semibold text-emerald-700">{showCalculated ? formatRoundedAverage(calculated.average) : "กดคำนวณ"}</td>
                  <td className="px-2 py-2 text-center font-bold text-indigo-700">{showCalculated ? (gradeText(calculated.grade) || "-") : "-"}</td>
                  <td className="px-1 py-1 text-center"><button onClick={() => removeRow(r._key)} className="text-rose-500">✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        หมายเหตุ: หากเลือกวิชาหลักสูตรใหม่มากกว่า 1 วิชา ระบบจะเฉลี่ยคะแนนของวิชาเหล่านั้นแยกตามนักเรียนและภาคเรียน แล้วตัดเกรดให้อัตโนมัติในรายงาน PDF
      </p>

      {/* modal เลือกวิชาต้นทาง */}
      {pickFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setPickFor(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">เลือกวิชาต้นทาง</h3>
            <p className="text-xs text-slate-400 mb-3">
              ปลายทาง: {rows.find((r) => r._key === pickFor)?.name || "-"}
            </p>
            <div className="space-y-1.5">
              {subjects.map((s) => {
                const checked = (sourceMap[pickFor] ?? new Set()).has(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggleSource(pickFor, s.id)} />
                    <span className="text-slate-400 w-6">{s.order_no}.</span>
                    <span>{s.name}</span>
                    <span className="text-xs text-slate-400 ml-auto">{s.category}</span>
                  </label>
                );
              })}
              {subjects.length === 0 && <div className="text-sm text-slate-400">ยังไม่มีรายวิชาในห้องนี้</div>}
            </div>
            <div className="mt-4 text-right">
              <button onClick={() => setPickFor(null)} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm">เสร็จสิ้น</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

