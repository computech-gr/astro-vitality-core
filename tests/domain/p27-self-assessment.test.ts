import { describe, expect, test } from "bun:test";
import { reviewSelfAssessment, SELF_ASSESSMENT_QUESTIONS } from "../../src/domain/action-guidance/self-assessment";
const valid = Object.fromEntries(SELF_ASSESSMENT_QUESTIONS.map(q => [q.id, q.options[0]]));
describe("P27 voluntary self-assessment", () => {
 test("incomplete responses never generate protocol suggestions", () => { const result = reviewSelfAssessment({ sleep: "Very tired" }); expect(result.complete).toBe(false); expect(result.suggestions).toHaveLength(0); });
 test("ordinary responses do not infer health status or escalation", () => { const result = reviewSelfAssessment(valid); expect(result.complete).toBe(true); expect(result.suggestions).toHaveLength(0); expect(result.medicalContactRequested).toBe(false); });
 test("self-report maps only to reviewed protocol categories", () => { const result = reviewSelfAssessment({ ...valid, sleep: "Very tired", device: "Known device/quality issue", hydration: "Logs incomplete", environment: "Quality concern" }); expect(result.suggestions.map(s => s.actionClass)).toEqual(["repeat-quality-check", "recovery-workload-review", "hydration-nutrition-review", "environmental-review"]); expect(result.suggestions.every(s => s.protocolId && s.version)).toBe(true); });
 test("medical contact request is not an automated escalation", () => { const result = reviewSelfAssessment({ ...valid, concern: "Yes" }); expect(result.medicalContactRequested).toBe(true); expect(result.suggestions).toHaveLength(0); });
 test("invalid options cannot complete checklist", () => { const result = reviewSelfAssessment({ ...valid, concern: "UNAPPROVED" }); expect(result.complete).toBe(false); });
});
