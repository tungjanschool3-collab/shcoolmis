"use client";

import { Fragment, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Student, Activity, ActivityResult } from "@/lib/types";
import { fullName } from "@/lib/types";
import { usePasswordDelete } from "@/components/PasswordDeleteGuard";
import { decodeCsv, downloadCsvTemplate } from "@/lib/curriculum-csv";
import { parseCsv } from "@/lib/student-csv";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

type Cell = Partial<ActivityResult> & { _dirty?: boolean };
type ActivityRow = Partial<Activity> & { _key: string; _dirty?: boolean; _new?: boolean };
const OPTIONS = ["", "ผ่าน", "ไม่ผ่าน"];

export default function ActivitiesClient({
  classId,
  activities,
  students,
  results,
}: {
  classId: string;
  activities: Activity[];
  students: Student[];
  results: ActivityResult[];
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>(
    activities.map((activity) => ({ ...activity, _key: activity.id }))
  );
  const { requestDelete, deletePasswordDialog } = usePasswordDelete();
  const [map, setMap] = useState<Record<string, Record<string, Cell>>>(() => {
    const m: Record<string, Record<string, Cell>> = {};
    for (const r of results) {
      if (!m[r.student_id]) m[r.student_id] = {};
      m[r.student_id][r.activity_id] = { ...r };
    }
    return m;
  });

  function get(sid: string, aid: string): Cell {
    return map[sid]?.[aid] ?? {};
  }
  function setField(sid: string, aid: string, sem: "sem1_result" | "sem2_result", value: string) {
    setMap((prev) => {
      const row = { ...(prev[sid] ?? {}) };
      row[aid] = { ...(row[aid] ?? {}), [sem]: value, _dirty: true, student_id: sid, activity_id: aid };
      return { ...prev, [sid]: row };
    });
  }

  function setAllPassed(sem: "sem1_result" | "sem2_result", onlyEmpty: boolean) {
    const savedActivities = activityRows.filter((activity) => !activity._new);
    if (!students.length || !savedActivities.length) {
      setMsg("ต้องมีนักเรียนและกิจกรรมที่บันทึกแล้วก่อนเลือกผ่านทั้งหมด");
      return;
    }
    const termLabel = sem === "sem1_result" ? "ภาคเรียนที่ 1" : "ภาคเรียนที่ 2";
    const modeLabel = onlyEmpty ? "เฉพาะช่องว่าง" : "ทุกช่อง";
    if (!window.confirm(`กำหนดผลเป็น “ผ่าน” ${modeLabel} ของ${termLabel} สำหรับนักเรียน ${students.length} คนหรือไม่?`)) return;

    let changed = 0;
    setMap((current) => {
      const next = { ...current };
      for (const student of students) {
        const studentRow = { ...(next[student.id] ?? {}) };
        for (const activity of savedActivities) {
          const previous = studentRow[activity._key] ?? {};
          const currentValue = previous[sem] ?? "";
          if ((onlyEmpty && currentValue !== "") || currentValue === "ผ่าน") continue;
          studentRow[activity._key] = {
            ...previous,
            [sem]: "ผ่าน",
            _dirty: true,
            student_id: student.id,
            activity_id: activity._key,
          };
          changed += 1;
        }
        next[student.id] = studentRow;
      }
      return next;
    });
    setMsg(`กำหนด “ผ่าน” ${modeLabel} ของ${termLabel}แล้ว ${changed} ช่อง กรุณาตรวจสอบและกดบันทึก`);
  }

  function updateActivity(key: string, field: keyof Activity, value: string | number) {
    setActivityRows((current) => current.map((activity) =>
      activity._key === key ? { ...activity, [field]: value, _dirty: true } : activity
    ));
    setMsg(null);
  }

  function addActivity() {
    setActivityRows((current) => [...current, {
      _key: `new-${Date.now()}`,
      _new: true,
      _dirty: true,
      class_id: classId,
      order_no: current.length + 1,
      code: "",
      name: "",
      hours: 0,
    }]);
    setMsg(null);
  }

  function removeMapActivity(activityKey: string) {
    setMap((current) => {
      const copy: typeof current = {};
      for (const [studentId, row] of Object.entries(current)) {
        copy[studentId] = { ...row };
        delete copy[studentId][activityKey];
      }
      return copy;
    });
  }

  function removeActivity(key: string) {
    const activity = activityRows.find((row) => row._key === key);
    if (!activity) return;
    requestDelete({
      title: "ยืนยันการลบกิจกรรม",
      description: `ลบกิจกรรม “${activity.name || "รายการนี้"}” หรือไม่? ผลการประเมินของกิจกรรมนี้จะถูกลบด้วย`,
      onVerified: async () => {
        if (!activity._new) {
          const { error } = await supabase.from("activities").delete().eq("id", activity.id!);
          if (error) { setMsg("ลบกิจกรรมไม่สำเร็จ: " + error.message); return; }
        }
        const remaining = activityRows.filter((row) => row._key !== key).map((row, index) => {
          const nextNo = index + 1;
          return {
            ...row,
            order_no: nextNo,
            _dirty: row._new || Number(row.order_no) !== nextNo ? true : row._dirty,
          };
        });
        setActivityRows(remaining);
        removeMapActivity(key);
        setMsg("ลบกิจกรรมแล้ว");
      },
    });
  }

  async function saveAll() {
    setSaving(true);
    setMsg(null);
    if (activityRows.some((activity) => !activity.name?.trim())) {
      setSaving(false);
      setMsg("กรุณากรอกชื่อกิจกรรมให้ครบ");
      return;
    }

    for (let index = 0; index < activityRows.length; index += 1) {
      const activity = activityRows[index];
      if (!activity._dirty) continue;
      const activityPayload = {
        class_id: classId,
        order_no: index + 1,
        code: activity.code?.trim() || "",
        name: activity.name!.trim(),
        hours: Number(activity.hours) || 0,
      };
      if (activity._new) {
        const { data, error } = await supabase.from("activities").insert(activityPayload).select("id").single();
        if (error) { setSaving(false); setMsg("บันทึกกิจกรรมไม่สำเร็จ: " + error.message); return; }
        activity.id = data.id;
        activity._key = data.id;
        activity._new = false;
      } else {
        const { error } = await supabase.from("activities").update(activityPayload).eq("id", activity.id!);
        if (error) { setSaving(false); setMsg("บันทึกกิจกรรมไม่สำเร็จ: " + error.message); return; }
      }
      activity.order_no = index + 1;
      activity._dirty = false;
    }
    setActivityRows([...activityRows]);

    const payload: { student_id: string; activity_id: string; sem1_result: string; sem2_result: string }[] = [];
    for (const [sid, row] of Object.entries(map)) {
      for (const [aid, c] of Object.entries(row)) {
        if (c._dirty)
          payload.push({ student_id: sid, activity_id: aid, sem1_result: c.sem1_result ?? "", sem2_result: c.sem2_result ?? "" });
      }
    }
    if (!payload.length) { setSaving(false); setMsg("บันทึกกิจกรรมแล้ว"); return; }
    const { error } = await supabase.from("activity_results").upsert(payload, { onConflict: "student_id,activity_id" });
    setSaving(false);
    if (error) { setMsg("บันทึกไม่สำเร็จ: " + error.message); return; }
    setMap((prev) => {
      const copy: typeof prev = {};
      for (const [sid, row] of Object.entries(prev)) {
        copy[sid] = {};
        for (const [aid, c] of Object.entries(row)) copy[sid][aid] = { ...c, _dirty: false };
      }
      return copy;
    });
    setMsg("บันทึกแล้ว");
  }

  const resultDirtyCount = Object.values(map).reduce((a, r) => a + Object.values(r).filter((c) => c._dirty).length, 0);
  const activityDirtyCount = activityRows.filter((activity) => activity._dirty).length;
  const dirtyCount = resultDirtyCount + activityDirtyCount;
  useUnsavedChangesWarning(dirtyCount > 0);

  async function importCsv(file: File) {
    try {
      const table = parseCsv(decodeCsv(await file.arrayBuffer()).replace(/^\uFEFF/, ""));
      if (table.length < 2) throw new Error("ไฟล์ CSV ไม่มีข้อมูล");
      const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_.\-()]/g, "");
      const headers = table[0].map(normalize);
      const noColumn = headers.findIndex((header) => ["เลขที่", "ที่"].includes(header));
      const codeColumn = headers.findIndex((header) => ["เลขประจำตัว", "รหัสนักเรียน"].includes(header));
      if (noColumn < 0 && codeColumn < 0) throw new Error("ไม่พบคอลัมน์เลขที่หรือเลขประจำตัว");
      let imported = 0;
      setMap((previous) => {
        const next = { ...previous };
        for (const values of table.slice(1)) {
          const student = students.find((item) => (codeColumn >= 0 && item.student_code === (values[codeColumn] ?? "").trim()) || (noColumn >= 0 && item.no === Number(values[noColumn])));
          if (!student) continue;
          const studentRow = { ...(next[student.id] ?? {}) };
          for (const activity of activityRows) {
            if (activity._new) continue;
            const sem1Column = headers.indexOf(normalize(`${activity.code || activity.name} ภาค 1`));
            const sem2Column = headers.indexOf(normalize(`${activity.code || activity.name} ภาค 2`));
            studentRow[activity._key] = { ...(studentRow[activity._key] ?? {}), student_id: student.id, activity_id: activity._key, sem1_result: (values[sem1Column] ?? "").trim(), sem2_result: (values[sem2Column] ?? "").trim(), _dirty: true };
          }
          next[student.id] = studentRow;
          imported += 1;
        }
        return next;
      });
      setMsg(`นำเข้าผลกิจกรรม ${imported} คนแล้ว กรุณาตรวจสอบและกดบันทึก`);
    } catch (error) {
      setMsg(`นำเข้าไม่สำเร็จ: ${error instanceof Error ? error.message : "รูปแบบไฟล์ไม่ถูกต้อง"}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const resultHeaders = activityRows.flatMap((activity) => [`${activity.code || activity.name} ภาค 1`, `${activity.code || activity.name} ภาค 2`]);
    downloadCsvTemplate("activities-template.csv", [["เลขที่", "เลขประจำตัว", ...resultHeaders], ["1", students[0]?.student_code || "65001", ...resultHeaders.map(() => "ผ่าน")]]);
  }

  return (
    <div className="space-y-4">
      {deletePasswordDialog}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">บันทึกกิจกรรมพัฒนาผู้เรียน</h2>
        <p className="text-sm text-slate-500">บันทึกผลการประเมินรายภาคเรียนเป็น ผ่าน หรือ ไม่ผ่าน</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-700">รายการกิจกรรมและเวลาเรียน</h3>
            <p className="text-sm text-slate-500">เพิ่ม ลด หรือแก้ไขชื่อกิจกรรม รหัส และเวลาเรียนได้</p>
          </div>
          <button onClick={addActivity} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-100">+ เพิ่มกิจกรรม</button>
        </div>
        <div className="mt-3 space-y-2">
          {activityRows.map((activity, index) => (
            <div key={activity._key} className={`grid grid-cols-[55px_120px_1fr_110px_80px] items-end gap-2 rounded-lg p-2 ${activity._dirty ? "bg-amber-50" : "bg-slate-50"}`}>
              <div className="pb-2 text-center text-sm font-medium text-slate-600">{index + 1}</div>
              <label className="text-xs text-slate-500">รหัสกิจกรรม<input value={activity.code || ""} onChange={(event) => updateActivity(activity._key, "code", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
              <label className="text-xs text-slate-500">ชื่อกิจกรรม<input value={activity.name || ""} onChange={(event) => updateActivity(activity._key, "name", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
              <label className="text-xs text-slate-500">เวลาเรียน (ชม.)<input type="number" min={0} value={activity.hours ?? 0} onChange={(event) => updateActivity(activity._key, "hours", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
              <button onClick={() => removeActivity(activity._key)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">ลบ</button>
            </div>
          ))}
          {activityRows.length === 0 && <div className="py-5 text-center text-sm text-slate-400">ยังไม่มีกิจกรรม กด “+ เพิ่มกิจกรรม” เพื่อเริ่มต้น</div>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-slate-500">กิจกรรมพัฒนาผู้เรียน · ผลการประเมิน ผ่าน/ไม่ผ่าน</div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-sm text-slate-500">{msg}</span>}
          <button onClick={() => setAllPassed("sem1_result", true)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">ผ่านช่องว่าง ภาค 1</button>
          <button onClick={() => setAllPassed("sem2_result", true)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">ผ่านช่องว่าง ภาค 2</button>
          <button onClick={() => setAllPassed("sem1_result", false)} className="rounded-lg border border-green-400 px-3 py-2 text-sm text-green-700">ผ่านทั้งหมด ภาค 1</button>
          <button onClick={() => setAllPassed("sem2_result", false)} className="rounded-lg border border-green-400 px-3 py-2 text-sm text-green-700">ผ่านทั้งหมด ภาค 2</button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} />
          <button onClick={downloadTemplate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">CSV ตัวอย่าง</button>
          <button onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">นำเข้า CSV</button>
          <button onClick={saveAll} disabled={saving || dirtyCount === 0} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : `บันทึก${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="text-sm w-full" style={{ minWidth: 60 + 220 + activityRows.length * 160 }}>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2 w-10" rowSpan={2}>ที่</th>
              <th className="px-2 py-2 text-left" rowSpan={2}>ชื่อ - นามสกุล</th>
              {activityRows.map((a) => (
                <th key={a._key} className="px-1 py-2 text-center border-l" colSpan={2}>{a.name || `กิจกรรม ${a.order_no}`}</th>
              ))}
            </tr>
            <tr className="text-xs">
              {activityRows.map((a) => (
                <Fragment key={a._key}>
                  <th className="px-1 py-1 border-l">ภาค 1</th>
                  <th className="px-1 py-1">ภาค 2</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((st) => {
              const rowDirty = Object.values(map[st.id] ?? {}).some((c) => c._dirty);
              return (
                <tr key={st.id} className={`border-t border-slate-100 ${rowDirty ? "bg-amber-50" : ""}`}>
                  <td className="px-1 py-1 text-center">{st.no}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{fullName(st)}</td>
                  {activityRows.map((a) => {
                    const c = get(st.id, a._key);
                    return (
                      <Fragment key={a._key}>
                        <td className="px-1 py-1 border-l">
                          <select disabled={a._new} value={c.sem1_result ?? ""} onChange={(e) => setField(st.id, a._key, "sem1_result", e.target.value)} className="w-full rounded border border-slate-200 px-1 py-1 disabled:bg-slate-100">
                            {OPTIONS.map((o) => <option key={o} value={o}>{o || "-"}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <select disabled={a._new} value={c.sem2_result ?? ""} onChange={(e) => setField(st.id, a._key, "sem2_result", e.target.value)} className="w-full rounded border border-slate-200 px-1 py-1 disabled:bg-slate-100">
                            {OPTIONS.map((o) => <option key={o} value={o}>{o || "-"}</option>)}
                          </select>
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr><td colSpan={activityRows.length * 2 + 2} className="px-4 py-8 text-center text-slate-400">ยังไม่มีนักเรียน</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
