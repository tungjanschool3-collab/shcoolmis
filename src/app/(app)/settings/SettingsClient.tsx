"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { School, GradeCriterion } from "@/lib/types";
import { usePasswordDelete } from "@/components/PasswordDeleteGuard";

const FIELDS: { key: keyof School; label: string; ph?: string }[] = [
  { key: "name", label: "ชื่อโรงเรียน", ph: "เช่น วัดทุ่งจาน" },
  { key: "tambon", label: "ตำบล" },
  { key: "amphoe", label: "อำเภอ" },
  { key: "province", label: "จังหวัด" },
  { key: "area", label: "เขตพื้นที่การศึกษา", ph: "เช่น ประถมศึกษานครราชสีมา เขต 3" },
  { key: "start_date", label: "เริ่มใช้งานวันที่", ph: "เช่น 15 พฤษภาคม 2568" },
  { key: "approve_date", label: "อนุมัติผลการเรียนวันที่", ph: "เช่น 31 มีนาคม 2569" },
  { key: "registrar_head", label: "หัวหน้าทะเบียนและวัดผล" },
  { key: "academic_head", label: "หัวหน้าฝ่ายวิชาการ" },
  { key: "director", label: "ผู้บริหาร" },
  { key: "director_position", label: "ตำแหน่งผู้บริหาร", ph: "เช่น ผู้อำนวยการโรงเรียน..." },
];

const QUALITY_ROWS = [
  { labelKey: "quality_excellent_label", minKey: "quality_excellent_min", level: "ระดับสูงสุด", placeholder: "ดีเยี่ยม" },
  { labelKey: "quality_good_label", minKey: "quality_good_min", level: "ระดับดี", placeholder: "ดี" },
  { labelKey: "quality_pass_label", minKey: "quality_pass_min", level: "ระดับผ่าน", placeholder: "ผ่าน" },
] as const;

export default function SettingsClient({
  school,
  criteria,
}: {
  school: School;
  criteria: GradeCriterion[];
}) {
  const supabase = createClient();
  const [form, setForm] = useState<School>(school);
  const [rows, setRows] = useState<GradeCriterion[]>(criteria);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { requestDelete, deletePasswordDialog } = usePasswordDelete();

  function up(key: keyof School, val: string | number) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function saveSchool() {
    setSaving(true);
    setMsg(null);
    const excellentMin = Number(form.quality_excellent_min);
    const goodMin = Number(form.quality_good_min);
    const passMin = Number(form.quality_pass_min);
    if (!(passMin >= 0 && goodMin > passMin && excellentMin > goodMin && excellentMin <= 3)) {
      setSaving(false);
      setMsg({ type: "err", text: "คะแนนต้องเรียงจากน้อยไปมาก: ผ่าน < ดี < ดีเยี่ยม และคะแนนสูงสุดไม่เกิน 3" });
      return;
    }
    const { error } = await supabase
      .from("school")
      .update({
        name: form.name,
        tambon: form.tambon,
        amphoe: form.amphoe,
        province: form.province,
        area: form.area,
        min_attendance_percent: Number(form.min_attendance_percent) || 0,
        start_date: form.start_date,
        approve_date: form.approve_date,
        registrar_head: form.registrar_head,
        academic_head: form.academic_head,
        director: form.director,
        director_position: form.director_position,
        quality_excellent_label: form.quality_excellent_label,
        quality_excellent_min: excellentMin,
        quality_good_label: form.quality_good_label,
        quality_good_min: goodMin,
        quality_pass_label: form.quality_pass_label,
        quality_pass_min: passMin,
        quality_fail_label: form.quality_fail_label,
        updated_at: new Date().toISOString(),
      })
      .eq("id", form.id);
    setSaving(false);
    setMsg(error ? { type: "err", text: error.message } : { type: "ok", text: "บันทึกข้อมูลโรงเรียนแล้ว" });
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    const ext = file.name.split(".").pop();
    const path = `${form.id}/logo/school-${form.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("assets").upload(path, file, { upsert: true });
    if (upErr) {
      setUploading(false);
      setMsg({ type: "err", text: "อัปโหลดโลโก้ไม่สำเร็จ: " + upErr.message });
      return;
    }
    const { data } = supabase.storage.from("assets").getPublicUrl(path);
    const url = data.publicUrl;
    await supabase.from("school").update({ logo_url: url }).eq("id", form.id);
    setForm((f) => ({ ...f, logo_url: url }));
    setUploading(false);
    setMsg({ type: "ok", text: "อัปโหลดโลโก้แล้ว" });
  }

  function removeLogo() {
    requestDelete({
      title: "ยืนยันการลบโลโก้",
      description: "ลบโลโก้โรงเรียนออกจากรายงานและหน้าระบบ?",
      onVerified: async () => {
        await supabase.from("school").update({ logo_url: "" }).eq("id", form.id);
        setForm((f) => ({ ...f, logo_url: "" }));
      },
    });
  }

  function updRow(i: number, key: "min_score" | "grade_point", val: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: Number(val) } : row)));
  }
  function addRow() {
    setRows((r) => [
      ...r,
      { id: `new-${Date.now()}`, school_id: form.id, min_score: 0, grade_point: 0, sort: r.length },
    ]);
  }
  function removeRow(i: number) {
    requestDelete({
      title: "ยืนยันการลบเกณฑ์ตัดเกรด",
      description: "ลบแถวเกณฑ์ตัดเกรดนี้? ต้องกดบันทึกเกณฑ์เพื่อบันทึกการเปลี่ยนแปลง",
      onVerified: () => setRows((r) => r.filter((_, idx) => idx !== i)),
    });
  }

  async function saveCriteria() {
    setSaving(true);
    setMsg(null);
    // ลบทั้งหมดแล้วเขียนใหม่ (เรียงคะแนนน้อย -> มาก)
    const sorted = [...rows].sort((a, b) => a.min_score - b.min_score);
    await supabase.from("grade_criteria").delete().eq("school_id", form.id);
    const { error } = await supabase.from("grade_criteria").insert(
      sorted.map((r, i) => ({ school_id: form.id, min_score: r.min_score, grade_point: r.grade_point, sort: i }))
    );
    setSaving(false);
    setMsg(error ? { type: "err", text: error.message } : { type: "ok", text: "บันทึกเกณฑ์การตัดเกรดแล้ว" });
  }

  return (
    <div className="space-y-6">
      {deletePasswordDialog}
      <h1 className="text-2xl font-bold text-slate-800">ข้อมูลโรงเรียน</h1>

      {msg && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* โลโก้ */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-800 mb-3">โลโก้โรงเรียน</h2>
        <div className="flex items-center gap-5">
          <div className="w-24 h-24 rounded-lg border border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50">
            {form.logo_url ? (
              <Image src={form.logo_url} alt="logo" width={96} height={96} className="object-contain" />
            ) : (
              <span className="text-slate-300 text-xs text-center">ยังไม่มีโลโก้</span>
            )}
          </div>
          <div className="space-y-2">
            <label className="inline-block rounded-lg bg-slate-800 text-white px-4 py-2 text-sm cursor-pointer hover:bg-slate-700">
              {uploading ? "กำลังอัปโหลด..." : "อัปโหลดโลโก้"}
              <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} disabled={uploading} />
            </label>
            {form.logo_url && (
              <button onClick={removeLogo} className="block text-sm text-rose-600 hover:underline">
                ลบโลโก้
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ข้อมูลทั่วไป */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-800 mb-4">ข้อมูลทั่วไป</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
              <input
                value={(form[f.key] as string) ?? ""}
                placeholder={f.ph}
                onChange={(e) => up(f.key, e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              เวลาเรียนไม่น้อยกว่าร้อยละ
            </label>
            <input
              type="number"
              value={form.min_attendance_percent ?? 80}
              onChange={(e) => up("min_attendance_percent", Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
        <button
          onClick={saveSchool}
          disabled={saving}
          className="mt-4 rounded-lg bg-indigo-600 text-white px-5 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
        >
          บันทึกข้อมูลโรงเรียน
        </button>
      </div>

      {/* เกณฑ์สรุปผลการประเมิน */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-800 mb-1">เกณฑ์สรุปผลการประเมิน</h2>
        <p className="text-sm text-slate-500 mb-4">กำหนดคะแนนเฉลี่ยขั้นต่ำและคำที่ใช้วัดผล คะแนนเต็ม 3</p>
        <div className="max-w-2xl space-y-3">
          {QUALITY_ROWS.map((row) => (
            <div key={row.labelKey} className="grid grid-cols-[110px_120px_1fr] items-center gap-3">
              <span className="text-sm font-medium text-slate-600">{row.level}</span>
              <div>
                <label className="mb-1 block text-xs text-slate-400">คะแนนตั้งแต่</label>
                <input type="number" min={0} max={3} step={0.1} value={form[row.minKey] ?? ""} onChange={(event) => up(row.minKey, Number(event.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">คำที่ใช้วัดผล</label>
                <input value={form[row.labelKey] || ""} placeholder={row.placeholder} onChange={(event) => up(row.labelKey, event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[110px_120px_1fr] items-end gap-3">
            <span className="text-sm font-medium text-slate-600">ระดับต่ำสุด</span>
            <div className="pb-2 text-sm text-slate-500">ต่ำกว่า {form.quality_pass_min ?? 1}</div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">คำที่ใช้วัดผล</label>
              <input value={form.quality_fail_label || ""} placeholder="ไม่ผ่าน" onChange={(event) => up("quality_fail_label", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
          </div>
        </div>
        <div className="mt-4 text-sm text-slate-500">
          ตัวอย่างปัจจุบัน: เฉลี่ย ≥ {form.quality_excellent_min ?? 2.5} = {form.quality_excellent_label}, ≥ {form.quality_good_min ?? 1.5} = {form.quality_good_label}, ≥ {form.quality_pass_min ?? 1} = {form.quality_pass_label}, ต่ำกว่านั้น = {form.quality_fail_label}
        </div>
        <button onClick={saveSchool} disabled={saving} className="mt-4 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          บันทึกเกณฑ์สรุป
        </button>
      </div>

      {/* เกณฑ์ตัดเกรด */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-800 mb-1">เกณฑ์การตัดเกรด</h2>
        <p className="text-xs text-slate-400 mb-4">
          คะแนนตั้งแต่ค่าที่กำหนด → ได้ผลการเรียนตามที่ระบุ (ระบบจะเรียงจากน้อยไปมากให้อัตโนมัติ)
        </p>
        <div className="space-y-2 max-w-md">
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="text-sm text-slate-500 w-20">คะแนนตั้งแต่</span>
              <input
                type="number"
                value={r.min_score}
                onChange={(e) => updRow(i, "min_score", e.target.value)}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5"
              />
              <span className="text-sm text-slate-500">→ เกรด</span>
              <input
                type="number"
                step="0.5"
                value={r.grade_point}
                onChange={(e) => updRow(i, "grade_point", e.target.value)}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5"
              />
              <button onClick={() => removeRow(i)} className="text-rose-500 text-sm px-2">
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={addRow} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            + เพิ่มแถว
          </button>
          <button
            onClick={saveCriteria}
            disabled={saving}
            className="rounded-lg bg-indigo-600 text-white px-5 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            บันทึกเกณฑ์
          </button>
        </div>
      </div>
    </div>
  );
}
