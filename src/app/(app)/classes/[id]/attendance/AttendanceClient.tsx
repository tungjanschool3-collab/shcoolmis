"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { AttendanceRecord, SchoolDay, Student } from "@/lib/types";
import { fullName } from "@/lib/types";
import { dateKey, dateParts, daysInMonth, termMonths, THAI_MONTHS, THAI_WEEKDAYS, toBuddhistYear } from "@/lib/academic-calendar";

type AttendanceStatus = AttendanceRecord["status"];
type RecordCell = Partial<AttendanceRecord> & { _dirty?: boolean };
const STATUS_OPTIONS: AttendanceStatus[] = ["", "/", "ข", "ล"];

export default function AttendanceClient({
  classId,
  schoolId,
  isAdmin,
  academicYear,
  students,
  initialDays,
  initialRecords,
}: {
  classId: string;
  schoolId: number;
  isAdmin: boolean;
  academicYear: string;
  students: Student[];
  initialDays: SchoolDay[];
  initialRecords: AttendanceRecord[];
}) {
  const supabase = createClient();
  const [term, setTerm] = useState<1 | 2>(1);
  const defaultBuddhistYear = toBuddhistYear(academicYear);
  const [selectedYear, setSelectedYear] = useState(defaultBuddhistYear);
  const [days, setDays] = useState(initialDays);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set(initialDays.map((day) => day.school_date)));
  const [records, setRecords] = useState<Record<string, Record<string, RecordCell>>>(() => {
    const map: Record<string, Record<string, RecordCell>> = {};
    for (const record of initialRecords) {
      if (!map[record.student_id]) map[record.student_id] = {};
      map[record.student_id][record.school_day_id] = { ...record };
    }
    return map;
  });
  const [savingDays, setSavingDays] = useState(false);
  const [syncingDays, setSyncingDays] = useState(false);
  const [savingRecords, setSavingRecords] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const yearOptions = Array.from({ length: 11 }, (_, index) => defaultBuddhistYear - 5 + index);
  const months = useMemo(() => termMonths(String(selectedYear), term), [selectedYear, term]);
  const selectedMonthPrefixes = useMemo(
    () => new Set(months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, "0")}`)),
    [months]
  );
  const termDays = useMemo(
    () => days
      .filter((day) => day.term === term && selectedMonthPrefixes.has(day.school_date.slice(0, 7)))
      .sort((a, b) => a.school_date.localeCompare(b.school_date)),
    [days, term, selectedMonthPrefixes]
  );

  function toggleDate(value: string) {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
    setMessage(null);
  }

  function selectWeekdays() {
    setSelectedDates((current) => {
      const next = new Set(current);
      for (const month of months) {
        for (let day = 1; day <= daysInMonth(month.year, month.month); day += 1) {
          const key = dateKey(month.year, month.month, day);
          const weekday = dateParts(key).weekday;
          if (weekday >= 1 && weekday <= 5) next.add(key);
        }
      }
      return next;
    });
  }

  function clearTerm() {
    const monthPrefixes = new Set(months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, "0")}`));
    setSelectedDates((current) => new Set([...current].filter((value) => !monthPrefixes.has(value.slice(0, 7)))));
  }

  async function saveCalendar() {
    setSavingDays(true);
    setMessage(null);
    const wanted = [...selectedDates].filter((value) => months.some((month) => value.startsWith(`${month.year}-${String(month.month + 1).padStart(2, "0")}`)));
    const existing = days.filter(
      (day) => day.term === term && selectedMonthPrefixes.has(day.school_date.slice(0, 7))
    );
    const removed = existing.filter((day) => !wanted.includes(day.school_date));
    if (removed.length) {
      const { error } = await supabase.from("school_days").delete().in("id", removed.map((day) => day.id));
      if (error) { setSavingDays(false); setMessage(`บันทึกปฏิทินไม่สำเร็จ: ${error.message}`); return; }
    }
    const newDates = wanted.filter((value) => !existing.some((day) => day.school_date === value));
    let created: SchoolDay[] = [];
    if (newDates.length) {
      const { data, error } = await supabase.from("school_days").insert(newDates.map((school_date) => ({ class_id: classId, school_date, term }))).select("*");
      if (error) { setSavingDays(false); setMessage(`บันทึกปฏิทินไม่สำเร็จ: ${error.message}`); return; }
      created = (data as SchoolDay[]) ?? [];
    }
    const removedIds = new Set(removed.map((day) => day.id));
    setDays((current) => [...current.filter((day) => !removedIds.has(day.id)), ...created].sort((a, b) => a.school_date.localeCompare(b.school_date)));
    setSavingDays(false);
    setMessage(`บันทึกวันมาเรียน ภาคเรียนที่ ${term} ปีการศึกษา ${selectedYear} แล้ว ${wanted.length} วัน`);
  }

  async function saveCalendarForAllClasses() {
    setSyncingDays(true);
    setMessage(null);

    const wanted = [...selectedDates].filter((value) =>
      months.some((month) => value.startsWith(`${month.year}-${String(month.month + 1).padStart(2, "0")}`))
    );
    const { data: classrooms, error: classError } = await supabase
      .from("classes")
      .select("id")
      .eq("school_id", schoolId)
      .eq("academic_year", String(selectedYear));

    if (classError) {
      setSyncingDays(false);
      setMessage(`อ่านรายชื่อห้องเรียนไม่สำเร็จ: ${classError.message}`);
      return;
    }

    const classIds = (classrooms ?? []).map((classroom) => classroom.id as string);
    if (!classIds.length) {
      setSyncingDays(false);
      setMessage(`ไม่พบห้องเรียนปีการศึกษา ${selectedYear}`);
      return;
    }

    const { data: allDays, error: daysError } = await supabase
      .from("school_days")
      .select("*")
      .in("class_id", classIds)
      .eq("term", term);

    if (daysError) {
      setSyncingDays(false);
      setMessage(`อ่านปฏิทินห้องเรียนไม่สำเร็จ: ${daysError.message}`);
      return;
    }

    const existing = ((allDays as SchoolDay[]) ?? []).filter((day) =>
      selectedMonthPrefixes.has(day.school_date.slice(0, 7))
    );
    const wantedSet = new Set(wanted);
    const removed = existing.filter((day) => !wantedSet.has(day.school_date));

    if (removed.length) {
      const { error } = await supabase.from("school_days").delete().in("id", removed.map((day) => day.id));
      if (error) {
        setSyncingDays(false);
        setMessage(`ปรับปฏิทินทุกห้องไม่สำเร็จ: ${error.message}`);
        return;
      }
    }

    const existingKeys = new Set(existing.map((day) => `${day.class_id}:${day.school_date}`));
    const additions = classIds.flatMap((targetClassId) =>
      wanted
        .filter((schoolDate) => !existingKeys.has(`${targetClassId}:${schoolDate}`))
        .map((school_date) => ({ class_id: targetClassId, school_date, term }))
    );

    if (additions.length) {
      const { error } = await supabase.from("school_days").insert(additions);
      if (error) {
        setSyncingDays(false);
        setMessage(`เพิ่มวันเปิดเรียนให้ทุกห้องไม่สำเร็จ: ${error.message}`);
        return;
      }
    }

    const { data: refreshedDays } = await supabase
      .from("school_days")
      .select("*")
      .eq("class_id", classId)
      .order("school_date");
    if (refreshedDays) setDays(refreshedDays as SchoolDay[]);

    setSyncingDays(false);
    setMessage(`บันทึกปฏิทินกลาง ${wanted.length} วัน ให้ห้องเรียนปี ${selectedYear} ครบ ${classIds.length} ห้องแล้ว`);
  }

  function setAttendance(studentId: string, schoolDayId: string, status: AttendanceStatus) {
    setRecords((current) => ({
      ...current,
      [studentId]: {
        ...(current[studentId] ?? {}),
        [schoolDayId]: { ...(current[studentId]?.[schoolDayId] ?? {}), student_id: studentId, school_day_id: schoolDayId, status, _dirty: true },
      },
    }));
  }

  function markAllPresent() {
    setRecords((current) => {
      const next = { ...current };
      for (const student of students) {
        const studentRecords = { ...(next[student.id] ?? {}) };
        for (const day of termDays) {
          studentRecords[day.id] = {
            ...(studentRecords[day.id] ?? {}),
            student_id: student.id,
            school_day_id: day.id,
            status: "/",
            _dirty: true,
          };
        }
        next[student.id] = studentRecords;
      }
      return next;
    });
    setMessage(`เลือกมาเรียนทั้งหมด ${students.length} คน จำนวน ${termDays.length} วันแล้ว กรุณากดบันทึกเวลาเรียน`);
  }

  async function saveAttendance() {
    setSavingRecords(true);
    setMessage(null);
    const payload = Object.values(records).flatMap((row) => Object.values(row))
      .filter((cell) => cell._dirty)
      .map((cell) => ({ student_id: cell.student_id!, school_day_id: cell.school_day_id!, status: cell.status || "", updated_at: new Date().toISOString() }));
    if (!payload.length) { setSavingRecords(false); setMessage("ไม่มีข้อมูลเวลาเรียนที่เปลี่ยนแปลง"); return; }
    const { error } = await supabase.from("attendance_records").upsert(payload, { onConflict: "student_id,school_day_id" });
    setSavingRecords(false);
    if (error) { setMessage(`บันทึกเวลาเรียนไม่สำเร็จ: ${error.message}`); return; }
    setRecords((current) => Object.fromEntries(Object.entries(current).map(([studentId, row]) => [studentId, Object.fromEntries(Object.entries(row).map(([dayId, cell]) => [dayId, { ...cell, _dirty: false }]))])));
    setMessage(`บันทึกเวลาเรียน ${payload.length} รายการแล้ว`);
  }

  function summary(studentId: string) {
    const values = termDays.map((day) => records[studentId]?.[day.id]?.status || "");
    return { present: values.filter((value) => value === "/").length, absent: values.filter((value) => value === "ข").length, leave: values.filter((value) => value === "ล").length };
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">ปฏิทินการศึกษาและเวลาเรียน</h2>
          <p className="text-slate-500">เลือกวันเปิดเรียน แล้วบันทึกสถานะรายวัน: / = มาเรียน, ข = ขาดเรียน, ล = ลา</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
            <span className="text-slate-600">ปีการศึกษา</span>
            <select
              aria-label="ปีการศึกษา"
              value={selectedYear}
              onChange={(event) => { setSelectedYear(Number(event.target.value)); setMessage(null); }}
              className="bg-transparent font-semibold text-slate-800 outline-none"
            >
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <button onClick={() => setTerm(1)} className={`rounded-lg px-4 py-2 font-medium ${term === 1 ? "bg-indigo-600 text-white" : "border bg-white"}`}>ภาคเรียนที่ 1</button>
          <button onClick={() => setTerm(2)} className={`rounded-lg px-4 py-2 font-medium ${term === 2 ? "bg-indigo-600 text-white" : "border bg-white"}`}>ภาคเรียนที่ 2</button>
          <Link href={`/print/${classId}/attendance?term=${term}&year=${selectedYear}`} target="_blank" className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-indigo-700">PDF เวลาเรียน ↗</Link>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-slate-700">เลือกวันที่มาโรงเรียน ภาคเรียนที่ {term} ปีการศึกษา {selectedYear}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={selectWeekdays} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-700">เลือกจันทร์-ศุกร์</button>
            <button onClick={clearTerm} className="rounded-lg border px-3 py-2">ล้างภาคเรียนนี้</button>
            <button onClick={saveCalendar} disabled={savingDays} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50">{savingDays ? "กำลังบันทึก..." : "บันทึกปฏิทิน"}</button>
            {isAdmin && (
              <button
                onClick={saveCalendarForAllClasses}
                disabled={syncingDays || savingDays}
                className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {syncingDays ? "กำลังใช้กับทุกห้อง..." : "บันทึกและใช้กับทุกห้อง"}
              </button>
            )}
          </div>
        </div>
        {isAdmin && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ผู้ดูแลระบบสามารถกำหนดวันเปิดเรียนกลางให้ทุกห้องในโรงเรียนที่อยู่ในปีการศึกษาเดียวกันได้
          </p>
        )}
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1080px] grid-flow-col auto-cols-fr gap-3">
          {months.map((month) => {
            const count = daysInMonth(month.year, month.month);
            const firstDay = new Date(Date.UTC(month.year, month.month, 1)).getUTCDay();
            return (
              <div key={`${month.year}-${month.month}`} className="rounded-lg border border-slate-200 p-2">
                <div className="mb-1.5 text-center text-sm font-semibold">{THAI_MONTHS[month.month]} {month.year + 543}</div>
                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {THAI_WEEKDAYS.map((weekday, index) => <div key={weekday} className={`py-0.5 text-xs font-medium ${index === 0 || index === 6 ? "text-rose-500" : "text-slate-500"}`}>{weekday}</div>)}
                  {Array.from({ length: firstDay }).map((_, index) => <div key={`blank-${index}`} />)}
                  {Array.from({ length: count }).map((_, index) => {
                    const day = index + 1;
                    const value = dateKey(month.year, month.month, day);
                    const selected = selectedDates.has(value);
                    const weekend = [0, 6].includes(dateParts(value).weekday);
                    return <button key={value} onClick={() => toggleDate(value)} className={`aspect-square rounded-md text-xs font-medium ${selected ? "bg-emerald-500 text-white shadow-sm" : weekend ? "bg-rose-50 text-rose-500" : "bg-slate-100 text-slate-700 hover:bg-indigo-100"}`}>{day}</button>;
                  })}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><span className="font-semibold">ตารางเช็กเวลาเรียน ภาคเรียนที่ {term} ปีการศึกษา {selectedYear}</span> <span className="text-slate-500">({termDays.length} วัน)</span></div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {message && <span className="text-sm text-slate-600">{message}</span>}
            <button
              onClick={markAllPresent}
              disabled={savingRecords || !termDays.length || !students.length}
              title="กำหนดนักเรียนทุกคนเป็นมาเรียนทุกวันในภาคเรียนที่เลือก"
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 font-medium text-emerald-700 disabled:opacity-50"
            >
              มาเรียนทั้งหมด
            </button>
            <button onClick={saveAttendance} disabled={savingRecords || !termDays.length} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50">{savingRecords ? "กำลังบันทึก..." : "บันทึกเวลาเรียน"}</button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-max text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr><th className="sticky left-0 z-20 min-w-12 bg-slate-100 px-2 py-2">ที่</th><th className="sticky left-12 z-20 min-w-56 bg-slate-100 px-3 py-2 text-left">ชื่อ - นามสกุล</th>{termDays.map((day) => { const parts = dateParts(day.school_date); return <th key={day.id} className="min-w-12 border-l px-1 py-2"><div>{parts.day}</div><div className="text-xs font-normal">{THAI_MONTHS[parts.month].slice(0, 3)}</div></th>; })}<th className="border-l px-2 text-emerald-700">มา</th><th className="px-2 text-rose-700">ข</th><th className="px-2 text-amber-700">ล</th></tr>
            </thead>
            <tbody>{students.map((student) => { const sum = summary(student.id); return <tr key={student.id} className="border-t"><td className="sticky left-0 bg-white px-2 py-1 text-center">{student.no}</td><td className="sticky left-12 bg-white px-3 py-1 whitespace-nowrap">{fullName(student)}</td>{termDays.map((day) => <td key={day.id} className="border-l p-1"><select value={records[student.id]?.[day.id]?.status || ""} onChange={(event) => setAttendance(student.id, day.id, event.target.value as AttendanceStatus)} className="w-11 rounded border border-slate-300 px-1 py-1 text-center">{STATUS_OPTIONS.map((option) => <option key={option || "blank"} value={option}>{option || "-"}</option>)}</select></td>)}<td className="border-l text-center font-semibold text-emerald-700">{sum.present}</td><td className="text-center font-semibold text-rose-700">{sum.absent}</td><td className="text-center font-semibold text-amber-700">{sum.leave}</td></tr>; })}</tbody>
          </table>
          {!termDays.length && <div className="p-8 text-center text-slate-400">กรุณาเลือกวันมาเรียนและกด “บันทึกปฏิทิน” ก่อน</div>}
        </div>
      </section>
    </div>
  );
}
