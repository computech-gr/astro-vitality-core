/**
 * P59 premium-report building blocks: provisional literature mode, relationship graph,
 * executive alert selection. Pure modules; no jspdf required.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundledCriteriaRegistry, classifyWithCriteria, validateCriteriaRegistry } from "../../src/domain/health-intelligence/p57-reference-criteria";
import { PROVISIONAL_LABEL, provisionalInterpretation } from "../../src/domain/health-intelligence/p59-provisional-interpretation";
import { relationshipGraph, type SeriesFact } from "../../src/domain/health-intelligence/p59-relationship-graph";
import { selectExecutiveAlerts, type FindingSummary } from "../../src/domain/health-intelligence/p59-executive-alerts";
import { COLOR, PAGE } from "../../src/domain/health-intelligence/p59-report-tokens";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = JSON.parse(readFileSync(join(ROOT, "data/scientific/p59-provisional-literature-criteria.v1.json"), "utf8"));
const demo = (metricId: string, unit: string, value: string, extra = {}) => ({ metricId, unit, value, provenance: "synthetic" as const, mode: "synthetic-demonstration" as const, missionConditions: ["adult_crew"], ...extra });

describe("P59 provisional literature registry", () => {
  it("validates in the P57 schema with no exclusions and is never the live registry", () => {
    const v = validateCriteriaRegistry(RAW);
    expect(v.excluded).toEqual([]);
    expect(RAW.status).toBe("PROVISIONAL_LITERATURE_DEMONSTRATION_ONLY");
    expect(bundledCriteriaRegistry().criteria.some((c) => c.id.startsWith("p59-"))).toBe(false);
  });
  it("excludes D-dimer, ApoB, resting HR and HRV from colouring", () => {
    expect(RAW.excludedFromColouring.map((x: { concept: string }) => x.concept).join("|")).toMatch(/D-dimer.*Apolipoprotein B.*Resting heart rate.*HRV/);
    for (const c of RAW.criteria) expect(c.identity.catalogId ?? "").not.toMatch(/^demo:/);
  });
});

describe("P59 provisional interpretation gate", () => {
  it("is disabled for real provenance or when the mode is off", () => {
    expect(provisionalInterpretation({ ...demo("cv-071", "mmol/L", "5.8"), provenance: "real" }).status).toBe("DISABLED");
    expect(provisionalInterpretation({ ...demo("cv-071", "mmol/L", "5.8"), mode: "off" }).status).toBe("DISABLED");
  });
  it("labels results PROVISIONAL and lists unrecorded conditions (never assumed)", () => {
    const r = provisionalInterpretation(demo("cv-071", "mmol/L", "5.8"));
    expect([r.status, r.severity, r.bandLabel]).toEqual(["PROVISIONAL", "amber", "Mild hyperkalaemia (UKKA)"]);
    expect(r.label).toBe(PROVISIONAL_LABEL);
    expect(r.unmetConditions.join(" ")).toMatch(/specimen type/);
  });
  it("classifies the Alex Morgan electrolyte values provisionally", () => {
    expect(provisionalInterpretation(demo("cv-071", "mmol/L", "3.2")).bandLabel).toBe("Mild hypokalaemia (StatPearls)");
    expect(provisionalInterpretation(demo("cv-070", "mmol/L", "128")).bandLabel).toBe("Moderate hyponatraemia (biochemical, ESE)");
    expect(provisionalInterpretation(demo("cv-070", "mmol/L", "146")).bandLabel).toBe("Hypernatraemia (StatPearls)");
  });
  it("never converts units: haemoglobin in g/dL does not bind the WHO g/L criterion", () => {
    expect(provisionalInterpretation(demo("cv-075", "g/dL", "10.2")).status).toBe("NO_CRITERION");
  });
  it("a hold (HbA1c measurement-consistency) suppresses provisional colour", () => {
    expect(provisionalInterpretation(demo("cv-085", "%", "9.1", { holds: ["measurement-consistency check required"] })).status).toBe("HELD");
  });
  it("provisional output never becomes an approved classification", () => {
    const approved = classifyWithCriteria({ metricId: "cv-071", unit: "mmol/L", domain: "cardiovascular", value: "5.8", provenance: "synthetic", missionId: "m", holds: [] }, []);
    expect(approved.severity).toBe("neutral");
    expect(provisionalInterpretation(demo("cv-071", "mmol/L", "5.8")).status).not.toBe("classified");
  });
  it("demo identities bind only through curated aliases", () => {
    expect(provisionalInterpretation(demo("demo:ubt-4afd25a0", "mmol/L", "5.8")).status).toBe("NO_CRITERION");
    const withAlias = { ...RAW, demoAliases: { map: { "demo:ubt-4afd25a0": "cv-071" } } };
    expect(provisionalInterpretation(demo("demo:ubt-4afd25a0", "mmol/L", "5.8"), withAlias).status).toBe("PROVISIONAL");
  });
  it("is deterministic", () => {
    expect(provisionalInterpretation(demo("cv-087", "mg/dL", "28"))).toEqual(provisionalInterpretation(demo("cv-087", "mg/dL", "28")));
  });
});

describe("P59 relationship graph", () => {
  const f = (metricId: string, direction: SeriesFact["direction"], notable = true, interval: [string, string] | null = ["2026-11-07", "2026-11-08"]): SeriesFact => ({ metricId, direction, notable, interval });
  it("draws only edges whose nodes are present; established edges solid, co-occurrence dashed", () => {
    const g = relationshipGraph([f("cv-092", "up"), f("cv-088", "up"), f("cv-027", "down")]);
    const e2 = g.edges.find((e) => e.id === "E2")!;
    expect(e2.style).toBe("solid-arrow");
    expect(g.edges.find((e) => e.id === "E5")!.style).toBe("dashed");
    expect(g.edges.some((e) => e.id === "E3")).toBe(false);
  });
  it("co-occurrence requires both nodes notable", () => {
    expect(relationshipGraph([f("cv-092", "up"), f("cv-027", "down", false)]).edges.some((e) => e.id === "E5")).toBe(false);
  });
  it("the haemoconcentration hypothesis needs sodium, Hb and Hct all rising over the same interval", () => {
    const yes = relationshipGraph([f("cv-070", "up"), f("cv-075", "up"), f("cv-076", "up")]);
    expect(yes.edges.find((e) => e.id === "E6")!.cls).toBe("HYPOTHESIS");
    const no = relationshipGraph([f("cv-070", "up"), f("cv-075", "down"), f("cv-076", "up")]);
    expect(no.edges.some((e) => e.id === "E6")).toBe(false);
  });
  it("established edges without a source are marked reference-pending", () => {
    const g = relationshipGraph([f("cv-092", "up"), { metricId: "x", direction: null, notable: false, interval: null }], {
      ...JSON.parse(readFileSync(join(ROOT, "data/scientific/p59-relationship-model.v1.json"), "utf8")),
      aliases: { map: { x: "clotting" } },
    });
    expect(g.edges.find((e) => e.id === "E1")!.referencePending).toBe(true);
  });
});

describe("P59 executive alerts", () => {
  const base: FindingSummary = { id: "x", title: "t", clinical: "NEUTRAL", clinicalBasis: "none", review: "NO_FLAG", dataQuality: "UNKNOWN", evidence: "e", nextStep: "n", clinicalOrder: 9 };
  it("a normal dataset never produces a red card", () => {
    const cards = selectExecutiveAlerts([base, { ...base, id: "y", clinical: "NORMAL", clinicalBasis: "approved" }]);
    expect(cards.map((c) => c.kind)).toEqual(["none"]);
  });
  it("orders approved RED, high review, data check, amber; collapses overflow into one card", () => {
    const cards = selectExecutiveAlerts([
      { ...base, id: "amber", clinical: "AMBER", clinicalBasis: "approved" },
      { ...base, id: "dq", dataQuality: "DATA_QUALITY_WARNING" },
      { ...base, id: "high", review: "HIGH", clinicalOrder: 0 },
      { ...base, id: "red", clinical: "RED", clinicalBasis: "approved" },
      { ...base, id: "prov", clinical: "AMBER", clinicalBasis: "provisional" },
    ]);
    expect(cards.map((c) => c.kind)).toEqual(["clinical-red", "review-high", "data-check", "clinical-amber"]);
    expect(cards[3]!.findingIds).toEqual(["amber", "prov"]);
  });
  it("labels provisional colour explicitly", () => {
    const [c] = selectExecutiveAlerts([{ ...base, clinical: "RED", clinicalBasis: "provisional" }]);
    expect(c!.badges).toEqual(["RED (PROVISIONAL)"]);
  });
});

describe("P59 tokens", () => {
  it("page geometry is consistent", () => {
    expect(PAGE.contentWidth).toBe(PAGE.width - 2 * PAGE.marginX);
    expect(COLOR.red).not.toEqual(COLOR.violet);
  });
});
