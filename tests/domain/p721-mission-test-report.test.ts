/**
 * P72.1 — MISSION_TEST report readiness (SYNTHETIC FIXTURES ONLY; nothing is stored or synced).
 * Rule: a P72 copy starts "pending_review" and is excluded from the Full Health Report; only records a
 * human confirmed in the target mission's own Examinations intake are reported. Confirmation below is
 * simulated in memory for the fixture and is never a clinical or scientific approval.
 */
import { describe, expect, it } from "bun:test";
import { jsPDF } from "jspdf";
import { p72CopyObservation, P72_SOURCE_SCOPE, P72_TARGET_SCOPE } from "../../src/domain/examination-copy/p72-copy-plan";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { renderPremium, renderPremiumReport, type PremiumWriter } from "../../src/domain/health-intelligence/p59-premium-pdf";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { premiumFrom, smallNormal } from "../support/p59-fixtures";
import { SvgPdfWriter } from "../support/svg-pdf-writer";

const source = (): UnifiedObservation[] =>
  smallNormal().map((o) => ({ ...o, missionId: P72_SOURCE_SCOPE.missionId, crewMemberId: P72_SOURCE_SCOPE.crewMemberId }));
const copies = () => source().map((o, i) => p72CopyObservation(o, `0000000${i}-0000-4000-8000-000000000000`, P72_TARGET_SCOPE));
const range = { from: "2026-11-01", to: "2026-11-08" };
const inputs = (rows: UnifiedObservation[]) => ({ domainEntries: {}, unifiedObservations: rows, deviceRecords: [] }) as never;

describe("P72.1 MISSION_TEST report readiness", () => {
  it("transferred copies are pending review and are not reported", () => {
    const rows = copies();
    expect(rows.every((o) => o.reviewState === "pending_review" && o.quality.reviewerConfirmed === false)).toBe(true);
    const unified = buildUnifiedHealthReport(inputs(rows), P72_TARGET_SCOPE, range, "2026-11-08T12:00:00.000Z");
    expect(unified.rows).toHaveLength(0);
    expect(unified.exclusions).toHaveLength(7);
    expect(unified.exclusions.every((e) => e.category === "pending_review")).toBe(true);
  });

  it("only human-confirmed MISSION_TEST records reach the PDF, for Astronaut Test 01", async () => {
    const confirmed = copies().map((o) => ({ ...o, reviewState: "accepted" as const, quality: { reviewerConfirmed: true } }));
    const report = premiumFrom(confirmed, { scope: P72_TARGET_SCOPE, missionId: P72_TARGET_SCOPE.missionId, range, crew: "Astronaut Test 01", mission: "MISSION_TEST" });
    expect(report.rows).toHaveLength(7);
    expect(report.header.astronaut).toBe("Astronaut Test 01");
    const w = new SvgPdfWriter();
    renderPremiumReport(report, w as never, { family: "LiberationSans", unicode: true });
    const text = w.texts.map((t) => t.text).join("\n");
    expect(text).toContain("Astronaut Test 01");
    expect(text).not.toMatch(/Alex Morgan|nikola|νικόλα/i);
    const res = renderPremium(new jsPDF({ unit: "mm", format: "a4" }) as unknown as PremiumWriter, null, report, { fixedDate: "2026-11-15T00:00:00.000Z" });
    const head = new TextDecoder().decode(new Uint8Array(await res.blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe("%PDF-");
    expect(res.pages).toBeGreaterThan(0);
  });
});
