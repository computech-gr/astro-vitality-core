/**
 * P72.9 — Server-confirmed Health Intelligence report dataset (SYNTHETIC FIXTURES ONLY).
 * Owner rules: an online report is built from the complete authorized server dataset without any manual
 * download and without writing to the device; one immutable snapshot feeds screen and exports; offline
 * reports are explicit and labelled LOCAL OFFLINE DATASET — NOT SERVER VERIFIED; a failed server read is
 * never silently replaced by local data; empty, failed and no-finding periods stay distinct (current and
 * Previous-format PDF); every export names mission, subject, period, examinations, dates, fingerprint,
 * source, engine version and export time.
 */
import { describe, expect, it } from "bun:test";
import {
  assessDatasetReadiness,
  datasetFingerprint,
  fetchServerReportDataset,
  LOCAL_OFFLINE_LABEL,
  localOfflineSnapshot,
  localRecordsNotOnServer,
  REPORT_ENGINE_VERSION,
  type LocalDatasetState,
  type ReviewPullResponse,
  type ServerDatasetDeps,
} from "../../src/domain/health-intelligence/p729-report-dataset";
import { reportProvenanceLines, type ReportDataProvenance } from "../../src/domain/health-intelligence/p728-report-readiness";
import type { PullResponse } from "../../src/domain/health-intelligence/observation-sync-runner";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import type { AttestationEvent } from "../../src/domain/health-intelligence/evidence-attestation";
import { planAttestation } from "../../src/domain/health-intelligence/evidence-attestation";
import { buildStoredObservationReview } from "../../src/domain/health-intelligence/stored-observation-review";
import { buildUnifiedHealthReport, type UnifiedReportInputs } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildResearcherInterpretation } from "../../src/domain/health-intelligence/researcher-interpretation";
import { buildBiomarkerAssessment } from "../../src/domain/health-intelligence/biomarker-health-assessment";
import { buildHealthAssessment } from "../../src/domain/health-intelligence/p56-health-assessment";
import { buildProfessionalReport, type ProfessionalReport } from "../../src/domain/health-intelligence/p58-professional-report";
import { renderProfessionalReport } from "../../src/domain/health-intelligence/p58-professional-pdf";
import { buildPremiumReport, type PremiumReport } from "../../src/domain/health-intelligence/p59-premium-model";
import { renderPremiumReport } from "../../src/domain/health-intelligence/p59-premium-pdf";
import { V9_SCOPE, gmCtx, obs } from "./fixtures-v9-observations";
import { alexFull as alexFixture } from "../support/p59-fixtures";
import { validateUnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
/** The P59 Alex fixture restricted to records that pass envelope validation (as the server returns them). */
const alexFull = () => alexFixture().filter((o) => !validateUnifiedObservation(o));
import { SvgPdfWriter } from "../support/svg-pdf-writer";

const SCOPE = V9_SCOPE;

type Ev = { eventId: string; eventKind: "entry" | "status"; observation: UnifiedObservation };
const entries = (rows: UnifiedObservation[]): Ev[] => rows.map((o) => ({ eventId: `${o.id}:${o.status === "erroneous" ? "status" : "entry"}`, eventKind: o.status === "erroneous" ? "status" : "entry", observation: o }));

function obsServer(evs: Ev[], opts: { pageSize?: number; throwAt?: number; refuse?: PullResponse; problems?: number; stuck?: boolean } = {}) {
  const all = evs.map((e, i) => ({ ...e, fingerprint: `fp-${i}`, receivedAt: null, receivedSeq: i + 1 }));
  let page = 0;
  const calls: number[] = [];
  const pull: ServerDatasetDeps["pullObservations"] = async ({ afterSeq, limit }) => {
    page++;
    calls.push(afterSeq);
    if (opts.refuse) return opts.refuse;
    if (opts.throwAt === page) throw new Error("network");
    const size = Math.min(opts.pageSize ?? 100, limit);
    const rest = all.filter((e) => e.receivedSeq > afterSeq);
    const slice = rest.slice(0, size);
    return {
      ok: true,
      events: slice,
      problems: opts.problems ? [{ eventId: "bad", receivedSeq: 999, problem: "undecryptable_or_tampered" }] : [],
      lastSeq: opts.stuck ? afterSeq : (slice.at(-1)?.receivedSeq ?? afterSeq),
      hasMore: opts.stuck ? true : rest.length > size,
    };
  };
  return Object.assign(pull, { calls });
}
const toRow = (e: AttestationEvent) => ({
  event_id: e.eventId, action: e.action, record_id: e.recordId, record_fingerprint: e.recordFingerprint, metric_id: e.metricId, badge: e.badge,
  mission_id: e.scope.missionId, crew_member_id: e.scope.crewMemberId, provenance: e.scope.provenance, actor_user_id: e.actorUserId,
  reason: e.reason, decided_at: e.decidedAt, batch_id: e.batchId, supersedes_event_id: e.supersedesEventId, received_at: "2026-11-01T10:00:01Z", received_seq: 1,
});
function revServer(events: AttestationEvent[], opts: { refuse?: ReviewPullResponse; malformed?: boolean } = {}): ServerDatasetDeps["pullReviews"] {
  return async ({ afterSeq, limit }) => {
    if (opts.refuse) return opts.refuse;
    const rows = events.map((e, i) => ({ ...toRow(e), received_seq: i + 1 })).filter((r) => r.received_seq > afterSeq).slice(0, limit);
    if (opts.malformed && rows[0]) rows[0] = { ...rows[0], reason: "x" };
    return { ok: true, rows, lastSeq: rows.at(-1)?.received_seq ?? afterSeq, hasMore: rows.length >= limit };
  };
}
const depsFor = (evs: Ev[], reviews: AttestationEvent[] = [], o: Parameters<typeof obsServer>[1] = {}, online = true): ServerDatasetDeps => ({ pullObservations: obsServer(evs, o), pullReviews: revServer(reviews), online });

function attest(rows: UnifiedObservation[]): AttestationEvent[] {
  const review = buildStoredObservationReview(rows, SCOPE, []);
  const plan = planAttestation(review.report, rows.slice(0, 2).map((r) => r.id), [], gmCtx(), { reason: "Checked against the source lab sheet", confirmed: true });
  if (!plan.ok) throw new Error(plan.reason);
  return plan.events;
}

/** The Health report page pipeline from one snapshot's inputs (same as the component). */
function pipeline(inputs: UnifiedReportInputs, attestations: readonly AttestationEvent[], generatedAt: string, range: { from?: string; to?: string } = {}): { premium: PremiumReport; professional: ProfessionalReport } {
  const unified = buildUnifiedHealthReport(inputs, SCOPE, range, generatedAt);
  const model = buildResearcherInterpretation(unified, buildScientificFindings(unified), attestations as AttestationEvent[]);
  const biomarkers = buildBiomarkerAssessment(unified, model, undefined, { criteria: [] });
  const assessment = buildHealthAssessment({ unified, model, biomarkers, identity: { missionName: "MITO_DEMO_2026", crewDisplayName: "Alex Morgan" }, scopeHistory: unified.rows });
  const professional = buildProfessionalReport({ assessment, biomarkers });
  const premium = buildPremiumReport({ report: professional, unified, biomarkers, approved: [], missionId: SCOPE.missionId, options: { provisionalLiterature: true, demonstrationMappings: true }, coverage: inputs.coverage ?? null });
  return { premium, professional };
}
const scientific = (r: PremiumReport) => JSON.stringify({ ...r, header: { ...r.header, generatedAt: null }, base: null, coverage: null });
const premiumText = (r: PremiumReport, provenance?: ReportDataProvenance) => {
  const w = new SvgPdfWriter();
  const { pages } = renderPremiumReport(r, w as never, { family: "LiberationSans", unicode: true, ...(provenance ? { provenance } : {}) });
  return { pages, lines: w.texts.map((t) => t.text) };
};
const professionalText = (r: ProfessionalReport, provenance?: ReportDataProvenance) => {
  const w = new SvgPdfWriter();
  const { pages } = renderProfessionalReport(r, w as never, { family: "LiberationSans", unicode: true, ...(provenance ? { provenance } : {}) });
  return { pages, text: w.texts.map((t) => t.text).join("\n") };
};
const shuffled = <T,>(xs: T[]) => [...xs].reverse().sort((a, b) => (JSON.stringify(a).length % 3) - (JSON.stringify(b).length % 3));
const localReady = (inputs: UnifiedReportInputs, complete = true, token = 1): LocalDatasetState => ({ kind: "ready", token, inputs, complete, readRecords: complete ? 10 : 4, storedRecords: 10 });

describe("P72.9 fresh browser: complete online report without any manual download", () => {
  it("retrieves the complete authorized dataset (265 synthetic examinations over 3 pages) read-only", async () => {
    const rows = Array.from({ length: 265 }, () => obs());
    const reviews = attest(rows);
    const pull = obsServer(entries(rows));
    const r = await fetchServerReportDataset(SCOPE, 1, { pullObservations: pull, pullReviews: revServer(reviews), online: true });
    if (r.kind !== "ready") throw new Error(r.reason);
    expect(r.snapshot.source).toBe("server_confirmed");
    expect(r.snapshot.observationEvents).toBe(265);
    expect(r.snapshot.reviewEvents).toBe(2);
    expect(r.snapshot.inputs.unifiedObservations).toHaveLength(265);
    expect(r.snapshot.pages).toEqual({ observations: 3, reviews: 1 });
    expect(pull.calls).toEqual([0, 100, 200]);
    expect(r.snapshot.inputs.coverage).toEqual({ source: "server-authorized-dataset", storedRecords: 265, readRecords: 265, complete: true });
    const ready = assessDatasetReadiness({ hasSelection: true, mode: "server_confirmed", server: r, local: { kind: "ready", token: 1, inputs: { domainEntries: {}, unifiedObservations: [], deviceRecords: [] }, complete: true, readRecords: 0, storedRecords: 0 }, snapshot: r.snapshot, includedObservations: 265 });
    expect(ready).toMatchObject({ state: "ready_server_confirmed", exportAllowed: true, source: "server_confirmed", dataStatus: "examinations_present" });
  });

  it("the snapshot is immutable for the whole generation", async () => {
    const rows = [obs(), obs()];
    const r = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows)));
    if (r.kind !== "ready") throw new Error(r.reason);
    expect(Object.isFrozen(r.snapshot)).toBe(true);
    expect(Object.isFrozen(r.snapshot.inputs.unifiedObservations)).toBe(true);
    expect(Object.isFrozen(r.snapshot.inputs.unifiedObservations[0])).toBe(true);
    expect(() => (r.snapshot.inputs.unifiedObservations as UnifiedObservation[]).push(obs())).toThrow();
  });

  it("erroneous status events win and are collapsed exactly as on the device", async () => {
    const a = obs();
    const b = obs();
    const bad = { ...a, status: "erroneous" as const };
    const r = await fetchServerReportDataset(SCOPE, 1, depsFor([...entries([a, b]), { eventId: `${a.id}:status`, eventKind: "status", observation: bad }]));
    if (r.kind !== "ready") throw new Error(r.reason);
    expect(r.snapshot.observationEvents).toBe(3);
    expect(r.snapshot.inputs.unifiedObservations.find((o) => o.id === a.id)?.status).toBe("erroneous");
    expect(r.snapshot.summary.examinations).toBe(1);
  });
});

describe("P72.9 identical inputs give identical reports on every device and from either source", () => {
  it("two independent browsers (different paging and order) produce identical findings and fingerprints", async () => {
    const rows = alexFull();
    const a = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows), [], { pageSize: 100 }));
    const b = await fetchServerReportDataset(SCOPE, 7, depsFor(entries(shuffled(rows)), [], { pageSize: 3 }));
    if (a.kind !== "ready" || b.kind !== "ready") throw new Error("not ready");
    expect(a.snapshot.datasetFingerprint).toBe(b.snapshot.datasetFingerprint);
    const ra = pipeline(a.snapshot.inputs, a.snapshot.attestations, "2026-11-15T09:00:00.000Z", { from: "2026-11-01", to: "2026-11-07" });
    const rb = pipeline(b.snapshot.inputs, b.snapshot.attestations, "2026-11-15T11:30:00.000Z", { from: "2026-11-01", to: "2026-11-07" });
    expect(scientific(ra.premium)).toBe(scientific(rb.premium));
    expect(ra.premium.census.sha256).toBe(rb.premium.census.sha256);
    expect(premiumText(ra.premium).lines).toEqual(premiumText(rb.premium).lines);
  });

  it("a server-confirmed and a local offline report of the same data have the same findings and fingerprints", async () => {
    const rows = alexFull();
    const srv = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows)));
    if (srv.kind !== "ready") throw new Error(srv.reason);
    const local = await localOfflineSnapshot(SCOPE, 2, { domainEntries: {}, unifiedObservations: shuffled(rows), deviceRecords: [] }, []);
    expect(local.datasetFingerprint).toBe(srv.snapshot.datasetFingerprint);
    const a = pipeline(srv.snapshot.inputs, [], "2026-11-15T09:00:00.000Z");
    const b = pipeline(local.inputs, [], "2026-11-15T09:00:00.000Z");
    expect(scientific(a.premium)).toBe(scientific(b.premium));
  });

  it("a review recorded on the server changes the dataset fingerprint", async () => {
    const rows = [obs(), obs(), obs()];
    const without = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows)));
    const withReview = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows), attest(rows)));
    if (without.kind !== "ready" || withReview.kind !== "ready") throw new Error("not ready");
    expect(withReview.snapshot.datasetFingerprint).not.toBe(without.snapshot.datasetFingerprint);
    expect(await datasetFingerprint(withReview.snapshot.inputs, withReview.snapshot.attestations, SCOPE)).toBe(withReview.snapshot.datasetFingerprint);
  });
});

describe("P72.9 incomplete pagination, server errors and authorization denial fail closed", () => {
  const rows = () => [obs(), obs(), obs(), obs(), obs()];
  it("a page that does not advance is incomplete", async () => {
    const r = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows()), [], { stuck: true }));
    expect(r).toMatchObject({ kind: "failed", code: "incomplete" });
  });
  it("more pages than the bound is incomplete", async () => {
    const r = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows()), [], { pageSize: 1 }), 3);
    expect(r).toMatchObject({ kind: "failed", code: "incomplete" });
  });
  it("a network failure on a later page discards the earlier pages", async () => {
    const r = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows()), [], { pageSize: 2, throwAt: 2 }));
    expect(r).toMatchObject({ kind: "failed", code: "network" });
  });
  it("authorization denial, disabled sync, unreadable rows and out-of-scope rows", async () => {
    expect(await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows()), [], { refuse: { ok: false, code: "forbidden", message: "no" } }))).toMatchObject({ kind: "failed", code: "forbidden" });
    expect(await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows()), [], { refuse: { ok: false, code: "disabled", message: "off" } }))).toMatchObject({ kind: "failed", code: "unavailable" });
    expect(await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows()), [], { problems: 1 }))).toMatchObject({ kind: "failed", code: "invalid" });
    expect(await fetchServerReportDataset(SCOPE, 1, depsFor(entries([obs({ missionId: "mission-b" })])))).toMatchObject({ kind: "failed", code: "invalid" });
    expect(await fetchServerReportDataset(SCOPE, 1, depsFor(entries([obs({ provenance: "real" })])))).toMatchObject({ kind: "failed", code: "invalid" });
  });
  it("two different versions of one event are refused", async () => {
    const a = obs();
    const r = await fetchServerReportDataset(SCOPE, 1, depsFor([...entries([a]), { eventId: `${a.id}:entry`, eventKind: "entry", observation: { ...a, value: "999" } }]));
    expect(r).toMatchObject({ kind: "failed", code: "invalid" });
  });
  it("review stream denial or a malformed review row fails the whole dataset", async () => {
    const rs = rows();
    const evs = entries(rs);
    expect(await fetchServerReportDataset(SCOPE, 1, { pullObservations: obsServer(evs), pullReviews: revServer([], { refuse: { ok: false, code: "forbidden", message: "no" } }), online: true })).toMatchObject({ kind: "failed", code: "forbidden" });
    expect(await fetchServerReportDataset(SCOPE, 1, { pullObservations: obsServer(evs), pullReviews: revServer(attest(rs), { malformed: true }), online: true })).toMatchObject({ kind: "failed", code: "invalid" });
  });
  it("a failed retrieval blocks export and never says 'no examinations'", async () => {
    const failed = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(rows()), [], { refuse: { ok: false, code: "forbidden", message: "no" } }));
    const r = assessDatasetReadiness({ hasSelection: true, mode: "server_confirmed", server: failed, local: { kind: "loading", token: 1 }, snapshot: null, includedObservations: 0 });
    expect(r).toMatchObject({ state: "server_failed", exportAllowed: false, dataStatus: "not_retrieved", source: null, offerLocalOffline: false });
    expect(r.detail).toContain("not a negative finding");
  });
});

describe("P72.9 offline operation is explicit and labelled", () => {
  const empty: UnifiedReportInputs = { domainEntries: {}, unifiedObservations: [], deviceRecords: [] };
  it("offline: no server call, server-confirmed report unavailable, explicit local offline option offered", async () => {
    const pull = obsServer([]);
    const r = await fetchServerReportDataset(SCOPE, 1, { pullObservations: pull, pullReviews: revServer([]), online: false });
    expect(r).toMatchObject({ kind: "failed", code: "offline" });
    expect(pull.calls).toEqual([]);
    const local = localReady({ ...empty, unifiedObservations: [obs()] });
    const readiness = assessDatasetReadiness({ hasSelection: true, mode: "server_confirmed", server: r, local, snapshot: null, includedObservations: 1 });
    expect(readiness).toMatchObject({ state: "server_failed", exportAllowed: false, offerLocalOffline: true });
  });

  it("never switches silently: server mode with a ready local snapshot still blocks", async () => {
    const rows = [obs()];
    const snap = await localOfflineSnapshot(SCOPE, 1, { ...empty, unifiedObservations: rows }, []);
    const r = assessDatasetReadiness({ hasSelection: true, mode: "server_confirmed", server: { kind: "failed", token: 1, code: "network", reason: "down." }, local: localReady(snap.inputs), snapshot: snap, includedObservations: 1 });
    expect(r.exportAllowed).toBe(false);
    expect(r.source).toBeNull();
  });

  it("explicit local offline report is labelled and states the local count and date range", async () => {
    const rows = [obs({ observedAt: "2026-11-02", datePrecision: "date" }), obs({ observedAt: "2026-11-05", datePrecision: "date" })];
    const snap = await localOfflineSnapshot(SCOPE, 4, { ...empty, unifiedObservations: rows }, []);
    const r = assessDatasetReadiness({ hasSelection: true, mode: "local_offline", server: { kind: "failed", token: 1, code: "offline", reason: "offline." }, local: localReady(snap.inputs, true, 4), snapshot: snap, includedObservations: 2 });
    expect(r).toMatchObject({ state: "ready_local_offline", exportAllowed: true, source: "local_offline", title: LOCAL_OFFLINE_LABEL });
    expect(LOCAL_OFFLINE_LABEL).toBe("LOCAL OFFLINE DATASET — NOT SERVER VERIFIED");
    expect(r.detail).toContain("2 local evaluable observation(s) on 2 date(s) (2026-11-02 to 2026-11-05)");
    expect(r.detail).toContain("not a complete server dataset");
  });

  it("missing or corrupted local records: incomplete and failed reads are not eligible", () => {
    const failed: LocalDatasetState = { kind: "failed", token: 1, message: "The examinations stored on this device could not be read." };
    const offline = { kind: "failed" as const, token: 1, code: "offline" as const, reason: "offline." };
    expect(assessDatasetReadiness({ hasSelection: true, mode: "server_confirmed", server: offline, local: localReady(empty, false), snapshot: null, includedObservations: 0 }).offerLocalOffline).toBe(false);
    expect(assessDatasetReadiness({ hasSelection: true, mode: "server_confirmed", server: offline, local: failed, snapshot: null, includedObservations: 0 }).offerLocalOffline).toBe(false);
    expect(assessDatasetReadiness({ hasSelection: true, mode: "local_offline", server: offline, local: localReady(empty, false), snapshot: null, includedObservations: 0 })).toMatchObject({ state: "local_incomplete", exportAllowed: false });
    expect(assessDatasetReadiness({ hasSelection: true, mode: "local_offline", server: offline, local: failed, snapshot: null, includedObservations: 0 })).toMatchObject({ state: "local_failed", exportAllowed: false });
  });
});

describe("P72.9 server/local mismatch", () => {
  it("local-only records are reported, never merged into the server-confirmed dataset", async () => {
    const shared = [obs(), obs()];
    const localOnly = obs();
    const srv = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(shared)));
    if (srv.kind !== "ready") throw new Error(srv.reason);
    const localInputs: UnifiedReportInputs = { domainEntries: {}, unifiedObservations: [...shared, localOnly], deviceRecords: [] };
    expect(localRecordsNotOnServer(srv.snapshot, localInputs)).toEqual({ observations: 1, deviceOnly: 0 });
    expect(srv.snapshot.inputs.unifiedObservations.map((o) => o.id)).not.toContain(localOnly.id);
    const local = await localOfflineSnapshot(SCOPE, 1, localInputs, []);
    expect(local.datasetFingerprint).not.toBe(srv.snapshot.datasetFingerprint);
  });
});

describe("P72.9 empty period: current and Previous-format PDF", () => {
  it("server-confirmed empty period is exportable only as an explicit no-examinations report", async () => {
    const srv = await fetchServerReportDataset(SCOPE, 1, depsFor(entries(alexFull())));
    if (srv.kind !== "ready") throw new Error(srv.reason);
    const { premium, professional } = pipeline(srv.snapshot.inputs, [], "2026-11-15T09:00:00.000Z", { from: "2026-10-01", to: "2026-10-05" });
    expect(premium.dataStatus).toBe("no_examinations");
    const r = assessDatasetReadiness({ hasSelection: true, mode: "server_confirmed", server: srv, local: { kind: "loading", token: 1 }, snapshot: srv.snapshot, includedObservations: 0 });
    expect(r).toMatchObject({ exportAllowed: true, dataStatus: "no_examinations", title: "Server-confirmed: no examinations in this period" });
    const prev = professionalText(professional).text;
    expect(prev).toContain("No examinations recorded in this period");
    expect(prev).toContain("not a negative or reassuring finding");
    expect(prev).not.toContain("Key conclusions");
    expect(prev).not.toContain("No concern pattern is supported");
    expect(premiumText(premium).lines.join("\n")).toContain("No examinations recorded in this period");
  });

  it("a period with examinations keeps the regular Previous-format sections", async () => {
    const { professional } = pipeline({ domainEntries: {}, unifiedObservations: alexFull(), deviceRecords: [] }, [], "2026-11-15T09:00:00.000Z");
    const prev = professionalText(professional).text;
    expect(prev).toContain("Key conclusions");
    expect(prev).not.toContain("No examinations recorded in this period");
  });
});

describe("P72.9 provenance in every export", () => {
  const base = (basis: ReportDataProvenance["basis"]): ReportDataProvenance => ({
    missionId: "MITO_DEMO_2026", crewMemberId: "crew-a", provenance: "synthetic", period: "2026-11-01 to 2026-11-07", examinationDates: ["2026-11-01", "2026-11-07"],
    observations: 143, series: 60, datasetFingerprint: "a".repeat(64), basis, serverRecords: basis === "server_confirmed" ? 265 : null, reviewRecords: 264,
    scopeDatasetFingerprint: "b".repeat(64), dataSourceDetail: "detail", engineVersion: REPORT_ENGINE_VERSION, readinessVersion: "p72.9-report-dataset.v1", exportedAt: "2026-11-15T09:44:00.000Z",
  });
  it("names mission, subject, period, examinations, dates, fingerprints, source, engine and export time", () => {
    const t = reportProvenanceLines(base("server_confirmed")).join("\n");
    for (const needle of ["Mission ID: MITO_DEMO_2026", "Subject (crew) ID: crew-a", "Selected period: 2026-11-01 to 2026-11-07", "Examinations: 2 examination date(s)", "2026-11-01, 2026-11-07", "a".repeat(64), "b".repeat(64), "Data source: SERVER-CONFIRMED", `Report engine: ${REPORT_ENGINE_VERSION}`, "Export timestamp (UTC): 2026-11-15T09:44:00.000Z"])
      expect(t).toContain(needle);
    expect(reportProvenanceLines(base("local_offline")).join("\n")).toContain("Data source: LOCAL OFFLINE DATASET — NOT SERVER VERIFIED");
    expect(t).not.toMatch(/token|session|bearer|key:/i);
  });
  it("the Previous-format PDF carries the provenance section and page-1 source line", () => {
    const { professional } = pipeline({ domainEntries: {}, unifiedObservations: alexFull(), deviceRecords: [] }, [], "2026-11-15T09:00:00.000Z");
    const t = professionalText(professional, base("server_confirmed")).text;
    expect(t).toContain("Report data provenance");
    expect(t).toContain("Data source: SERVER-CONFIRMED");
  });
  it("provenance adds only the page-1 source line and the final section; the scientific text is unchanged", () => {
    const { premium } = pipeline({ domainEntries: {}, unifiedObservations: alexFull(), deviceRecords: [] }, [], "2026-11-15T09:00:00.000Z", { from: "2026-11-01", to: "2026-11-07" });
    const without = premiumText(premium);
    const withP = premiumText(premium, base("server_confirmed"));
    const count = (xs: string[], l: string) => xs.filter((x) => x === l).length;
    // Running header/footer lines repeat on every page; they are page furniture, not content.
    const frame = new Set(without.lines.filter((l) => /^Page \d+ of \d+$/.test(l) || count(without.lines, l) >= without.pages - 1));
    const body = (xs: string[]) => xs.filter((l) => !frame.has(l) && !/^Page \d+ of \d+$/.test(l));
    const provLines = new Set(body(withP.lines).filter((l) => !body(without.lines).includes(l)));
    expect(provLines.size).toBeGreaterThan(0);
    for (const l of provLines) expect(/provenance|Data source|Mission ID|Subject|Selected period|Examination|Observations evaluated|fingerprint|Report engine|Export timestamp|Readiness check|SERVER-CONFIRMED|dataset|record\(s\)|period|device|•/i.test(l)).toBe(true);
    expect(body(withP.lines).filter((l) => !provLines.has(l))).toEqual(body(without.lines));
    expect(withP.pages - without.pages).toBeGreaterThanOrEqual(0);
    expect(withP.pages - without.pages).toBeLessThanOrEqual(1);
  });
});
