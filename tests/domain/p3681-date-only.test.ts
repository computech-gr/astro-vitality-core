import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { DATED_OBSERVATION_SCHEMA, validateUnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { isCalendarDate, observationDateKey } from "../../src/domain/health-intelligence/observation-date";
import { extractCsvCandidates, extractFiveColumnLabCandidates } from "../../src/domain/health-intelligence/universal-intake-parser";
import { batchDuplicateKeys, extractFhirCandidates, extractJsonCandidates, extractXlsxCandidates } from "../../src/domain/health-intelligence/universal-intake-adapters";
import { classifyWithGovernedExtensions } from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { isIntakeRowEligible, setIntakeReviewSelection } from "../../src/domain/health-intelligence/intake-review-selection";
import { findUnifiedDuplicates, importUnifiedObservationEvent, listUnifiedObservations } from "../../src/domain/health-intelligence/observation-store";
import { InMemoryOfflineMissionStore } from "../../src/infrastructure/offline/store";
import { buildUnifiedHealthReport, unifiedReportPlainText } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { planObservationCorrection, executeCorrection } from "../../src/domain/health-intelligence/stored-observation-review";
import { projectCanonicalObservations } from "../../src/domain/health-intelligence/canonical-projection";
import { chartGeometry, filterTrendObservations } from "../../src/domain/companion/daily-companion";
import { buildReportDocument, createTextReportPdf } from "../../src/domain/health-intelligence/report-text-pdf";
import { obs, V9_SCOPE, gmCtx } from "./fixtures-v9-observations";

const date = "2026-11-05";
const dated = (over: Parameters<typeof obs>[0] = {}) => obs({ schema: DATED_OBSERVATION_SCHEMA, datePrecision: "date", observedAt: date, collectionDate: date, recordedAt: "2026-11-06T20:00:00Z", ...over });
const reportFor = (rows: ReturnType<typeof obs>[]) => buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: rows, deviceRecords: [] }, V9_SCOPE);

describe("P36.8.1 calendar precision and source fidelity", () => {
  test("valid dates do not require a time; impossible dates and implicit v1 dates fail", () => {
    expect(validateUnifiedObservation(dated())).toBeNull();
    for (const invalid of ["2026-02-30", "2026-02-29", "2026-13-01", "0000-01-01", "2026-11-05T00:00:00Z"]) expect(validateUnifiedObservation(dated({ observedAt: invalid }))).not.toBeNull();
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(validateUnifiedObservation(obs({ observedAt: date }))).not.toBeNull();
    expect(validateUnifiedObservation(obs({ observedAt: "2026-02-30T08:00:00Z" }))).not.toBeNull();
    expect(validateUnifiedObservation(obs({ observedAt: "2026-11-05T08:00:00+02:00" }))).toBeNull();
  });
  test("PDF collection metadata is exact and never becomes an instant", () => {
    const line = "Heart rate | 81 | bpm | 2026-11-05 | Review input";
    const candidate = extractFiveColumnLabCandidates(line)[0];
    expect(candidate).toMatchObject({ label: "Heart rate", value: "81", unit: "bpm", observedAt: "", collectionDate: date, datePrecision: "date", excerpt: line });
    expect(extractFiveColumnLabCandidates(line.replace(date, "2026-02-30"))).toHaveLength(0);
  });
  test("CSV, XLSX, JSON and FHIR preserve the actual date and timestamp", () => {
    const csv = "label,value,unit,collection_date\ncv-001,62,bpm,2026-11-05";
    expect(extractCsvCandidates(csv).rows[0]).toMatchObject({ observedAt: date, collectionDate: date, datePrecision: "date" });
    const workbook = zipSync({ "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row><c t="inlineStr"><is><t>label</t></is></c><c t="inlineStr"><is><t>value</t></is></c><c t="inlineStr"><is><t>unit</t></is></c><c t="inlineStr"><is><t>collection_date</t></is></c></row><row><c t="inlineStr"><is><t>cv-001</t></is></c><c><v>62</v></c><c t="inlineStr"><is><t>bpm</t></is></c><c t="inlineStr"><is><t>2026-11-05</t></is></c></row></sheetData></worksheet>') });
    expect(extractXlsxCandidates(workbook).rows[0]?.observedAt).toBe(date);
    expect(extractJsonCandidates(JSON.stringify([{ metricId: "cv-001", value: 62, unit: "bpm", collectionDate: date }])).rows[0]).toMatchObject({ observedAt: date, datePrecision: "date" });
    const timestamp = "2026-11-05T08:17:23+02:00";
    expect(extractJsonCandidates(JSON.stringify([{ metricId: "cv-001", value: 62, unit: "bpm", observedAt: timestamp, collectionDate: date }])).rows[0]).toMatchObject({ observedAt: timestamp, collectionDate: date });
    expect(extractCsvCandidates(`label,value,unit,collection_date,observed_at\ncv-001,62,bpm,${date},${timestamp}`).rows[0]).toMatchObject({ observedAt: timestamp, collectionDate: date });
    expect(extractFhirCandidates({ resourceType: "Observation", code: { text: "Heart rate" }, valueQuantity: { value: 62, unit: "bpm" }, effectiveDateTime: date, issued: timestamp }).rows[0]).toMatchObject({ observedAt: date, datePrecision: "date" });
  });
  test("selection consults current catalog; absent time alone is never an exclusion", () => {
    const rows = [
      { label: "cv-001", unit: "bpm", value: "62" },
      { label: "cv-001", unit: "BPM", value: "62" },
      { label: "BSC-002", unit: "%", value: "76" },
      { label: "25(OH) Vitamin D", unit: "ng/mL ή nmol/L", value: "9.31" },
    ].map((r, i) => ({ ...r, key: String(i), observedAt: date, datePrecision: "date" as const, classification: classifyWithGovernedExtensions(r).classification, selected: false }));
    expect(setIntakeReviewSelection(rows, true).rows.map((r) => r.selected)).toEqual([true, false, false, false]);
    expect(isIntakeRowEligible({ ...rows[0], key: "flagged", label: "cv-001", unit: "bpm", value: "62", observedAt: date, datePrecision: "date", sourceValidation: "unvalidated", classification: classifyWithGovernedExtensions({ label: "cv-001", unit: "bpm" }).classification, selected: false })).toBe(false);
    expect(isIntakeRowEligible({ ...rows[0], key: "bad", label: "cv-001", unit: "bpm", value: "NaN", observedAt: date, datePrecision: "date", classification: classifyWithGovernedExtensions({ label: "cv-001", unit: "bpm" }).classification, selected: false })).toBe(false);
  });
  test("date duplicates are scope/unit/precision aware and never collide with midnight instants", () => {
    const o = dated({ value: "62" });
    expect(findUnifiedDuplicates([o], o)).toHaveLength(1);
    expect(findUnifiedDuplicates([o], { ...o, observedAt: "2026-11-05T00:00:00Z", datePrecision: "instant" })).toHaveLength(0);
    expect(findUnifiedDuplicates([o], { ...o, crewMemberId: "crew-other" })).toHaveLength(0);
    expect(findUnifiedDuplicates([o], { ...o, originalUnit: "ms" })).toHaveLength(0);
    expect(observationDateKey(o)).toBe("date:2026-11-05");
    expect(batchDuplicateKeys([{ key: "a", metricId: o.metricId, value: "62", observedAt: date, datePrecision: "date" }, { key: "b", metricId: o.metricId, value: "62", observedAt: date, datePrecision: "date" }, { key: "c", metricId: o.metricId, value: "62", observedAt: "2026-11-05T00:00:00Z" }])).toEqual(["b"]);
  });
});

describe("P36.8.1 append-only history, domain reports and exports", () => {
  test("date-only local imports are idempotent, transport uses recorded time and corrections preserve the date", async () => {
    const store = new InMemoryOfflineMissionStore();
    const original = dated();
    const event = { eventId: `${original.id}:entry`, eventKind: "entry" as const, observation: original };
    expect(await importUnifiedObservationEvent(event, store)).toBe("inserted");
    expect(await importUnifiedObservationEvent(event, store)).toBe("duplicate");
    expect((await store.get(`unified-observation:${event.eventId}`))?.eventTimestamp).toBe(original.recordedAt);
    expect((await store.listQueueItems()).length).toBe(0);
    const plan = planObservationCorrection(original, [original], { metricId: "cv-001", value: "70", unit: "bpm", observedAt: date, datePrecision: "date", reason: "Source transcription corrected", confirmed: true }, gmCtx({ decidedAt: "2026-11-06T20:00:00Z" }));
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.corrected.observedAt).toBe(date);
    expect(plan.corrected.source).toEqual(original.source);
    await executeCorrection(plan, { save: async (o) => { await importUnifiedObservationEvent({ eventId: `${o.id}:${o.status === "erroneous" ? "status" : "entry"}`, eventKind: o.status === "erroneous" ? "status" : "entry", observation: o }, store); } });
    expect(await store.countRecords()).toBe(3);
    expect(reportFor(await listUnifiedObservations(V9_SCOPE.missionId, V9_SCOPE.crewMemberId, store)).rows.map((r) => r.value)).toEqual(["70"]);
  });
  test("all four domains read calendar precision without rewriting stored envelopes", () => {
    const history = [dated(), dated({ domain: "bone", metricId: "bone-001", originalUnit: "ng/mL" }), dated({ domain: "immune", metricId: "IMM-001", originalUnit: "10^9/L" }), dated({ domain: "behavioral", metricId: "BSC-002", originalUnit: "%" })];
    const before = JSON.stringify(history);
    const report = reportFor(history);
    expect(report.rows).toHaveLength(4);
    expect(report.rows.every((r) => r.observedAt === date && r.datePrecision === "date")).toBe(true);
    expect(report.summaries.filter((s) => s.included > 0).map((s) => s.badge).sort()).toEqual(["behavioral", "bone", "cardiovascular", "immune"]);
    expect(JSON.stringify(history)).toBe(before);
    expect(reportFor([dated({ crewMemberId: "other" })]).rows).toHaveLength(0);
  });
  test("calendar filters include dates; intraday bounds never assume a collection instant", () => {
    const input = { domainEntries: {}, unifiedObservations: [dated()], deviceRecords: [] };
    expect(buildUnifiedHealthReport(input, V9_SCOPE, { from: date, to: date }).rows).toHaveLength(1);
    expect(buildUnifiedHealthReport(input, V9_SCOPE, { from: "2026-11-05T12:00:00Z" }).rows).toHaveLength(0);
  });
  test("mixed precision and repeated same-date readings are not physiological first/last comparisons", () => {
    expect(buildScientificFindings(reportFor([dated({ value: "62" }), dated({ value: "70" })])).metrics[0]?.delta).toBeNull();
    expect(buildScientificFindings(reportFor([dated({ value: "62" }), obs({ observedAt: "2026-11-06T08:00:00Z", value: "70" })])).metrics[0]?.delta).toBeNull();
    expect(buildScientificFindings(reportFor([dated({ value: "62" }), dated({ observedAt: "2026-11-06", value: "70" })])).metrics[0]?.delta).toBe(8);
  });
  test("canonical projection and calendar chart/filter retain dates without inferred instants", () => {
    const o = dated();
    const projected = projectCanonicalObservations([{ id: o.id, missionId: o.missionId, crewMemberId: o.crewMemberId, kind: "observation", eventTimestamp: o.recordedAt, sourceId: "unified-intake", classification: "medical_sensitive", location: "local", payload: { observation: o } }], V9_SCOPE);
    expect(projected.observations[0]).toMatchObject({ observedAt: date, datePrecision: "date" });
    const first = projected.observations[0];
    if (!first) throw new Error("Projection missing");
    const samples = [first, { ...first, id: "other", observedAt: "2026-11-06" }];
    expect(chartGeometry(samples)?.points.map((p) => p.item.observedAt)).toEqual([date, "2026-11-06"]);
    expect(filterTrendObservations(samples, "7", "all")).toHaveLength(2);
  });
  test("searchable multipage PDF and TXT preserve exact dates, evidence and uncertainty", async () => {
    const history = Array.from({ length: 90 }, (_, i) => dated({ id: `date-observation-${i}`, value: String(60 + i), observedAt: `2026-11-${String(1 + i % 6).padStart(2, "0")}` }));
    const report = reportFor(history);
    const input = { unified: report, findings: buildScientificFindings(report), summary: null, history: null, attestations: [], identity: { missionName: "Synthetic date test", crewDisplayName: "Synthetic crew" }, title: "MITOCHONDRIA_date_test" };
    const text = unifiedReportPlainText(report);
    expect(text).toContain("2026-11-05 (date only; time/timezone not supplied)");
    expect(text).not.toContain("2026-11-05T00:00:00");
    const model = JSON.stringify(buildReportDocument(input));
    for (const o of history) expect(model).toContain(o.id);
    const pdf = await createTextReportPdf(input, { fonts: null });
    expect(pdf.pages).toBeGreaterThan(6);
    expect((await pdf.blob.text()).slice(0, 5)).toBe("%PDF-");
    expect(await pdf.blob.text()).not.toContain("/Subtype /Image");
  });
});