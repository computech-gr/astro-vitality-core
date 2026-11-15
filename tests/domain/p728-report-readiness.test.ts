/**
 * P72.8 — Health Intelligence PDF cross-device consistency and data readiness (SYNTHETIC FIXTURES ONLY).
 * Rules (owner, P72.8): never export a completed report while examinations are loading or failed; keep
 * "no examinations", "examinations not retrieved" and "retrieved, no findings" distinct; a failed or partial
 * read never prints "No high-priority findings"; identical inputs give identical findings on every device;
 * the export carries mission, period, examination count/dates, dataset fingerprint and export timestamp,
 * with the timestamp kept out of the scientific inputs. Nothing here is stored, synced or uploaded.
 */
import { describe, expect, it } from "bun:test";
import { buildHealthAssessment } from "../../src/domain/health-intelligence/p56-health-assessment";
import { buildBiomarkerAssessment } from "../../src/domain/health-intelligence/biomarker-health-assessment";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildResearcherInterpretation } from "../../src/domain/health-intelligence/researcher-interpretation";
import { buildProfessionalReport, professionalReportPlainText } from "../../src/domain/health-intelligence/p58-professional-report";
import { buildPremiumReport, type PremiumReport } from "../../src/domain/health-intelligence/p59-premium-model";
import { compactExamDates, renderPremiumReport } from "../../src/domain/health-intelligence/p59-premium-pdf";
import {
  assessReportReadiness,
  compareLocalWithServer,
  reportProvenanceLines,
  type LocalReadState,
  type ReportDataProvenance,
  type ServerComparison,
  type ServerComparisonDeps,
} from "../../src/domain/health-intelligence/p728-report-readiness";
import type { PullResponse } from "../../src/domain/health-intelligence/observation-sync-runner";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { alexFull, smallNormal } from "../support/p59-fixtures";
import { V9_SCOPE } from "../domain/fixtures-v9-observations";
import { SvgPdfWriter } from "../support/svg-pdf-writer";

const SCOPE = V9_SCOPE;
const SCOPE_KEY = `${SCOPE.missionId}|${SCOPE.crewMemberId}`;
const RANGE = { from: "2026-11-01", to: "2026-11-08" };

/** One browser session: same pipeline as the Health report page, with its own clock and record order. */
function session(history: UnifiedObservation[], generatedAt: string, range = RANGE): PremiumReport {
  const inputs = { domainEntries: {}, unifiedObservations: history, deviceRecords: [] };
  const unified = buildUnifiedHealthReport(inputs as never, SCOPE, range, generatedAt);
  const model = buildResearcherInterpretation(unified, buildScientificFindings(unified), []);
  const biomarkers = buildBiomarkerAssessment(unified, model, undefined, { criteria: [] });
  const assessment = buildHealthAssessment({ unified, model, biomarkers, identity: { missionName: "MITO_DEMO_2026", crewDisplayName: "Alex Morgan" }, scopeHistory: unified.rows });
  const report = buildProfessionalReport({ assessment, biomarkers });
  return buildPremiumReport({ report, unified, biomarkers, approved: [], missionId: SCOPE.missionId, options: { provisionalLiterature: true, demonstrationMappings: true } });
}
const text = (r: PremiumReport, provenance?: ReportDataProvenance) => {
  const w = new SvgPdfWriter();
  const { pages } = renderPremiumReport(r, w as never, { family: "LiberationSans", unicode: true, ...(provenance ? { provenance } : {}) });
  return { pages, text: w.texts.map((t) => t.text).join("\n") };
};
/** The scientific content of a report: everything except the wall-clock generation time. */
const scientific = (r: PremiumReport) => JSON.stringify({ ...r, header: { ...r.header, generatedAt: null }, base: null });
const events = (rows: UnifiedObservation[]) => rows.map((o) => ({ eventId: `${o.id}:entry`, eventKind: "entry" as const, observation: o }));
const shuffled = <T,>(xs: T[]) => [...xs].reverse().sort((a, b) => (JSON.stringify(a).length % 3) - (JSON.stringify(b).length % 3));

/** Server stand-in with real pagination over a fixed list of events. */
function server(rows: UnifiedObservation[], opts: { pageSize?: number; failAtPage?: number; refuse?: PullResponse; problems?: number; stuck?: boolean } = {}) {
  const all = events(rows).map((e, i) => ({ ...e, fingerprint: `fp-${i}`, receivedAt: null, receivedSeq: i + 1 }));
  let page = 0;
  return async ({ afterSeq }: { afterSeq: number }): Promise<PullResponse> => {
    page++;
    if (opts.refuse) return opts.refuse;
    if (opts.failAtPage === page) throw new Error("network");
    const size = opts.pageSize ?? 100;
    const slice = all.filter((e) => e.receivedSeq > afterSeq).slice(0, size);
    return {
      ok: true,
      events: slice,
      problems: opts.problems ? Array.from({ length: opts.problems }, (_, i) => ({ eventId: `bad-${i}`, receivedSeq: 999 + i, problem: "undecryptable_or_tampered" })) : [],
      lastSeq: opts.stuck ? afterSeq : (slice.at(-1)?.receivedSeq ?? afterSeq),
      hasMore: opts.stuck ? true : all.filter((e) => e.receivedSeq > afterSeq).length > size,
    };
  };
}
const deps = (local: UnifiedObservation[], pull: ServerComparisonDeps["pull"], online = true): ServerComparisonDeps => ({ listLocal: async () => events(local), pull, online });
const ready = (token = 1): LocalReadState => ({ kind: "ready", scopeKey: SCOPE_KEY, token });
const assess = (local: LocalReadState, srv: ServerComparison, included: number, coverage: { complete: boolean | null } | null = null) =>
  assessReportReadiness({ scopeKey: SCOPE_KEY, local, server: srv, coverage: coverage ? { source: "device-local-encrypted-store", storedRecords: 10, readRecords: coverage.complete === false ? 4 : 10, complete: coverage.complete } : null, includedObservations: included });

describe("P72.8 two independent browser sessions with identical inputs", () => {
  it("produce identical findings, sections and fingerprint regardless of clock and record order", () => {
    const rows = alexFull();
    const a = session(rows, "2026-11-08T12:00:00.000Z");
    const b = session(shuffled(rows), "2026-11-15T09:14:00.000Z");
    expect(scientific(a)).toBe(scientific(b));
    expect(a.census.sha256).toBe(b.census.sha256);
    expect(a.header.evidenceId).toBe(b.header.evidenceId);
    expect(a.alerts).toEqual(b.alerts);
    expect(a.patternAlerts).toEqual(b.patternAlerts);
    expect(text(a).text).toBe(text(b).text);
  });

  it("different authenticated roles with equivalent access see the same server-confirmed dataset and report", async () => {
    const rows = alexFull();
    const groundMedical = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows)));
    const researcher = await compareLocalWithServer(SCOPE, 1, deps(shuffled(rows), server(shuffled(rows), { pageSize: 7 })));
    expect(groundMedical.kind).toBe("matched");
    expect(researcher.kind).toBe("matched");
    const ra = assess(ready(), groundMedical, rows.length);
    const rb = assess(ready(), researcher, rows.length);
    expect({ ...ra, detail: "" }).toEqual({ ...rb, detail: "" });
    expect(scientific(session(rows, "2026-11-08T12:00:00.000Z"))).toBe(scientific(session(shuffled(rows), "2026-11-09T12:00:00.000Z")));
  });
});

describe("P72.8 empty examination dataset", () => {
  it("says 'No examinations recorded in this period', never 'No high-priority findings', and the dates tile is never blank", () => {
    const r = session([], "2026-11-12T12:00:00.000Z", { from: "2026-11-01", to: "2026-11-12" });
    expect(r.dataStatus).toBe("no_examinations");
    expect(r.alerts.map((a) => a.title)).toEqual(["No examinations recorded in this period"]);
    expect(r.overview).toEqual([]);
    const { text: t } = text(r);
    expect(t).not.toContain("No high-priority findings");
    expect(t).not.toContain("No preliminary clinical concern was identified");
    expect(t).toContain("No examinations recorded in this period");
    expect(t).toContain("None in this period");
    expect(compactExamDates([])).toBe("None in this period");
    expect(professionalReportPlainText(r.base)).toContain("NO EXAMINATIONS RECORDED IN THIS PERIOD");
  });

  it("is exportable only as an explicit no-examinations report once retrieval is confirmed", async () => {
    const srv = await compareLocalWithServer(SCOPE, 1, deps([], server([])));
    const r = assess(ready(), srv, 0);
    expect(r.exportAllowed).toBe(true);
    expect(r.dataStatus).toBe("no_examinations");
    expect(r.title).toBe("Confirmed: no examinations in this period");
  });

  it("a period with examinations and no concern still uses the regular findings wording", () => {
    const r = session(smallNormal(), "2026-11-08T12:00:00.000Z");
    expect(r.dataStatus).toBe("examinations_present");
    expect(r.alerts.some((a) => a.title === "No examinations recorded in this period")).toBe(false);
  });
});

describe("P72.8 failed, delayed, partial and stale retrieval never export", () => {
  it("failed backend query blocks export and never reports 'no findings'", async () => {
    const rows = smallNormal();
    const thrown = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows, { failAtPage: 1 })));
    const refused = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows, { refuse: { ok: false, code: "unavailable", message: "x" } })));
    const forbidden = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows, { refuse: { ok: false, code: "forbidden", message: "x" } })));
    const unreadable = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows, { problems: 2 })));
    for (const c of [thrown, refused, forbidden, unreadable]) {
      expect(c.kind).toBe("failed");
      const r = assess(ready(), c, 0);
      expect(r.exportAllowed).toBe(false);
      expect(r.dataStatus).toBe("not_retrieved");
      expect(`${r.title} ${r.detail}`).not.toMatch(/no (high-priority )?findings/i);
    }
    const localFailed = assess({ kind: "failed", scopeKey: SCOPE_KEY, token: 1, message: "The examinations stored on this device could not be read." }, { kind: "pending" }, 0);
    expect(localFailed.exportAllowed).toBe(false);
    expect(localFailed.state).toBe("local_failed");
  });

  it("delayed examination loading keeps export disabled until both reads finish for the same load", () => {
    expect(assess({ kind: "loading", scopeKey: SCOPE_KEY, token: 2 }, { kind: "pending" }, 0).exportAllowed).toBe(false);
    expect(assess(ready(2), { kind: "checking", token: 2 }, 7).state).toBe("verifying");
    // A comparison from an earlier read (token 1) is stale for read 2.
    const stale: ServerComparison = { kind: "matched", token: 1, remoteEvents: 7, localEvents: 7, localOnly: 0, pages: 1 };
    expect(assess(ready(2), stale, 7).exportAllowed).toBe(false);
    // A read for another crew member is never accepted for this scope.
    expect(assessReportReadiness({ scopeKey: SCOPE_KEY, local: { kind: "ready", scopeKey: "mission-a|crew-b", token: 2 }, server: { ...stale, token: 2 }, coverage: null, includedObservations: 7 }).state).toBe("loading");
    expect(assess(ready(2), { ...stale, token: 2 }, 7).exportAllowed).toBe(true);
  });

  it("partial pagination is a failure, never a smaller report", async () => {
    const rows = alexFull();
    const capped = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows, { pageSize: 10 })), 2);
    const stuck = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows, { stuck: true })));
    const secondPageDown = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows, { pageSize: 10, failAtPage: 2 })));
    for (const c of [capped, stuck, secondPageDown]) {
      expect(c.kind).toBe("failed");
      expect(assess(ready(), c, rows.length).exportAllowed).toBe(false);
    }
    const full = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows, { pageSize: 10 })));
    expect(full).toMatchObject({ kind: "matched", remoteEvents: rows.length, pages: Math.ceil(rows.length / 10) });
  });

  it("stale cached mission data (examinations on the server but not on this device) blocks export until imported", async () => {
    const rows = alexFull();
    const stale = await compareLocalWithServer(SCOPE, 1, deps([], server(rows)));
    expect(stale).toMatchObject({ kind: "missing_locally", missing: rows.length, localEvents: 0 });
    const r = assess(ready(), stale, 0);
    expect(r.exportAllowed).toBe(false);
    expect(r.title).toBe("Examinations exist but are not on this device");
    const partial = await compareLocalWithServer(SCOPE, 1, deps(rows.slice(0, 5), server(rows)));
    expect(partial).toMatchObject({ kind: "missing_locally", missing: rows.length - 5 });
    const after = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows)));
    expect(assess(ready(), after, rows.length).exportAllowed).toBe(true);
  });

  it("different content for the same record on this device and the server blocks export", async () => {
    const rows = smallNormal();
    const changed = rows.map((o, i) => (i === 0 ? { ...o, value: "999" } : o));
    const c = await compareLocalWithServer(SCOPE, 1, deps(changed, server(rows)));
    expect(c).toMatchObject({ kind: "inconsistent", conflicts: 1 });
    expect(assess(ready(), c, rows.length).exportAllowed).toBe(false);
  });

  it("an incomplete local read blocks export", () => {
    const ok: ServerComparison = { kind: "matched", token: 1, remoteEvents: 7, localEvents: 7, localOnly: 0, pages: 1 };
    expect(assess(ready(), ok, 7, { complete: false }).state).toBe("incomplete_read");
    expect(assess(ready(), ok, 7, { complete: true }).exportAllowed).toBe(true);
  });

  it("offline or server copies not available → exportable but labelled THIS DEVICE ONLY", async () => {
    const rows = smallNormal();
    const offline = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows), false));
    const disabled = await compareLocalWithServer(SCOPE, 1, deps(rows, server(rows, { refuse: { ok: false, code: "disabled", message: "x" } })));
    for (const c of [offline, disabled]) {
      expect(c.kind).toBe("unavailable");
      const r = assess(ready(), c, rows.length);
      expect(r).toMatchObject({ exportAllowed: true, basis: "local_only", title: "This device only — not compared with the server" });
    }
  });
});

describe("P72.8 examination dates and data provenance", () => {
  it("examination-date descriptions come from exactly the evaluated observations", () => {
    const r = session(alexFull(), "2026-11-08T12:00:00.000Z");
    const days = [...new Set(r.rows.map((x) => x.date))].sort();
    expect(r.header.examinationDates).toEqual(days);
    expect(r.census.dates).toEqual(days);
    expect(r.counts.examinationDates).toBe(days.length);
    expect(days).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(compactExamDates(days)).toBe("5, 6, 7, 8 Nov 2026 (4 dates)");
  });

  it("the PDF names mission, period, examination count/dates, fingerprint and export time; the time changes nothing else", () => {
    const r = session(alexFull(), "2026-11-08T12:00:00.000Z");
    const p = (exportedAt: string): ReportDataProvenance => ({
      missionId: SCOPE.missionId, crewMemberId: SCOPE.crewMemberId, provenance: "synthetic", period: r.header.period,
      examinationDates: r.census.dates, observations: r.census.observations, series: r.census.series, datasetFingerprint: r.census.sha256,
      basis: "server_confirmed", serverRecords: r.census.observations, readinessVersion: "p72.8-report-readiness.v1", exportedAt,
    });
    const one = text(r, p("2026-11-15T09:14:00.000Z")).text;
    const two = text(r, p("2026-11-16T10:00:00.000Z")).text;
    for (const needle of ["Report data provenance", `Mission ID: ${SCOPE.missionId}`, `Selected period: ${r.header.period}`, `Examination dates (4): 2026-11-05, 2026-11-06, 2026-11-07, 2026-11-08`, r.census.sha256, "Export timestamp (UTC): 2026-11-15T09:14:00.000Z", "Data basis: server-confirmed"])
      expect(one).toContain(needle);
    expect(one.replace(/2026-11-15T09:14:00\.000Z/g, "T")).toBe(two.replace(/2026-11-16T10:00:00\.000Z/g, "T"));
    expect(reportProvenanceLines({ ...p("x"), basis: "local_only" }).join("\n")).toContain("THIS DEVICE ONLY");
  });
});
