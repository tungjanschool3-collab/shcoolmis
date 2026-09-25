import { createClient } from "@/lib/supabase/server";
import type {
  ClassRoom,
  LearningOutcomeConfig,
  LearningOutcomeIndicator,
  LearningOutcomeQualityLevel,
  LearningOutcomeScore,
  Student,
  Subject,
} from "@/lib/types";
import LearningOutcomesClient from "./LearningOutcomesClient";

export default async function LearningOutcomesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: classroom }, { data: subjects }, { data: students }] = await Promise.all([
    supabase.from("classes").select("*").eq("id", id).single(),
    supabase.from("subjects").select("*").eq("class_id", id).eq("is_active", true).order("order_no"),
    supabase.from("students").select("*").eq("class_id", id).order("no"),
  ]);

  const subjectIds = (subjects ?? []).map((subject) => subject.id);
  const { data: configs } = subjectIds.length
    ? await supabase.from("learning_outcome_configs").select("*").in("subject_id", subjectIds).order("term")
    : { data: [] };
  const configIds = (configs ?? []).map((config) => config.id);
  const { data: indicators } = configIds.length
    ? await supabase.from("learning_outcome_indicators").select("*").in("config_id", configIds).order("order_no")
    : { data: [] };
  const indicatorIds = (indicators ?? []).map((indicator) => indicator.id);
  const { data: scores } = indicatorIds.length
    ? await supabase.from("learning_outcome_scores").select("*").in("indicator_id", indicatorIds)
    : { data: [] };
  const { data: qualityLevels } = classroom?.school_id
    ? await supabase
        .from("learning_outcome_quality_levels")
        .select("*")
        .eq("school_id", classroom.school_id)
        .order("sort")
    : { data: [] };

  return (
    <LearningOutcomesClient
      classId={id}
      schoolId={(classroom as ClassRoom | null)?.school_id ?? 0}
      subjects={(subjects as Subject[]) ?? []}
      students={(students as Student[]) ?? []}
      initialConfigs={(configs as LearningOutcomeConfig[]) ?? []}
      initialIndicators={(indicators as LearningOutcomeIndicator[]) ?? []}
      initialScores={(scores as LearningOutcomeScore[]) ?? []}
      initialQualityLevels={(qualityLevels as LearningOutcomeQualityLevel[]) ?? []}
    />
  );
}

