"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SubjectCompetencyLevel } from "@/lib/types";
import { usePasswordDelete } from "@/components/PasswordDeleteGuard";
import { decodeCsv, downloadCsvTemplate, parseCompetencyLevelsCsv } from "@/lib/curriculum-csv";

type Row = Partial<SubjectCompetencyLevel> & { _key: string; _dirty?: boolean; _new?: boolean };

function fullGradeLevel(value: string): string {
  const gradeLevel = value.trim();
  const primary = gradeLevel.match(/^ป\.?\s*(\d+)$/i);
  if (primary) return `ชั้นประถมศึกษาปีที่ ${primary[1]}`;
  const secondary = gradeLevel.match(/^ม\.?\s*(\d+)$/i);
  if (secondary) return `ชั้นมัธยมศึกษาปีที่ ${secondary[1]}`;
  if (!gradeLevel || gradeLevel.startsWith("ชั้น")) return gradeLevel;
  return `ชั้น${gradeLevel}`;
}

const OTHER_TEXT_FIELDS: { key: keyof SubjectCompetencyLevel; label: string; width: string }[] = [
  { key: "beginner_text", label: "เริ่มต้น", width: "min-w-[300px]" },
  { key: "developing_text", label: "พัฒนา", width: "min-w-[300px]" },
  { key: "proficient_text", label: "ชำนาญ (ตามเกณฑ์ที่คาดหวัง)", width: "min-w-[300px]" },
  { key: "expert_text", label: "เชี่ยวชาญ", width: "min-w-[300px]" },
];

export default function CompetencyLevelsClient({
  classId,
  gradeLevel,
  initial,
}: {
  classId: string;
  gradeLevel: string;
  initial: SubjectCompetencyLevel[];
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>(initial.map((row) => ({ ...row, _key: row.id })));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { requestDelete, deletePasswordDialog } = usePasswordDelete();
  const competencyLabel = `ความสามารถของผู้เรียนเมื่อจบ ${fullGradeLevel(gradeLevel)}`.trim();
  const textFields: { key: keyof SubjectCompetencyLevel; label: string; width: string }[] = [
    { key: "competency_text", label: competencyLabel, width: "min-w-[360px]" },
    ...OTHER_TEXT_FIELDS,
  ];

  function update(key: string, field: keyof SubjectCompetencyLevel, value: string | number) {
    setRows((current) =>
      current.map((row) => (row._key === key ? { ...row, [field]: value, _dirty: true } : row))
    );
  }

  function addRow() {
    const nextNo = rows.reduce((max, row) => Math.max(max, Number(row.order_no) || 0), 0) + 1;
    setRows((current) => [...current, {
      _key: `new-${Date.now()}`,
      _new: true,
      _dirty: true,
      class_id: classId,
      order_no: nextNo,
      subject_name: "",
      competency_text: "",
      beginner_text: "",
      developing_text: "",
      proficient_text: "",
      expert_text: "",
    }]);
    setMessage(null);
  }

  async function importCsv(file: File) {
    setMessage(null);
    try {
      const imported = parseCompetencyLevelsCsv(decodeCsv(await file.arrayBuffer()));
      setRows((current) => {
        const next = [...current];
        for (const item of imported) {
          const index = next.findIndex((row) => Number(row.order_no) === item.order_no);
          if (index >= 0) next[index] = { ...next[index], ...item, _dirty: true };
          else next.push({ ...item, class_id: classId, _key: `csv-${Date.now()}-${item.order_no}`, _new: true, _dirty: true });
        }
        return next.sort((a, b) => (Number(a.order_no) || 0) - (Number(b.order_no) || 0));
      });
      setMessage(`นำเข้า ${imported.length} รายวิชาแล้ว กรุณาตรวจสอบและกดบันทึก`);
    } catch (error) {
      setMessage(`นำเข้าไม่สำเร็จ: ${error instanceof Error ? error.message : "รูปแบบไฟล์ไม่ถูกต้อง"}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function downloadTemplate() {
    downloadCsvTemplate("competency-levels-2568-template.csv", [
      ["ที่", "รายวิชาหลักสูตรใหม่ 2568", competencyLabel, "เริ่มต้น", "พัฒนา", "ชำนาญ", "เชี่ยวชาญ"],
      ["1", "ภาษาไทย", "ผู้เรียนวิเคราะห์และเลือกข้อมูลอย่างมีเหตุผล", "เริ่มสื่อสารความคิดเห็น", "สื่อสารได้เป็นระบบ", "วิเคราะห์และสื่อสารอย่างมีเหตุผล", "ประยุกต์ใช้ได้อย่างเชี่ยวชาญ"],
    ]);
  }

  function removeRow(key: string) {
    const row = rows.find((item) => item._key === key);
    if (!row) return;
    requestDelete({
      title: "ยืนยันการลบเกณฑ์ความสามารถ",
      description: `ลบเกณฑ์ของวิชา “${row.subject_name || "รายการนี้"}” หรือไม่?`,
      onVerified: async () => {
        if (row._new) {
          setRows((current) => current.filter((item) => item._key !== key));
          return;
        }
        const { error } = await supabase.from("subject_competency_levels").delete().eq("id", row.id!);
        if (error) setMessage(`ลบไม่สำเร็จ: ${error.message}`);
        else {
          setRows((current) => current.filter((item) => item._key !== key));
          setMessage("ลบรายการแล้ว");
        }
      },
    });
  }

  async function saveAll() {
    setSaving(true);
    setMessage(null);
    let saved = true;

    for (const row of rows.filter((item) => item._dirty)) {
      const payload = {
        class_id: classId,
        order_no: Number(row.order_no) || 0,
        subject_name: row.subject_name?.trim() || "",
        competency_text: row.competency_text?.trim() || "",
        beginner_text: row.beginner_text?.trim() || "",
        developing_text: row.developing_text?.trim() || "",
        proficient_text: row.proficient_text?.trim() || "",
        expert_text: row.expert_text?.trim() || "",
      };

      if (row._new) {
        const { data, error } = await supabase
          .from("subject_competency_levels").insert(payload).select("id").single();
        if (error) {
          saved = false;
          setMessage(`บันทึกไม่สำเร็จ: ${error.message}`);
          break;
        }
        row.id = data.id;
        row._key = data.id;
        row._new = false;
      } else {
        const { error } = await supabase
          .from("subject_competency_levels").update(payload).eq("id", row.id!);
        if (error) {
          saved = false;
          setMessage(`บันทึกไม่สำเร็จ: ${error.message}`);
          break;
        }
      }
      row._dirty = false;
    }

    setRows((current) => [...current]);
    setSaving(false);
    if (saved) setMessage("บันทึกเกณฑ์ระดับความสามารถแล้ว");
  }

  const dirtyCount = rows.filter((row) => row._dirty).length;

  return (
    <div className="space-y-4">
      {deletePasswordDialog}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">
          เกณฑ์ระดับความสามารถรายวิชา หลักสูตรใหม่ 2568
        </h2>
        <p className="text-sm text-slate-500">
          แก้ไขรายละเอียดแต่ละระดับ เพิ่มแถว หรือลดแถวให้เหมาะกับรายวิชาของห้องเรียน
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-slate-500">ทั้งหมด {rows.length} รายวิชา</span>
        <div className="flex items-center gap-2">
          {message && <span className="text-sm text-slate-500">{message}</span>}
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} />
          <button onClick={downloadTemplate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">ดาวน์โหลด CSV ตัวอย่าง</button>
          <button onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-100">นำเข้า CSV</button>
          <button onClick={addRow} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            + เพิ่มแถว
          </button>
          <button
            onClick={saveAll}
            disabled={saving || dirtyCount === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : `บันทึก${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-x-auto">
        <table className="w-full min-w-[2050px] text-sm align-top">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="sticky left-0 z-20 w-16 bg-slate-50 px-2 py-3">ที่</th>
              <th className="sticky left-16 z-20 min-w-[220px] bg-slate-50 px-2 py-3">
                รายวิชาหลักสูตรใหม่ 2568
              </th>
              {textFields.map((field) => (
                <th key={field.key} className={`${field.width} px-2 py-3`}>{field.label}</th>
              ))}
              <th className="w-20 px-2 py-3">ลดแถว</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._key} className={`border-t border-slate-100 ${row._dirty ? "bg-amber-50" : ""}`}>
                <td className={`sticky left-0 z-10 px-2 py-2 ${row._dirty ? "bg-amber-50" : "bg-white"}`}>
                  <input
                    type="number"
                    min={1}
                    value={row.order_no ?? ""}
                    onChange={(event) => update(row._key, "order_no", event.target.value)}
                    className="w-12 rounded border border-slate-200 px-1 py-2 text-center"
                  />
                </td>
                <td className={`sticky left-16 z-10 px-2 py-2 ${row._dirty ? "bg-amber-50" : "bg-white"}`}>
                  <textarea
                    rows={5}
                    value={row.subject_name || ""}
                    onChange={(event) => update(row._key, "subject_name", event.target.value)}
                    className="w-full resize-y rounded border border-slate-200 px-2 py-2"
                  />
                </td>
                {textFields.map((field) => (
                  <td key={field.key} className="px-2 py-2">
                    <textarea
                      rows={5}
                      value={String(row[field.key] || "")}
                      onChange={(event) => update(row._key, field.key, event.target.value)}
                      className="w-full resize-y rounded border border-slate-200 px-2 py-2 leading-6"
                    />
                  </td>
                ))}
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => removeRow(row._key)}
                    className="rounded-lg border border-rose-200 px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  ยังไม่มีรายการ กด “+ เพิ่มแถว” เพื่อเริ่มบันทึก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">เลื่อนตารางในแนวนอนเพื่อดูเกณฑ์ทุกระดับ</p>
    </div>
  );
}
