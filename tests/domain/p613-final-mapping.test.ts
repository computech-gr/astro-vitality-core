/**
 * P61.3 — final scientific mapping and report stabilization (synthetic data only; not clinical,
 * scientific or human acceptance). Covers the closed unit-notation rules, the display-only mapping
 * decision register, the synthetic-only application path and the report wording/layout rules.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import raw from "../../data/scientific/p613-mapping-decision-register.v1.json";
import { unitNotationMatch, UNIT_NOTATION_RULES } from "../../src/domain/health-intelligence/p613-unit-notation";
import { MAPPING_DECISIONS, mappingDecisionFor, validateMappingDecisionRegister } from "../../src/domain/health-intelligence/p613-mapping-decision-register";
import { classifyWithGovernedExtensions } from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { loadInstalledDemoCatalogs, resetSyntheticDemoCatalogsForTests, SYNTHETIC_DEMO_STORAGE_KEY } from "../../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { extractCsvCandidates } from "../../src/domain/health-intelligence/universal-intake-parser";
import { buildReviewedObservation, evaluateBulkImport, rowDateEvidence, storedUnitOf, type P61ReviewRow } from "../../src/domain/health-intelligence/p61-bulk-import";
import { validateUnifiedObservation, type UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { compactExamDates, runningHeaderLayout } from "../../src/domain/health-intelligence/p59-premium-pdf";
import { repoPath } from "../documents/p42-pdf-helpers";
import { premiumFrom, MITO_DEMO_MISSION_ID } from "../support/p59-fixtures";

const CSV = repoPath("fixtures", "synthetic", "p61", "Alex_Morgan_304_Observations.csv");
const SNAPSHOTS = repoPath("tests", "fixtures", "p61-mito-demo-signed-snapshots.v372.json");
const SCOPE = { missionId: MITO_DEMO_MISSION_ID, crewMemberId: "crew-alex", provenance: "synthetic" as const };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const storage = new Map<string, string>([[SYNTHETIC_DEMO_STORAGE_KEY, readFileSync(SNAPSHOTS, "utf8")]]);
beforeAll(async () => {
  await loadInstalledDemoCatalogs({ storage: { get: (k) => storage.get(k) ?? null, set: (k, v) => void storage.set(k, v) } });
});
afterAll(() => resetSyntheticDemoCatalogsForTests());

describe("P61.3 unit notation — closed typographic rules, never conversion", () => {
  it("lists exactly three rules", () => expect(UNIT_NOTATION_RULES.map((r) => r.id)).toEqual(["UN-1", "UN-2", "UN-3"]));
  it("deg C is °C (UN-1)", () => expect(unitNotationMatch("deg C", "°C")?.ruleIds).toEqual(["UN-1"]));
  it("10^9/L is 10⁹/L (UN-2) and µ is μ (UN-3)", () => {
    expect(unitNotationMatch("10^9/L", "10⁹/L")?.ruleIds).toEqual(["UN-2"]);
    expect(unitNotationMatch("µmol/L", "μmol/L")?.ruleIds).toEqual(["UN-3"]);
  });
  it("different scale, different unit or extra digits are never equivalent", () => {
    expect(unitNotationMatch("10^9/L", "10^3/μL")).toBeNull();
    expect(unitNotationMatch("mg/dL", "mg/L")).toBeNull();
    expect(unitNotationMatch("mmol/L", "mol/L")).toBeNull();
    expect(unitNotationMatch("110^3/L", "110³/L")).toBeNull();
    expect(unitNotationMatch("deg F", "°C")).toBeNull();
  });
  it("identical units need no rule", () => expect(unitNotationMatch("°C", "°C")).toBeNull());
});

describe("P61.3 mapping decision register — display only, never an approval", () => {
  it("is valid and lists the 8 unresolved names plus the 5 provisional aliases", () => {
    expect(MAPPING_DECISIONS?.length).toBe(13);
    expect(MAPPING_DECISIONS!.every((d) => d.approval.approvedBy === null && d.approval.approvedAt === null)).toBe(true);
  });
  it("applies only Body temperature (notation) and the five P61.2 aliases", () => {
    expect(MAPPING_DECISIONS!.filter((d) => d.applied).map((d) => d.label).sort()).toEqual(
      ["25-OH vitamin D", "Body temperature", "Diastolic BP", "Glucose, fasting", "Systolic BP", "White blood cells"],
    );
  });
  it("any entry claiming an approval disables the whole register", () => {
    const t = clone(raw) as { decisions: { approval: { approvedBy: unknown } }[] };
    t.decisions[0]!.approval.approvedBy = "someone";
    expect(validateMappingDecisionRegister(t)).toBeNull();
  });
  it("an unresolved category can never be marked applied", () => {
    const t = clone(raw) as { decisions: { id: string; applied: boolean }[] };
    t.decisions.find((d) => d.id === "P613-M01")!.applied = true;
    expect(validateMappingDecisionRegister(t)).toBeNull();
  });
  it("looks up by exact reported unit only", () => {
    expect(mappingDecisionFor("Platelets", "10^9/L")?.id).toBe("P613-M05");
    expect(mappingDecisionFor("Platelets", "10^3/μL")).toBeNull();
  });
});

const row = (label: string, unit: string, provenance: "synthetic" | "real") => {
  const base = { label, value: "38.8", unit, provenance, missionId: SCOPE.missionId, observedAt: "2026-11-12", datePrecision: "date" as const };
  return classifyWithGovernedExtensions(base).classification;
};

describe("P61.3 application path — synthetic demo only", () => {
  it("Body temperature in deg C matches the demo °C entry for synthetic data, keeping the reported unit", () => {
    const c = row("Body temperature", "deg C", "synthetic");
    expect(c.status).toBe("matched");
    if (c.status !== "matched") return;
    expect(c.metricId).toBe("demo:ubt-323050f4");
    expect(c.originalUnit).toBe("deg C");
    expect(c.unitNotation).toEqual({ reportedUnit: "deg C", catalogUnit: "°C", ruleIds: ["UN-1"] });
  });
  it("never applies to real data", () => expect(row("Body temperature", "deg C", "real").status).not.toBe("matched"));
  it("the seven unresolved names stay unmatched", () => {
    for (const [l, u] of [["Bicarbonate", "mmol/L"], ["Chloride", "mmol/L"], ["Urea nitrogen (BUN)", "mg/dL"], ["Platelets", "10^9/L"], ["Creatinine", "mg/dL"], ["Sleep duration", "h"], ["HRV SDNN", "ms"]] as const)
      expect(row(l, u, "synthetic").status).not.toBe("matched");
  });
  it("a reported-unit notation is rejected on real data and on a non-equivalent unit", () => {
    const base = { schema: "mitochondria.unified-observation.v2", id: "p613-obs-000001", missionId: "m", crewMemberId: "c", metricId: "demo:ubt-323050f4", domain: "immune", value: "38.8", originalUnit: "°C", reportedUnit: "deg C", observedAt: "2026-11-12", datePrecision: "date", source: { kind: "csv", label: "CSV" }, provenance: "synthetic", quality: { reviewerConfirmed: true }, reviewState: "accepted", recordedAt: "2026-11-12T10:00:00.000Z" } as unknown as UnifiedObservation;
    expect(validateUnifiedObservation(base)).toBeNull();
    expect(validateUnifiedObservation({ ...base, provenance: "real" })).toMatch(/only on synthetic demo/);
    expect(validateUnifiedObservation({ ...base, reportedUnit: "deg F" })).toMatch(/listed notation/);
  });
});

type Row = P61ReviewRow & { sourceKind: "csv"; sourceLabel: string; documentName: string; excerpt: string; importedAt: string };
let n = 0;
function csvObservations() {
  const parsed = extractCsvCandidates(readFileSync(CSV, "utf8"), 1000, { keepUnparsedDates: true });
  const sha = createHash("sha256").update(readFileSync(CSV)).digest("hex");
  const rows = parsed.rows.map((c) => {
    const base = { provenance: "synthetic" as const, missionId: SCOPE.missionId, importedAt: "2026-11-10T18:00:00.000Z", label: c.label, value: c.value, unit: c.unit, observedAt: c.observedAt, ...(c.datePrecision ? { datePrecision: c.datePrecision } : {}), examDate: rowDateEvidence(c), documentSha256: sha, excerpt: c.excerpt, sourceKind: "csv", sourceLabel: "CSV: obs.csv", documentName: "obs.csv" } as Omit<Row, "key" | "selected" | "classification">;
    return { ...base, key: `r${++n}`, selected: false, classification: classifyWithGovernedExtensions(base).classification } as Row;
  });
  const keys = new Set(evaluateBulkImport(rows, [], SCOPE).validatedKeys);
  return { rows, saved: rows.filter((r) => keys.has(r.key)).map((r, i) => buildReviewedObservation(r, { id: `p613o-${String(i).padStart(6, "0")}-${r.key}`, recordedAt: "2026-11-10T18:05:00.000Z", scope: SCOPE, duplicateWarningAcknowledged: false })) };
}

describe("P61.3 owner CSV — stored unit and report", () => {
  it("temperature rows are stored under the catalog °C with the verbatim deg C kept as reportedUnit", () => {
    const { rows, saved } = csvObservations();
    const t = rows.find((r) => r.label === "Body temperature")!;
    expect(storedUnitOf(t)).toBe("°C");
    const temps = saved.filter((o) => o.metricId === "demo:ubt-323050f4");
    expect(temps.length).toBe(8);
    expect(temps.every((o) => o.originalUnit === "°C" && o.reportedUnit === "deg C" && !validateUnifiedObservation(o))).toBe(true);
    expect(temps.map((o) => o.value)).toEqual(["36.7", "37.0", "37.5", "38.8", "38.2", "37.6", "37.1", "36.8"]);
  });
  it("a pattern's HIGH priority never reads as the result's own HIGH class", () => {
    const { saved } = csvObservations();
    const r = premiumFrom(saved, { provisional: true, mappings: true, missionId: SCOPE.missionId, scope: SCOPE, range: { from: "2026-11-01", to: "2026-11-30" } });
    const assoc = r.rows.filter((x) => x.priorityAssociated);
    expect(assoc.length).toBeGreaterThan(0);
    for (const x of assoc) {
      expect(x.priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
      expect(x.displayClass).not.toBe("RED");
    }
    for (const x of r.rows) if (x.priority === "HIGH_PRIORITY_MEDICAL_REVIEW" && x.displayClass !== "RED") expect(x.priorityAssociated).toBe(true);
    // IL-6 and fibrinogen are associated with a high-priority pattern while their own class stays neutral.
    expect(r.rows.filter((x) => /IL-6|Fibrinogen/.test(x.name) && x.priorityAssociated).every((x) => x.displayClass === "NEUTRAL")).toBe(true);
  });
  it("every classified or prioritised series is charted; anything else is named as not charted", () => {
    const { saved } = csvObservations();
    const r = premiumFrom(saved, { provisional: true, mappings: true, missionId: SCOPE.missionId, scope: SCOPE, range: { from: "2026-11-01", to: "2026-11-30" } });
    const charted = new Set(r.charts.map((c) => `${c.base.metricId}|${c.base.unit}`));
    for (const x of r.rows) if (x.displayClass !== "NEUTRAL" || x.priority) expect(charted.has(`${x.metricId}|${x.unit}`)).toBe(true);
    for (const o of r.chartsOmitted) expect(r.charts.some((c) => c.base.name === o.name)).toBe(false);
  });
});

describe("P61.3 report layout helpers", () => {
  it("page 1 names every examination date", () => {
    expect(compactExamDates(["2026-11-03", "2026-11-06", "2026-11-09", "2026-11-12", "2026-11-16", "2026-11-20", "2026-11-24", "2026-11-28"])).toBe("3, 6, 9, 12, 16, 20, 24, 28 Nov 2026 (8 dates)");
    expect(compactExamDates(["2026-10-30", "2026-11-02"])).toBe("30 Oct 2026; 2 Nov 2026 (2 dates)");
    expect(compactExamDates(["2026-11-03"])).toBe("3 Nov 2026");
  });
  it("the running header prints the full crew name, however long", () => {
    const width = (t: string, size: number) => t.length * size * 0.18;
    for (const who of ["Al", "Alex Morgan — Synthetic Astronaut", "Commander Alexandra Morgan-Fitzgerald-Papadopoulou — Synthetic Astronaut (Backup Crew) of the Extended Long-Duration Mission"]) {
      const { lines } = runningHeaderLayout({ demonstrationLabel: "LITERATURE-BASED SYNTHETIC DEMONSTRATION — NOT CLINICALLY VALIDATED", header: { astronaut: who, mission: "MITO_DEMO_2026" } }, width);
      const name = lines.filter((l) => l.bold && l.tone === "muted").map((l) => l.text).join(" ");
      expect(name).toBe(who);
    }
  });
});
