import { parseCsv } from "@/lib/student-csv";

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_.\-()/≥]/g, "");
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

function numberValue(value: string, fallback = 0): number {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type ImportedSubject = {
  order_no: number;
  category: string;
  name: string;
  code: string;
  hours: number;
  credits: number;
  midterm_max: number;
  final_max: number;
  competency_text: string;
};

export function parseSubjectsCsv(text: string): ImportedSubject[] {
  const table = parseCsv(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) throw new Error("ไฟล์ CSV ไม่มีข้อมูลรายวิชา");

  const headers = table[0].map(normalizeHeader);
  const columns = {
    order: findColumn(headers, ["วิชาที่", "ที่", "ลำดับ", "order"]),
    category: findColumn(headers, ["ประเภทวิชา", "ประเภท", "category"]),
    name: findColumn(headers, ["ชื่อวิชา", "รายวิชา", "subject"]),
    code: findColumn(headers, ["รหัส", "รหัสวิชา", "code"]),
    hours: findColumn(headers, ["เวลาเรียน", "ชั่วโมง", "hours"]),
    credits: findColumn(headers, ["น้ำหนัก", "หน่วยกิต", "credits"]),
    midterm: findColumn(headers, ["คะแนนกลางภาค", "กลางภาค", "midterm"]),
    final: findColumn(headers, ["คะแนนปลายภาค", "ปลายภาค", "final"]),
    competency: findColumn(headers, ["ความสามารถชั้นปี", "ความสามารถ", "competency"]),
  };
  if (columns.name < 0) throw new Error('ไม่พบคอลัมน์ “ชื่อวิชา”');

  const valueAt = (row: string[], index: number) => index < 0 ? "" : (row[index] ?? "").trim();
  const imported = table.slice(1).flatMap((row, index) => {
    const name = valueAt(row, columns.name);
    if (!name) return [];
    const order = numberValue(valueAt(row, columns.order), index + 1);
    return [{
      order_no: order > 0 ? order : index + 1,
      category: valueAt(row, columns.category) || "พื้นฐาน",
      name,
      code: valueAt(row, columns.code),
      hours: numberValue(valueAt(row, columns.hours)),
      credits: numberValue(valueAt(row, columns.credits)),
      midterm_max: numberValue(valueAt(row, columns.midterm), 70),
      final_max: numberValue(valueAt(row, columns.final), 30),
      competency_text: valueAt(row, columns.competency),
    }];
  });

  if (!imported.length) throw new Error("ไม่พบรายวิชาที่นำเข้าได้");
  return imported;
}

export type ImportedCompetencyLevel = {
  order_no: number;
  subject_name: string;
  competency_text: string;
  beginner_text: string;
  developing_text: string;
  proficient_text: string;
  expert_text: string;
};

export function parseCompetencyLevelsCsv(text: string): ImportedCompetencyLevel[] {
  const table = parseCsv(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) throw new Error("ไฟล์ CSV ไม่มีข้อมูลเกณฑ์ความสามารถ");

  const headers = table[0].map(normalizeHeader);
  const columns = {
    order: findColumn(headers, ["ที่", "ลำดับ", "order"]),
    subject: findColumn(headers, ["รายวิชาหลักสูตรใหม่2568", "ชื่อวิชา", "รายวิชา", "subject"]),
    competency: (() => {
      const exact = findColumn(headers, ["ความสามารถชั้นปี", "ความสามารถ", "competency"]);
      if (exact >= 0) return exact;
      return headers.findIndex((header) => header.startsWith(normalizeHeader("ความสามารถของผู้เรียนเมื่อจบ")));
    })(),
    beginner: findColumn(headers, ["เริ่มต้น", "beginner"]),
    developing: findColumn(headers, ["พัฒนา", "developing"]),
    proficient: findColumn(headers, ["ชำนาญตามเกณฑ์ที่คาดหวัง", "ชำนาญ", "proficient"]),
    expert: findColumn(headers, ["เชี่ยวชาญ", "expert"]),
  };
  if (columns.subject < 0) throw new Error('ไม่พบคอลัมน์ “รายวิชาหลักสูตรใหม่ 2568”');

  const valueAt = (row: string[], index: number) => index < 0 ? "" : (row[index] ?? "").trim();
  const imported = table.slice(1).flatMap((row, index) => {
    const subjectName = valueAt(row, columns.subject);
    if (!subjectName) return [];
    const order = numberValue(valueAt(row, columns.order), index + 1);
    return [{
      order_no: order > 0 ? order : index + 1,
      subject_name: subjectName,
      competency_text: valueAt(row, columns.competency),
      beginner_text: valueAt(row, columns.beginner),
      developing_text: valueAt(row, columns.developing),
      proficient_text: valueAt(row, columns.proficient),
      expert_text: valueAt(row, columns.expert),
    }];
  });

  if (!imported.length) throw new Error("ไม่พบเกณฑ์ความสามารถที่นำเข้าได้");
  return imported;
}

export function decodeCsv(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-874").decode(buffer) : utf8;
}

export function downloadCsvTemplate(filename: string, rows: string[][]): void {
  const escape = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const csv = "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
