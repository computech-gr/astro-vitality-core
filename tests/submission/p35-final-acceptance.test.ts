import { describe, expect, test } from "bun:test";
import { p35FinalAcceptanceCatalog, p35FinalAcceptanceHandoff } from "../../src/domain/challenge-submission/p35-final-acceptance";

describe("P35 final acceptance fail-closed worksheet", () => {
  test("includes original 15 P34 cases, independent gates and integration scenarios", () => {
    const c = p35FinalAcceptanceCatalog();
    expect(c.cases).toHaveLength(24);
    expect(c.science).toHaveLength(8);
    expect(c.cases.some(x => x.id === "P35-NASA-01")).toBe(true);
    expect(c.cases.some(x => x.id === "P35-SEC-02")).toBe(true);
  });
  test("manual observed pass cannot authorize final security or clinical activation", () => {
    const report = p35FinalAcceptanceHandoff({ "AUTH-01": { outcome: "pass_observed", evidenceRef: "TICKET-123", operatorNote: "Manual only" } }, "2026-10-14T00:00:00.000Z");
    expect(report.finalSecurityGate).toBe("BLOCKED");
    expect(report.finalAcceptance).toBe(false);
    expect(report.clinicalActivation).toBe(false);
    expect(report.cases.find(x => x.id === "AUTH-01")?.manual.outcome).toBe("pass_observed");
    expect(report.cases.find(x => x.id === "AUTH-02")?.manual.outcome).toBe("not_executed");
  });
});
