export type Role = "platform_owner" | "school_admin" | "admin" | "teacher" | "pending";

export type Profile = {
  id: string;
  school_id: number | null;
  username: string;
  full_name: string;
  role: Role;
  position: string;
  is_active: boolean;
  created_at: string;
};

export type School = {
  id: number;
  name: string;
  tambon: string;
  amphoe: string;
  province: string;
  area: string;
  academic_year: string;
  min_attendance_percent: number;
  start_date: string;
  approve_date: string;
  registrar_head: string;
  academic_head: string;
  director: string;
  director_position: string;
  quality_excellent_label: string;
  quality_excellent_min: number;
  quality_good_label: string;
  quality_good_min: number;
  quality_pass_label: string;
  quality_pass_min: number;
  quality_fail_label: string;
  logo_url: string;
  updated_at: string;
};

export type GradeCriterion = {
  id: string;
  school_id: number;
  min_score: number;
  grade_point: number;
  sort: number;
};

export type ClassRoom = {
  id: string;
  school_id: number;
  academic_year: string;
  academic_year_id: string | null;
  grade_level: string;
  room: string;
  homeroom_teacher_id: string | null;
  homeroom_teacher_name: string;
  homeroom_teacher2_name: string;
  created_at: string;
};

export type Student = {
  id: string;
  class_id: string;
  no: number;
  student_code: string;
  national_id: string;
  prefix: string;
  first_name: string;
  last_name: string;
  gender: string;
  status: string;
  move_date: string;
  blood_type: string;
  birth_date: string;
  photo_url: string;
  expected_basic_level: string;
  expected_applied_level: string;
  expected_activity_level: string;
  expected_characteristic_level: string;
  expected_competency_level: string;
  created_at: string;
};

export type AcademicYear = {
  id: string;
  school_id: number;
  year: string;
  status: "active" | "closed" | "deleting";
  starts_on: string | null;
  ends_on: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type Subject = {
  id: string;
  class_id: string;
  order_no: number;
  category: string;
  name: string;
  code: string;
  hours: number;
  credits: number;
  midterm_max: number;
  final_max: number;
  competency_text: string;
  is_active: boolean;
  created_at: string;
};

export type SubjectCompetencyLevel = {
  id: string;
  class_id: string;
  order_no: number;
  subject_name: string;
  competency_text: string;
  beginner_text: string;
  developing_text: string;
  proficient_text: string;
  expert_text: string;
  created_at: string;
};

export type SubjectScore = {
  id: string;
  student_id: string;
  subject_id: string;
  sem1_mid: number | null;
  sem1_final: number | null;
  sem2_mid: number | null;
  sem2_final: number | null;
  override_grade: number | null;
  updated_at: string;
};

export type LearningOutcomeConfig = {
  id: string;
  subject_id: string;
  term: 1 | 2;
  target_max: number;
  calculation_method: "proportional" | "weighted";
  status: "draft" | "locked";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LearningOutcomeIndicator = {
  id: string;
  config_id: string;
  order_no: number;
  code: string;
  title: string;
  max_score: number;
  weight_percent: number | null;
  created_at: string;
  updated_at: string;
};

export type LearningOutcomeScore = {
  id: string;
  student_id: string;
  indicator_id: string;
  score: number;
  updated_by: string | null;
  updated_at: string;
};

export type LearningOutcomeQualityLevel = {
  id: string;
  school_id: number;
  code: "beginner" | "developing" | "proficient" | "expert";
  label: string;
  min_percent: number;
  sort: number;
  updated_at: string;
};

export type TransferSubject = {
  id: string;
  class_id: string;
  order_no: number;
  category: string;
  code: string;
  name: string;
  credits: number;
  enabled: boolean;
  created_at: string;
};

export type TransferSource = {
  id: string;
  transfer_subject_id: string;
  subject_id: string;
};

export type AssessmentItem = {
  id: string;
  class_id: string;
  kind: "characteristic" | "read_write" | "competency";
  no: number;
  title: string;
  max_score: number;
};

export type AssessmentScore = {
  id: string;
  student_id: string;
  item_id: string;
  sem1: number | null;
  sem2: number | null;
};

export type Activity = {
  id: string;
  class_id: string;
  order_no: number;
  code: string;
  name: string;
  hours: number;
};

export type ActivityResult = {
  id: string;
  student_id: string;
  activity_id: string;
  sem1_result: string;
  sem2_result: string;
};

export type SchoolDay = {
  id: string;
  class_id: string;
  school_date: string;
  term: 1 | 2;
  created_at: string;
};

export type AttendanceRecord = {
  id: string;
  student_id: string;
  school_day_id: string;
  status: "" | "/" | "ข" | "ล";
  updated_at: string;
};

export function fullName(s: Pick<Student, "prefix" | "first_name" | "last_name">): string {
  return `${s.prefix}${s.first_name}  ${s.last_name}`.trim();
}
