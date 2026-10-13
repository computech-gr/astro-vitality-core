import p20 from "../../../data/submission/p20-evidence.v1.json";
import external from "../../../data/submission/p20-final-external-evidence.v1.json";
import p32 from "../../../data/validation/p32-independent-review-gates.v1.json";
import p34 from "../../../data/validation/p34-real-device-acceptance.v1.json";

/** Source-controlled snapshot, not an assertion about live deployment or physical acceptance. */
export function p35Readiness() {
  const criticalPending = p20.evidence.filter(e => e.critical && e.status !== "ready").map(e => e.id);
  const devicePending = p34.cases.filter(c => c.status !== "observed_pass").map(c => c.id);
  const sciencePending = p32.gates.filter(g => g.status !== "approved").map(g => g.id);
  const videoReady = external.video.status === "ready" && !!external.video.publicUrl && external.video.originalTeamCreated === true && external.video.rightsAndLicensesConfirmed === true && external.video.requiredLikenessConsentsConfirmed === true && !!external.video.checkedAt;
  const rulesReady = external.official2026SubmissionRules.status === "ready" && !!external.official2026SubmissionRules.officialSourceUrl && external.official2026SubmissionRules.submissionFieldsRechecked === true && external.official2026SubmissionRules.judgingInstructionsRechecked === true && external.official2026SubmissionRules.rightsRequirementsRechecked === true && !!external.official2026SubmissionRules.checkedAt;
  return { schemaVersion: "p35-submission-readiness-v1", basis: "repository-controlled snapshots; not a live audit", project: "The Mitochondria", criticalPending, devicePending, sciencePending, videoReady, rulesReady, scientificApproval: false, realDeviceAcceptanceApproved: false, readyToSubmit: criticalPending.length === 0 && devicePending.length === 0 && sciencePending.length === 0 && videoReady && rulesReady && false, note: "Technical build success is not human acceptance, independent scientific approval, or official submission." };
}
export function p35Handoff() {
  return { ...p35Readiness(), evidencePaths: ["data/submission/p20-evidence.v1.json", "data/submission/p20-final-external-evidence.v1.json", "data/validation/p34-real-device-acceptance.v1.json", "data/validation/p32-independent-review-gates.v1.json", "data/submission/submission-manifest.v1.json"], humanActions: ["Record physical-device test evidence and review outcomes", "Obtain independent scientific reviews and signed evidence", "Publish original team video with rights and consent confirmation", "Verify official 2026 challenge submission requirements", "Complete browser role and accessibility walkthrough", "Re-run release security, privacy, tests and build gates"] };
}
