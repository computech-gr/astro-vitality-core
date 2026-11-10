/**
 * P61 — automated multi-date bulk examination import. Synthetic reconstructed fixtures only
 * (tests/support/p61-fixtures.ts); the owner's acceptance dataset was not attached.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DOCUMENT_TABLE_RULES_VERSION, documentLinesFromText } from "../../src/domain/health-intelligence/document-table-reconstruction";
import { rowExtractionEvidence } from "../../src/domain/health-intelligence/document-intake-review";
import { classifyWithGovernedExtensions } from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { domainForMetric } from "../../src/domain/health-domains/document-domain-projection";
import { extractCsvCandidates, csvCells } from "../../src/domain/health-intelligence/universal-intake-parser";
import { setIntakeReviewSelection } from "../../src/domain/health-intelligence/intake-review-selection";
import { listUnifiedObservations, saveUnifiedObservation } from "../../src/domain/health-intelligence/observation-store";
import { InMemoryOfflineMissionStore } from "../../src/infrastructure/offline/store";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import {
  buildReviewedObservation,
  classifyDateHeading,
  evaluateBulkImport,
  extractWideGridCandidates,
  parseDateText,
  reconcileBulkImport,
  reconstructMultiDateDocument,
  resolveDateGroup,
  reviewDateFields,
  rowDateEvidence,
  type ExamDateEvidence,
  type P61ReviewRow,
} from "../../src/domain/health-intelligence/p61-bulk-import";
import { P61_BIOMARKERS, P61_DATES, p61ColumnPdf, p61LongCsv, p61SectionPdf, p61Value, p61WideCsv, type P61Doc } from "../support/p61-fixtures";
import { premiumFrom, V9_SCOPE } from "../support/p59-fixtures";

const SCOPE = { ...V9_SCOPE };
type Row = P61ReviewRow & { sourceKind: "pdf_text" | "csv"; sourceLabel: string; documentName: string; excerpt: string; importedAt: string };
let n = 0;
const mk = (p: Omit<Row, "key" | "selected" | "classification" | "provenance" | "missionId" | "sourceKind" | "sourceLabel" | "documentName" | "importedAt"> & Partial<Row>): Row => {
  const base = { provenance: "synthetic" as const, missionId: SCOPE.missionId, sourceKind: "pdf_text" as const, sourceLabel: "Document: alex-series.pdf", documentName: "alex-series.pdf", importedAt: "2026-11-10T17:40:00.000Z", ...p };
  return { ...base, key: `r${++n}`, selected: false, classification: classifyWithGovernedExtensions(base).classification } as Row;
};
const docRows = (doc: P61Doc, sha = "a".repeat(64)) => {
  const m = reconstructMultiDateDocument(documentLinesFromText(doc.text, doc.pages));
  const rows = m.reconstruction.observations.map((o, i) =>
    mk({ label: o.label, value: o.value || o.rawValue, unit: o.unit, ...reviewDateFields(m.dates[i]!), examDate: m.dates[i]!, extraction: rowExtractionEvidence(o, DOCUMENT_TABLE_RULES_VERSION), documentSha256: sha, excerpt: o.excerpt }),
  );
  return { m, rows };
};
const csvRows = (text: string, sha = "c".repeat(64)) => {
  const wide = extractWideGridCandidates(csvCells(text));
  if (wide) return wide.rows.map((c) => mk({ label: c.label, value: c.value, unit: c.unit, observedAt: c.observedAt, ...(c.datePrecision ? { datePrecision: c.datePrecision } : {}), examDate: c.examDate, documentSha256: sha, sourceKind: "csv", sourceLabel: "CSV: alex.csv", excerpt: c.excerpt }));
  return extractCsvCandidates(text, 1000, { keepUnparsedDates: true }).rows.map((c) => {
    const examDate = rowDateEvidence(c);
    return mk({ label: c.label, value: c.value, unit: c.unit, ...(c.observedAt ? { observedAt: c.observedAt, ...(c.datePrecision ? { datePrecision: c.datePrecision } : {}) } : reviewDateFields(examDate)), examDate, documentSha256: sha, sourceKind: "csv", sourceLabel: "CSV: alex.csv", excerpt: c.excerpt });
  });
};
const perDate = (rows: readonly { observedAt: string }[]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.observedAt, (m.get(r.observedAt) ?? 0) + 1);
  return m;
};
const expectAcceptanceShape = (rows: readonly Row[]) => {
  expect(rows.length).toBe(304);
  const series = new Set(rows.map((r) => (r.classification.status === "matched" ? r.classification.metricId : r.label)));
  expect(series.size).toBe(38);
  const dates = perDate(rows);
  expect([...dates.keys()].sort()).toEqual([...P61_DATES]);
  for (const d of P61_DATES) expect(dates.get(d)).toBe(38);
  // every value is the fixture value for its own date (no date substitution)
  for (const r of rows) {
    const b = P61_BIOMARKERS.findIndex((x) => x[1] === r.label);
    expect(r.value).toBe(p61Value(b, P61_DATES.indexOf(r.observedAt as (typeof P61_DATES)[number])));
  }
};

describe("P61 — multi-date PDF section parsing", () => {
  const { m, rows } = docRows(p61SectionPdf());
  it("304 observations, 38 series, 8 examination dates, 38 per date, all inherited from their own heading", () => {
    expectAcceptanceShape(rows);
    expect(m.dates.every((d) => d.status === "resolved" && d.source === "section")).toBe(true);
    expect(m.distinctDates).toEqual([...P61_DATES]);
    expect(m.multipleDates).toBe(true);
    expect(m.groups.filter((g) => g.kind === "heading").map((g) => g.rows)).toEqual(Array(8).fill(38));
  });
  it("the report date is never an examination date, and row numbers restarting per examination are not errors", () => {
    expect(m.ignoredDates.map((d) => d.text)).toEqual(["Report generated: 2026-11-09"]);
    expect(rows.some((r) => r.observedAt === "2026-11-09")).toBe(false);
    expect(m.reconstruction.issues).toEqual([]);
    expect(m.reconstruction.observations.filter((o) => o.repeat).length).toBe(0);
  });
  it("repeated identical readings on different pages are kept (not mistaken for running headers)", () => {
    const same = p61SectionPdf({ dates: ["2026-11-01", "2026-11-02"], biomarkers: 3 });
    const fixed = { ...same, text: same.text.replace(/\| [\d.]+ \|/g, "| 50 |") };
    expect(docRows(fixed).rows.length).toBe(6);
  });
  it("all 304 are validated for bulk confirmation and reconcile completely", () => {
    const { statuses, validatedKeys } = evaluateBulkImport(rows, [], SCOPE);
    expect(validatedKeys.length).toBe(304);
    const r = reconcileBulkImport(rows, statuses);
    expect(r).toMatchObject({ observations: 304, validated: 304, unresolved: 0, duplicates: 0, rejected: 0, series: 38, examinationDates: 8 });
    expect(r.complete).toBe(false); // nothing is accepted until the reviewer confirms
  });
});

describe("P61 — multi-date table-column parsing", () => {
  const { m, rows } = docRows(p61ColumnPdf());
  it("one observation per date column, repeated header on page 2", () => {
    expectAcceptanceShape(rows);
    expect(m.dateColumnTables).toBe(2);
    expect(m.dates.every((d) => d.status === "resolved" && d.source === "column")).toBe(true);
    expect(evaluateBulkImport(rows, [], SCOPE).validatedKeys.length).toBe(304);
  });
  it("an ambiguous date column header is held until the reviewer chooses, then only that column is filled", () => {
    const doc = p61ColumnPdf();
    const amb = { ...doc, text: doc.text.replaceAll("2026-11-03", "03/11/2026") };
    const { rows: held } = docRows(amb, "b".repeat(64));
    const ambiguous = held.filter((r) => r.examDate?.status === "ambiguous");
    expect(ambiguous.length).toBe(38);
    expect(ambiguous.every((r) => r.observedAt === "")).toBe(true);
    expect(ambiguous[0]!.examDate!.options.map((o) => o.iso)).toEqual(["2026-11-03", "2026-03-11"]);
    const { statuses } = evaluateBulkImport(held, [], SCOPE);
    expect(reconcileBulkImport(held, statuses).exceptions).toEqual([{ code: "date_ambiguous", label: "Examination date ambiguous", rows: 38 }]);
    const resolved = resolveDateGroup(held, "b".repeat(64), ambiguous[0]!.examDate!.groupKey!, "2026-11-03");
    expect(resolved.applied).toBe(38);
    expect(resolveDateGroup(held, "b".repeat(64), ambiguous[0]!.examDate!.groupKey!, "2026-12-25").applied).toBe(0);
    expectAcceptanceShape(resolved.rows);
  });
});

describe("P61 — CSV row-level timestamps", () => {
  it("long CSV: each row keeps its own examination date (not a collection date)", () => {
    const rows = csvRows(p61LongCsv());
    expectAcceptanceShape(rows);
    expect(rows.every((r) => r.examDate?.source === "row" && r.collectionDate === undefined)).toBe(true);
    expect(evaluateBulkImport(rows, [], SCOPE).validatedKeys.length).toBe(304);
  });
  it("wide CSV: one row per date column", () => {
    const rows = csvRows(p61WideCsv());
    expectAcceptanceShape(rows);
    expect(rows.every((r) => r.examDate?.source === "column")).toBe(true);
  });
  it("zoned timestamps are kept as instants; unparseable dates are kept for review instead of dropped", () => {
    const rows = csvRows("examination_date,biomarker,value,unit\n2026-11-05T08:17:23+02:00,Sodium,140,mmol/L\n05/11/2026,Sodium,141,mmol/L\n2026-02-30,Sodium,142,mmol/L\n,Sodium,143,mmol/L\n13/11/2026,Sodium,144,mmol/L");
    expect(rows.map((r) => [r.observedAt, r.datePrecision ?? null, r.examDate?.status])).toEqual([
      ["2026-11-05T08:17:23+02:00", "instant", "resolved"],
      ["", null, "ambiguous"],
      ["", null, "invalid"],
      ["", null, "missing"],
      ["2026-11-13", "date", "resolved"],
    ]);
    // default behaviour of the shared parser is unchanged (unparseable dates still skipped)
    expect(extractCsvCandidates("label,value,unit,date\nSodium,140,mmol/L,05/11/2026").rows.length).toBe(0);
  });
});

describe("P61 — domain mapping", () => {
  it("every domain comes from the canonical catalog mapping, never from the section heading text", () => {
    const doc = p61SectionPdf({ dates: ["2026-11-01"] });
    const misleading = { ...doc, text: doc.text.replace("CARDIOVASCULAR", "BONE HEALTH") };
    const { rows } = docRows(misleading);
    expect(rows.length).toBe(38);
    for (const r of rows) {
      expect(r.classification.status).toBe("matched");
      if (r.classification.status === "matched") expect(r.classification.domain).toBe(domainForMetric(r.classification.metricId)!);
    }
    const expected = new Map(P61_BIOMARKERS.map(([id, label]) => [label, id]));
    expect(rows.every((r) => r.classification.status === "matched" && r.classification.metricId === expected.get(r.label))).toBe(true);
  });
});

describe("P61 — ambiguous dates are never silently resolved", () => {
  it("heading readings", () => {
    expect(parseDateText("2026-11-04")).toMatchObject({ status: "resolved", value: "2026-11-04" });
    expect(parseDateText("4 November 2026")).toMatchObject({ status: "resolved", value: "2026-11-04" });
    expect(parseDateText("Nov 4, 2026")).toMatchObject({ status: "resolved", value: "2026-11-04" });
    expect(parseDateText("04/11/2026")).toMatchObject({ status: "ambiguous" });
    expect(parseDateText("25/11/2026")).toMatchObject({ status: "resolved", value: "2026-11-25" });
    expect(parseDateText("2026-02-30")).toMatchObject({ status: "invalid" });
    expect(parseDateText("04 Nov")).toMatchObject({ status: "invalid" });
    expect(classifyDateHeading("Examination 3 — 2026-11-03", ["Examination 3 — 2026-11-03"])).toMatchObject({ kind: "examination" });
    expect(classifyDateHeading("Sample collected: 2026-11-03", ["Sample collected: 2026-11-03"])).toMatchObject({ kind: "collection" });
    expect(classifyDateHeading("Date of birth: 1990-01-01", ["Date of birth: 1990-01-01"])).toMatchObject({ kind: "excluded" });
    expect(classifyDateHeading("Sodium | 140 | mmol/L | 2026-11-03", ["Sodium", "140", "mmol/L", "2026-11-03"])).toBeNull();
    // a birth date beside the examination date is ignored, not mixed in
    expect(classifyDateHeading("DOB: 1990-01-01 | Exam date: 2026-11-07", ["DOB: 1990-01-01", "Exam date: 2026-11-07"])).toMatchObject({ kind: "examination", parse: { status: "resolved", value: "2026-11-07" } });
  });
  it("ambiguous heading, two dates on a heading, rows before the first heading and row-vs-heading conflicts stay unresolved", () => {
    const base = p61SectionPdf({ dates: ["2026-11-01", "2026-11-02", "2026-11-03"], biomarkers: 2 });
    const lines = base.text.split("\n");
    const iSecond = lines.indexOf("Examination 2 — 2026-11-02");
    lines[iSecond] = "Examination 2 — 02/11/2026";
    const iThird = lines.indexOf("Examination 3 — 2026-11-03");
    lines[iThird] = "Examination 3 — 2026-11-03 / 2026-11-04";
    const { rows, m } = docRows({ text: lines.join("\n"), pages: base.pages });
    expect(rows.map((r) => r.examDate!.status)).toEqual(["resolved", "resolved", "ambiguous", "ambiguous", "ambiguous", "ambiguous"]);
    expect(rows.filter((r) => r.observedAt).map((r) => r.observedAt)).toEqual(["2026-11-01", "2026-11-01"]);
    expect(m.multipleDates).toBe(true);

    const early = docRows({ text: ["No. | Measurement | Result | Unit", "1 | Sodium | 140 | mmol/L", "Examination 1 — 2026-11-01", "No. | Measurement | Result | Unit", "1 | Sodium | 141 | mmol/L"].join("\n"), pages: [1, 1, 1, 1, 1] });
    expect(early.rows.map((r) => r.examDate!.status)).toEqual(["missing", "resolved"]);

    const conflict = docRows({ text: ["Examination 1 — 2026-11-01", "Measurement | Result | Unit | Date", "Sodium | 140 | mmol/L | 2026-11-05", "Potassium | 4.1 | mmol/L | 2026-11-01"].join("\n"), pages: [1, 1, 1, 1] });
    expect(conflict.rows.map((r) => [r.examDate!.status, r.observedAt])).toEqual([["conflict", ""], ["resolved", "2026-11-01"]]);
    const st = evaluateBulkImport(conflict.rows, [], SCOPE).statuses;
    expect(st.get(conflict.rows[0]!.key)).toMatchObject({ kind: "exception", code: "date_conflict" });
  });
  it("a single stated examination date covers its document; it is never offered across several dates", () => {
    const one = docRows({ text: ["Patient: Alex Morgan | Examination date: 2026-11-07", "No. | Measurement | Result | Unit", "1 | Sodium | 140 | mmol/L", "2 | Potassium | 4.1 | mmol/L"].join("\n"), pages: [1, 1, 1, 1] });
    expect(one.rows.map((r) => r.observedAt)).toEqual(["2026-11-07", "2026-11-07"]);
    expect(one.m.multipleDates).toBe(false);
    expect(docRows(p61SectionPdf()).m.multipleDates).toBe(true);
  });
});

describe("P61 — unknown biomarkers reach the exception queue", () => {
  it("never reported as complete while unresolved rows remain", () => {
    const doc = p61SectionPdf({ dates: ["2026-11-01", "2026-11-02"], biomarkers: 3 });
    const text = doc.text.replace(/\n(Page 1 of 2)/, "\n4 | G-CSF | 12.5 | pg/mL\n5 | Sodium | 139 | mEq/L\n$1");
    const { rows } = docRows({ text, pages: [...doc.pages.slice(0, doc.pages.indexOf(2)), 1, 1, ...doc.pages.slice(doc.pages.indexOf(2))] });
    const { statuses, validatedKeys } = evaluateBulkImport(rows, [], SCOPE);
    const r = reconcileBulkImport(rows, statuses);
    expect(validatedKeys.length).toBe(6);
    expect(r.unresolved).toBe(2);
    expect(r.exceptions.map((e) => [e.code, e.rows]).sort()).toEqual([["unit_review", 1], ["unknown_biomarker", 1]]);
    expect(r.summary).toMatch(/^Not complete: 2 of 8 observation\(s\) are unresolved/);
  });
});

const toObservations = (rows: readonly Row[], recordedAt = "2026-11-10T18:00:00.000Z") =>
  rows.map((r, i) => buildReviewedObservation(r, { id: `p61-${String(i).padStart(6, "0")}-${r.key}`, recordedAt, scope: SCOPE, duplicateWarningAcknowledged: false }));

describe("P61 — duplicate prevention (deterministic, source-aware, append-only)", () => {
  it("re-importing the same document finds every reading already stored; nothing is saved twice", () => {
    const first = docRows(p61SectionPdf());
    const stored = toObservations(first.rows);
    const again = docRows(p61SectionPdf());
    const { statuses, validatedKeys } = evaluateBulkImport(again.rows, stored, SCOPE);
    expect(validatedKeys.length).toBe(0);
    const r = reconcileBulkImport(again.rows, statuses);
    expect(r).toMatchObject({ duplicates: 304, validated: 0, unresolved: 0 });
  });
  it("the same reading from another document is a possible duplicate needing individual confirmation", () => {
    const stored = toObservations(docRows(p61SectionPdf({ dates: ["2026-11-01"], biomarkers: 2 })).rows);
    const other = csvRows("examination_date,biomarker,value,unit\n2026-11-01,HR," + p61Value(0, 0) + ",bpm\n2026-11-02,HR,99,bpm");
    const st = evaluateBulkImport(other, stored, SCOPE).statuses;
    expect(st.get(other[0]!.key)).toMatchObject({ kind: "exception", code: "possible_duplicate" });
    expect(st.get(other[1]!.key)).toMatchObject({ kind: "validated" });
  });
  it("other missions, crews or provenance never count as duplicates", () => {
    const stored = toObservations(docRows(p61SectionPdf({ dates: ["2026-11-01"], biomarkers: 2 })).rows);
    const again = docRows(p61SectionPdf({ dates: ["2026-11-01"], biomarkers: 2 })).rows;
    expect(evaluateBulkImport(again, stored, { ...SCOPE, crewMemberId: "crew-b" }).validatedKeys.length).toBe(2);
    expect(evaluateBulkImport(again, stored, { ...SCOPE, provenance: "real" }).validatedKeys.length).toBe(2);
  });
});

describe("P61 — bulk confirmation", () => {
  it("covers exactly the validated rows; exceptions, duplicates and rejected rows are excluded; selection never confirms", () => {
    const { rows } = docRows(p61SectionPdf({ dates: ["2026-11-01", "2026-11-02"], biomarkers: 4 }));
    rows[0] = { ...rows[0]!, rejected: true };
    rows[1] = { ...rows[1]!, observedAt: "", examDate: { ...rows[1]!.examDate!, status: "missing", value: null } as ExamDateEvidence };
    const { statuses, validatedKeys } = evaluateBulkImport(rows, [], SCOPE);
    expect(validatedKeys.length).toBe(6);
    expect(statuses.get(rows[0]!.key)!.kind).toBe("rejected");
    expect(statuses.get(rows[1]!.key)).toMatchObject({ kind: "exception", code: "date_missing" });
    const sel = setIntakeReviewSelection(rows, true);
    expect(sel.reviewerConfirmed).toBe(false);
    const observations = toObservations(rows.filter((r) => validatedKeys.includes(r.key)));
    expect(observations.length).toBe(6);
    expect(observations.every((o) => o.quality.reviewerConfirmed && o.reviewState === "accepted" && o.datePrecision === "date")).toBe(true);
  });
  it("examination date, import time and record creation stay distinct in the envelope", () => {
    const { rows } = docRows(p61SectionPdf({ dates: ["2026-11-03"], biomarkers: 1 }));
    const [o] = toObservations(rows, "2026-11-10T18:00:00.000Z");
    expect(o!.observedAt).toBe("2026-11-03");
    expect(o!.recordedAt).toBe("2026-11-10T18:00:00.000Z");
    expect(o!.collectionDate).toBeUndefined();
    expect(o!.source.label).toContain('examination date heading "Examination 1 — 2026-11-03"');
    expect(o!.source.label).toContain("imported 2026-11-10T17:40:00.000Z");
    expect(o!.source.label.length).toBeLessThanOrEqual(300);
  });
});

describe("P61 — offline encrypted append-only persistence", () => {
  const g = globalThis as { window?: unknown };
  const had = "window" in g;
  const previous = g.window;
  beforeAll(() => {
    g.window = g.window ?? {};
  });
  afterAll(() => {
    if (had) g.window = previous;
    else delete g.window;
  });
  it("304 observations are stored encrypted, scoped, date-only and never queued for plaintext upload", async () => {
    const store = new InMemoryOfflineMissionStore();
    const observations = toObservations(docRows(p61SectionPdf()).rows);
    for (const o of observations) await saveUnifiedObservation(o, store);
    const back = await listUnifiedObservations(SCOPE.missionId, SCOPE.crewMemberId, store);
    expect(back.length).toBe(304);
    expect(back.every((o) => o.datePrecision === "date" && o.schema === "mitochondria.unified-observation.v2")).toBe(true);
    expect(await listUnifiedObservations(SCOPE.missionId, "crew-b", store)).toEqual([]);
    const cipher = store.encryptedSnapshot().map((r) => new TextDecoder().decode(Uint8Array.from(atob(r.ciphertext), (c) => c.charCodeAt(0)))).join("");
    expect(cipher).not.toContain("Sodium");
    expect(cipher).not.toContain("2026-11-03");
    expect((await store.listQueueItems()).length).toBe(0);
    // append-only: re-saving the same event id with different content is refused, never overwritten
    await expect(saveUnifiedObservation({ ...observations[0]!, value: "999" }, store)).rejects.toThrow();
    expect((await listUnifiedObservations(SCOPE.missionId, SCOPE.crewMemberId, store)).find((o) => o.id === observations[0]!.id)!.value).toBe(observations[0]!.value);
  });
});

describe("P61 — P60 report integration", () => {
  it("the report receives the original examination dates and charts them in order", () => {
    const observations: UnifiedObservation[] = toObservations(docRows(p61SectionPdf()).rows);
    const report = premiumFrom(observations);
    expect(report.census.observations).toBe(304);
    expect(report.census.dates).toEqual([...P61_DATES]);
    const sodium = report.charts.find((c) => c.base.metricId === "cv-070")!;
    expect(sodium.base.points.map((p) => p.day)).toEqual([...P61_DATES]);
    expect(sodium.base.points.map((p) => p.valueText)).toEqual(P61_DATES.map((_, d) => p61Value(27, d)));
    for (const c of report.charts) {
      const days = c.base.points.map((p) => p.day);
      expect([...days].sort()).toEqual(days);
    }
  });
});
