/**
 * P59 Rev 2 regression tests — owner-directed synthetic demonstration mappings and the
 * warning-priority axis. The Alex Morgan series is a test reconstruction (owner briefs plus
 * the supplied 2026-11-07 PDF), never the owner's locally stored observations.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { renderPremium } from "../../src/domain/health-intelligence/p59-premium-pdf";
import { DEMONSTRATION_LABEL } from "../../src/domain/health-intelligence/p59-premium-model";
import { premiumFrom, alexFull, MITO_DEMO_MISSION_ID } from "../support/p59-fixtures";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fontDir = join(ROOT, "node_modules/pdfjs-dist/standard_fonts");
const fonts = {
  regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"),
  bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64"),
};
const demo = () => premiumFrom(alexFull(), { provisional: true, mappings: true, missionId: MITO_DEMO_MISSION_ID });
const alertBy = (r: ReturnType<typeof demo>, title: RegExp) => r.alerts.find((a) => title.test(a.title));

describe("P59 synthetic demonstration mappings", () => {
  it("vitamin D (criterion-scoped) and sleep efficiency are coloured only through a demonstration mapping on the demo mission", () => {
    const r = demo();
    const vitD = r.rows.filter((x) => x.metricId === "demo:ubt-7b25ce69");
    expect(vitD.length).toBe(2);
    expect(vitD.every((x) => x.basis === "provisional" && x.displayClass === "AMBER" && x.identityRoute?.kind === "demonstration_mapping")).toBe(true);
    const sleep = r.rows.find((x) => x.metricId === "demo:ubt-efe7e2fb")!;
    expect(sleep.basis).toBe("provisional");
    expect(sleep.identityRoute?.kind).toBe("demonstration_mapping");
    expect(r.options.demonstrationMappingsActive).toBe(true);
    expect(r.demonstrationLabel).toBe(DEMONSTRATION_LABEL);
  });

  it("mappings never apply to another mission", () => {
    const r = premiumFrom(alexFull(), { provisional: true, mappings: true });
    expect(r.rows.some((x) => x.identityRoute?.kind === "demonstration_mapping")).toBe(false);
    expect(r.rows.find((x) => x.metricId === "demo:ubt-7b25ce69")!.displayClass).toBe("NEUTRAL");
  });

  it("real data is never coloured by literature criteria or mappings", () => {
    const r = premiumFrom(alexFull(), { provisional: true, mappings: true, missionId: MITO_DEMO_MISSION_ID, provenance: "real" });
    expect(r.rows.every((x) => x.displayClass === "NEUTRAL" && x.basis === "none")).toBe(true);
    expect(r.options.demonstrationMappingsActive).toBe(false);
  });

  it("with demonstration mode off nothing is coloured (0 approved criteria)", () => {
    const r = premiumFrom(alexFull(), { provisional: false, missionId: MITO_DEMO_MISSION_ID });
    expect(r.rows.every((x) => x.displayClass === "NEUTRAL")).toBe(true);
  });
});

describe("P59 warning priority (separate from clinical class)", () => {
  it("electrolytes and inflammation are HIGH PRIORITY MEDICAL REVIEW via the threshold rule", () => {
    const r = demo();
    const el = alertBy(r, /electrolyte/i)!;
    const inf = alertBy(r, /inflammatory/i)!;
    expect(el.priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
    expect(inf.priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
    expect(el.rules).toContain("WP-2");
  });

  it("the one-day HbA1c swing is a DATA CHECK with a NEUTRAL clinical class", () => {
    const g = alertBy(demo(), /blood-sugar/i)!;
    expect(g.priority).toBe("DATA_CHECK");
    expect(g.clinical).toBe("NEUTRAL");
  });

  it("triglycerides never reach high priority while fasting status is unrecorded", () => {
    const r = demo();
    const tg = Object.entries(r.priorities).find(([id]) => /triglycer|lipid/i.test(id));
    expect(tg).toBeTruthy();
    expect(tg![1].priority).toBe("MONITORING");
  });

  it("without demonstration mode no finding is high priority", () => {
    const r = premiumFrom(alexFull(), { provisional: false, missionId: MITO_DEMO_MISSION_ID });
    expect(Object.values(r.priorities).some((p) => p.priority === "HIGH_PRIORITY_MEDICAL_REVIEW")).toBe(false);
  });
});

describe("P59 real jsPDF render", () => {
  it("renders the demonstration report with page numbers and no blank pages", async () => {
    const res = renderPremium(new jsPDF({ unit: "mm", format: "a4", compress: true }) as never, fonts, demo(), { fixedDate: "2026-11-08T12:00:00Z" });
    expect(res.pages).toBeGreaterThanOrEqual(8);
    expect(res.pages).toBeLessThanOrEqual(20);
    expect((await res.blob.arrayBuffer()).byteLength).toBeGreaterThan(50_000);
  });
});
