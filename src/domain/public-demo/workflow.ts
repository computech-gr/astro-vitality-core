/**
 * P71 synthetic examination workflow (pure, browser-safe).
 *
 * submitted --(Researcher)--> scientific_assessment_recorded --(Medical)--> medical_review_recorded
 *
 * The database enforces the same rules (pending P69 SQL). This module mirrors
 * them for immediate UI feedback and powers the clearly-labelled offline
 * rehearsal fallback. A scientific assessment is never a medical decision, a
 * medical review never implies a scientific assessment it did not reference,
 * and neither is diagnosis, clinical clearance, P36/P37 scientific
 * authorization or catalog activation.
 */
import {
  P69_DEMO_CATALOG,
  P69_DEMO_CREW_SUBJECT,
  P69_MEDICAL_OUTCOMES,
  P69_SCIENTIFIC_OUTCOMES,
  buildP69SeedDocument,
  getP69CatalogEntry,
} from "./catalog";

export type DemoRole = "astronaut" | "researcher" | "medical";
export type DemoActorRole = DemoRole | "seed";
export type DemoRecordState = "submitted" | "scientific_assessment_recorded" | "medical_review_recorded";
export type DemoTransitionAction = "scientific_assessment_recorded" | "medical_review_recorded";
export type DemoSourceQuality = "good" | "degraded" | "poor" | "unknown";
export type ScientificOutcome = (typeof P69_SCIENTIFIC_OUTCOMES)[number];
export type MedicalOutcome = (typeof P69_MEDICAL_OUTCOMES)[number];

export const DEMO_ROLES: readonly DemoRole[] = ["astronaut", "researcher", "medical"];

export const DEMO_ROLE_LABELS: Readonly<Record<DemoRole, { title: string; responsibility: string; existingRole: string }>> = {
  astronaut: {
    title: "Astronaut",
    responsibility: "Submit a synthetic examination and see its final review status.",
    existingRole: "crew_self",
  },
  researcher: {
    title: "Researcher",
    responsibility: "Record a scientific assessment of submitted synthetic evidence.",
    existingRole: "researcher",
  },
  medical: {
    title: "Medical",
    responsibility: "Review the scientific assessment and record a medical review.",
    existingRole: "ground_medical",
  },
};

export const STATE_LABELS: Readonly<Record<DemoRecordState, string>> = {
  submitted: "Submitted — awaiting scientific assessment",
  scientific_assessment_recorded: "Scientific assessment recorded — awaiting medical review",
  medical_review_recorded: "Medical review recorded",
};

export const OUTCOME_LABELS: Readonly<Record<ScientificOutcome | MedicalOutcome | "submitted", string>> = {
  submitted: "Submitted",
  consistent_with_synthetic_reference: "Consistent with synthetic reference",
  requires_more_evidence: "Requires more evidence",
  outside_synthetic_reference: "Outside synthetic reference",
  no_follow_up_needed: "No follow-up needed (synthetic)",
  follow_up_recommended: "Follow-up recommended (synthetic)",
  repeat_measurement_requested: "Repeat measurement requested (synthetic)",
};

export const DEMO_DISCLOSURE =
  "Synthetic demonstration. All data are synthetic; Alex Morgan is a synthetic subject in your private demo workspace. Research use only — not a medical device, diagnosis or clinical clearance.";

export const TRANSITION_RULES: Readonly<
  Record<DemoTransitionAction, { role: DemoRole; from: DemoRecordState; outcomes: readonly string[]; revision: number }>
> = {
  scientific_assessment_recorded: { role: "researcher", from: "submitted", outcomes: P69_SCIENTIFIC_OUTCOMES, revision: 2 },
  medical_review_recorded: { role: "medical", from: "scientific_assessment_recorded", outcomes: P69_MEDICAL_OUTCOMES, revision: 3 },
};

export const SUBMIT_ROLES: readonly DemoRole[] = ["astronaut", "medical"];
export const MAX_NOTE_LENGTH = 1000;
export const MAX_MEASUREMENTS = 30;

export interface DemoMeasurement {
  metricId: string;
  value: string;
  unit: string;
}

export interface DemoEvent {
  id: string;
  revision: number;
  action: "submitted" | DemoTransitionAction;
  fromState: DemoRecordState | null;
  toState: DemoRecordState;
  actorRole: DemoActorRole;
  outcome: string | null;
  note: string | null;
  redacted: boolean;
  recordedAt: string;
  evidence: { provenance: "synthetic"; sourceQuality: DemoSourceQuality; measurementCount: number; measurementsSha256: string };
}

export interface DemoRecord {
  id: string;
  recordRef: string;
  epoch: number;
  crewSubjectId: string;
  observedOn: string;
  submittedRole: DemoActorRole;
  sourceQuality: DemoSourceQuality;
  sourceLabel: string;
  provenance: "synthetic";
  measurements: DemoMeasurement[];
  measurementsSha256: string;
  state: DemoRecordState;
  revision: number;
  createdAt: string;
  events: DemoEvent[];
}

export type DemoRuleCode = "wrong_role" | "invalid_state" | "stale" | "invalid";
export type DemoRuleResult = { ok: true } | { ok: false; code: DemoRuleCode; message: string };

const VALUE = /^-?\d{1,7}(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const QUALITIES: readonly DemoSourceQuality[] = ["good", "degraded", "poor", "unknown"];

export function isDemoRole(value: unknown): value is DemoRole {
  return typeof value === "string" && (DEMO_ROLES as readonly string[]).includes(value);
}

export interface ExaminationInput {
  observedOn: string;
  sourceQuality: string;
  measurements: readonly DemoMeasurement[];
}

/** Exact catalog IDs and units only; no conversion, no duplicates, no invention. */
export function validateExaminationInput(input: ExaminationInput, today: string): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (!DATE.test(input.observedOn) || Number.isNaN(Date.parse(`${input.observedOn}T00:00:00Z`)))
    issues.push("Examination date must be a calendar date (YYYY-MM-DD).");
  else if (input.observedOn < "2000-01-01" || input.observedOn > addDays(today, 1))
    issues.push("Examination date must not be in the future.");
  if (!(QUALITIES as readonly string[]).includes(input.sourceQuality)) issues.push("Choose a source quality.");
  if (input.measurements.length === 0) issues.push("Add at least one measurement.");
  if (input.measurements.length > MAX_MEASUREMENTS) issues.push(`At most ${MAX_MEASUREMENTS} measurements.`);
  const seen = new Set<string>();
  for (const m of input.measurements) {
    const entry = getP69CatalogEntry(m.metricId);
    if (!entry) {
      issues.push(`Unknown demo parameter ${m.metricId}.`);
      continue;
    }
    if (seen.has(m.metricId)) issues.push(`${entry.label} appears more than once.`);
    seen.add(m.metricId);
    if (m.unit !== entry.unit) issues.push(`${entry.label} must use exactly ${entry.unit}; no conversion is applied.`);
    if (!VALUE.test(m.value.trim())) issues.push(`${entry.label}: enter a plain number (up to 4 decimals).`);
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function canSubmitExamination(role: DemoRole): boolean {
  return SUBMIT_ROLES.includes(role);
}

export function checkTransition(args: {
  role: DemoRole;
  action: DemoTransitionAction;
  currentState: DemoRecordState;
  currentRevision: number;
  expectedRevision: number;
  outcome: string;
  note: string;
}): DemoRuleResult {
  const rule = TRANSITION_RULES[args.action];
  if (!rule) return { ok: false, code: "invalid", message: "Unknown workflow action." };
  if (args.role !== rule.role)
    return { ok: false, code: "wrong_role", message: `Only the ${DEMO_ROLE_LABELS[rule.role].title} role can record this step.` };
  if (args.currentRevision !== args.expectedRevision)
    return { ok: false, code: "stale", message: "This record changed since you opened it. Refresh and review the latest version." };
  if (args.currentState !== rule.from)
    return { ok: false, code: "invalid_state", message: `This step requires state “${STATE_LABELS[rule.from]}”.` };
  if (!rule.outcomes.includes(args.outcome)) return { ok: false, code: "invalid", message: "Choose an outcome." };
  if (args.note.length > MAX_NOTE_LENGTH) return { ok: false, code: "invalid", message: `Notes are limited to ${MAX_NOTE_LENGTH} characters.` };
  return { ok: true };
}

/** Astronauts see the final medical state, never the scientific assessment details. */
export function projectRecordForRole(record: DemoRecord, role: DemoRole): DemoRecord {
  if (role !== "astronaut") return record;
  return {
    ...record,
    events: record.events.map((e) =>
      e.action === "scientific_assessment_recorded" ? { ...e, outcome: null, note: null, redacted: true } : e,
    ),
  };
}

export function astronautStatus(record: DemoRecord): string {
  if (record.state === "medical_review_recorded") {
    const final = record.events.find((e) => e.action === "medical_review_recorded");
    return final?.outcome ? `Final: ${OUTCOME_LABELS[final.outcome as MedicalOutcome] ?? final.outcome}` : "Final review recorded";
  }
  return record.state === "submitted" ? "Under scientific assessment" : "Under medical review";
}

export function queueFor(role: DemoRole, records: readonly DemoRecord[]): DemoRecord[] {
  if (role === "researcher") return records.filter((r) => r.state === "submitted");
  if (role === "medical") return records.filter((r) => r.state === "scientific_assessment_recorded");
  return records.filter((r) => r.state !== "medical_review_recorded");
}

/* ------------------------------------------------------------------------ */
/* Offline rehearsal: same rules, in memory only, labelled as not persisted.  */
/* ------------------------------------------------------------------------ */

export interface OfflineDemoState {
  mode: "offline_rehearsal";
  epoch: number;
  maxEpoch: number;
  revision: number;
  records: DemoRecord[];
  nextId: number;
}

function offlineId(state: OfflineDemoState, prefix: string): string {
  return `${prefix}-offline-${state.nextId}`;
}

function seedRecords(epoch: number, at: string): DemoRecord[] {
  const doc = buildP69SeedDocument();
  return doc.examinations.map((exam, i) => {
    const evidence = {
      provenance: "synthetic" as const,
      sourceQuality: exam.sourceQuality as DemoSourceQuality,
      measurementCount: exam.measurements.length,
      measurementsSha256: "offline-rehearsal",
    };
    const id = `seed-${epoch}-${i + 1}`;
    return {
      id,
      recordRef: exam.recordRef,
      epoch,
      crewSubjectId: P69_DEMO_CREW_SUBJECT.id,
      observedOn: exam.observedOn,
      submittedRole: "seed",
      sourceQuality: exam.sourceQuality as DemoSourceQuality,
      sourceLabel: exam.sourceLabel,
      provenance: "synthetic",
      measurements: exam.measurements.map((m) => ({ ...m })),
      measurementsSha256: "offline-rehearsal",
      state: "medical_review_recorded",
      revision: 3,
      createdAt: at,
      events: [
        { id: `${id}-1`, revision: 1, action: "submitted", fromState: null, toState: "submitted", actorRole: "seed", outcome: "submitted", note: "", redacted: false, recordedAt: at, evidence },
        { id: `${id}-2`, revision: 2, action: "scientific_assessment_recorded", fromState: "submitted", toState: "scientific_assessment_recorded", actorRole: "seed", outcome: exam.scientific.outcome, note: exam.scientific.note, redacted: false, recordedAt: at, evidence },
        { id: `${id}-3`, revision: 3, action: "medical_review_recorded", fromState: "scientific_assessment_recorded", toState: "medical_review_recorded", actorRole: "seed", outcome: exam.medical.outcome, note: exam.medical.note, redacted: false, recordedAt: at, evidence },
      ],
    };
  });
}

export function createOfflineDemoState(at: string): OfflineDemoState {
  return { mode: "offline_rehearsal", epoch: 1, maxEpoch: 1, revision: 1, records: seedRecords(1, at), nextId: 1 };
}

export type OfflineResult = { ok: true; state: OfflineDemoState } | { ok: false; code: DemoRuleCode; message: string };

export function offlineSubmit(state: OfflineDemoState, role: DemoRole, input: ExaminationInput, at: string): OfflineResult {
  if (!canSubmitExamination(role)) return { ok: false, code: "wrong_role", message: "Only Astronaut or Medical can submit an examination." };
  const valid = validateExaminationInput(input, at.slice(0, 10));
  if (!valid.ok) return { ok: false, code: "invalid", message: valid.issues.join(" ") };
  const inEpoch = state.records.filter((r) => r.epoch === state.epoch).length;
  const id = offlineId(state, "rec");
  const evidence = { provenance: "synthetic" as const, sourceQuality: input.sourceQuality as DemoSourceQuality, measurementCount: input.measurements.length, measurementsSha256: "offline-rehearsal" };
  const record: DemoRecord = {
    id,
    recordRef: `EXAM-${String(inEpoch + 1).padStart(4, "0")}`,
    epoch: state.epoch,
    crewSubjectId: P69_DEMO_CREW_SUBJECT.id,
    observedOn: input.observedOn,
    submittedRole: role,
    sourceQuality: input.sourceQuality as DemoSourceQuality,
    sourceLabel: role === "astronaut" ? "Astronaut self-submitted synthetic examination" : "Ground Medical entered synthetic examination",
    provenance: "synthetic",
    measurements: input.measurements.map((m) => ({ metricId: m.metricId, value: m.value.trim(), unit: m.unit })),
    measurementsSha256: "offline-rehearsal",
    state: "submitted",
    revision: 1,
    createdAt: at,
    events: [{ id: `${id}-1`, revision: 1, action: "submitted", fromState: null, toState: "submitted", actorRole: role, outcome: "submitted", note: "", redacted: false, recordedAt: at, evidence }],
  };
  return { ok: true, state: { ...state, records: [...state.records, record], nextId: state.nextId + 1 } };
}

export function offlineTransition(
  state: OfflineDemoState,
  args: { role: DemoRole; recordId: string; action: DemoTransitionAction; outcome: string; note: string; expectedRevision: number },
  at: string,
): OfflineResult {
  const record = state.records.find((r) => r.id === args.recordId && r.epoch === state.epoch);
  if (!record) return { ok: false, code: "invalid", message: "Record not found in this workspace." };
  const check = checkTransition({ ...args, currentState: record.state, currentRevision: record.revision });
  if (!check.ok) return check;
  const last = record.events[record.events.length - 1]!;
  const event: DemoEvent = {
    id: `${record.id}-${record.revision + 1}`,
    revision: record.revision + 1,
    action: args.action,
    fromState: record.state,
    toState: args.action,
    actorRole: args.role,
    outcome: args.outcome,
    note: args.note.trim(),
    redacted: false,
    recordedAt: at,
    evidence: last.evidence,
  };
  const updated: DemoRecord = { ...record, state: args.action, revision: event.revision, events: [...record.events, event] };
  return { ok: true, state: { ...state, records: state.records.map((r) => (r.id === record.id ? updated : r)) } };
}

export function offlineReset(state: OfflineDemoState, expectedRevision: number, at: string): OfflineResult {
  if (expectedRevision !== state.revision) return { ok: false, code: "stale", message: "The workspace changed; refresh before resetting." };
  const epoch = state.maxEpoch + 1;
  return { ok: true, state: { ...state, epoch, maxEpoch: epoch, revision: state.revision + 1, records: [...state.records, ...seedRecords(epoch, at)] } };
}

export function offlineRestore(state: OfflineDemoState, epoch: number, expectedRevision: number): OfflineResult {
  if (expectedRevision !== state.revision) return { ok: false, code: "stale", message: "The workspace changed; refresh before restoring." };
  if (!Number.isInteger(epoch) || epoch < 1 || epoch > state.maxEpoch || epoch === state.epoch)
    return { ok: false, code: "invalid", message: "Choose an earlier workspace version." };
  return { ok: true, state: { ...state, epoch, revision: state.revision + 1 } };
}

export function currentEpochRecords(state: OfflineDemoState): DemoRecord[] {
  return state.records.filter((r) => r.epoch === state.epoch);
}

export function sampleExaminationMeasurements(): DemoMeasurement[] {
  return P69_DEMO_CATALOG.map(({ metricId, seedValue, unit }) => ({ metricId, value: seedValue, unit }));
}
