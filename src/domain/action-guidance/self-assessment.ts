import { PROTOCOL_LIBRARY_V1_1 } from "./protocols";
import type { GuidanceActionClass } from "./contracts";

export const SELF_ASSESSMENT_VERSION = "P27.1";
export const SELF_ASSESSMENT_QUESTIONS = [
  { id: "sleep", label: "How rested do you feel?", options: ["Rested", "Somewhat tired", "Very tired", "Unable to assess"] },
  { id: "workload", label: "How manageable is your current workload?", options: ["Manageable", "Demanding", "Overwhelming", "Unable to assess"] },
  { id: "hydration", label: "Have you reviewed your fluid and nutrition logs?", options: ["Reviewed", "Not yet reviewed", "Logs incomplete", "Unable to assess"] },
  { id: "device", label: "Are recent health measurements reliable?", options: ["Verified", "Uncertain", "Known device/quality issue", "No recent measurement"] },
  { id: "environment", label: "Is the habitat telemetry context available?", options: ["Available", "Incomplete", "Quality concern", "Not applicable"] },
  { id: "concern", label: "Do you have a health concern you want a qualified crew medical contact to review?", options: ["No", "Yes", "Unsure", "Prefer not to answer"] },
] as const;
export type SelfAssessmentAnswers = Record<string, string>;
export type SelfAssessmentReview = {
  version: string;
  complete: boolean;
  answered: number;
  total: number;
  suggestions: Array<{ actionClass: GuidanceActionClass; title: string; protocolId: string; version: string; reason: string; steps: readonly { id: string; label: string; instruction: string }[] }>;
  medicalContactRequested: boolean;
  warnings: string[];
};
/** This is a voluntary checklist, not a diagnostic score or clinical trigger. */
export function reviewSelfAssessment(answers: SelfAssessmentAnswers): SelfAssessmentReview {
  const answered = SELF_ASSESSMENT_QUESTIONS.filter(q => q.options.some(option => option === answers[q.id])).length;
  const complete = answered === SELF_ASSESSMENT_QUESTIONS.length;
  const suggested: Array<{ actionClass: GuidanceActionClass; reason: string }> = [];
  if (answers.device === "Uncertain" || answers.device === "Known device/quality issue" || answers.device === "No recent measurement") suggested.push({ actionClass: "repeat-quality-check", reason: "Measurement availability or quality needs verification." });
  if (["Somewhat tired", "Very tired"].includes(answers.sleep ?? "") || ["Demanding", "Overwhelming"].includes(answers.workload ?? "")) suggested.push({ actionClass: "recovery-workload-review", reason: "You reported fatigue or workload context for review." });
  if (["Not yet reviewed", "Logs incomplete"].includes(answers["hydration"] ?? "")) suggested.push({ actionClass: "hydration-nutrition-review", reason: "Fluid or nutrition logs require review." });
  if (["Incomplete", "Quality concern"].includes(answers["environment"] ?? "")) suggested.push({ actionClass: "environmental-review", reason: "Habitat telemetry context requires verification." });
  const suggestions = complete ? suggested.flatMap(item => {
    const protocol = PROTOCOL_LIBRARY_V1_1.find(p => p.actionClass === item.actionClass && p.status === "reviewed_category");
    return protocol ? [{ actionClass: item.actionClass, title: protocol.title, protocolId: protocol.id, version: protocol.version, reason: item.reason, steps: protocol.steps }] : [];
  }) : [];
  return {
    version: SELF_ASSESSMENT_VERSION, complete, answered, total: SELF_ASSESSMENT_QUESTIONS.length,
    suggestions, medicalContactRequested: complete && answers["concern"] === "Yes",
    warnings: ["Self-reports are not validated measurements, clinical thresholds or evidence of disease.", "Suggested protocol categories are informational reviews only, not findings, treatment instructions or automated escalation.", "No assessment answers or acknowledgement are saved or sent by this page; results disappear when the page is closed.", "For urgent symptoms, follow your mission's established emergency/medical communication procedure, regardless of this checklist."],
  };
}
