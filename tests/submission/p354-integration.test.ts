import { describe, expect, test } from "bun:test";
import { p354IntegrationReadiness, P354_PATHWAYS } from "../../src/domain/challenge-submission/p354-integration";

describe("P35.4 fail-closed integration handoff", () => {
  test("keeps independent, security and clinical gates blocked", () => {
    const report = p354IntegrationReadiness();
    expect(report.finalAcceptance).toBe(false);
    expect(report.clinicalActivation).toBe(false);
    expect(report.finalSecurityGate).toBe("BLOCKED");
    expect(report.fv0113).toBe("OPEN");
  });
  test("exposes all current physical and scientific checks without inventing passes", () => {
    const report = p354IntegrationReadiness();
    expect(report.physical).toHaveLength(15);
    expect(report.scientific).toHaveLength(8);
    expect(report.physical.every(c => c.status !== "observed_pass")).toBe(true);
  });
  test("connects P35.1, P35.2, P35.3 and offline without enabling crew imports", () => {
    expect(P354_PATHWAYS.map(p => p.id)).toEqual(["nasa", "live", "alerts", "offline"]);
    expect(P354_PATHWAYS.find(p => p.id === "nasa")?.boundary).toContain("not a crew biometric feed");
  });
});
