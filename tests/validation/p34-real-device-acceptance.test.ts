import { describe, expect, it } from "bun:test";
import { P34_ACCEPTANCE_LEDGER, acceptanceSummary, buildAcceptanceHandoff, initialAcceptanceObservations } from "../../src/domain/validation/real-device-acceptance";
describe("P34 human-operated device acceptance", () => {
  it("starts unexecuted, without invented approvals", () => { const x=acceptanceSummary(initialAcceptanceObservations()); expect(x.pending).toBe(15); expect(x.passed).toBe(0); expect(x.readyForClaim).toBe(false); expect(x.independentlyVerified).toBe(false); });
  it("requires substantive notes for a self-reported pass", () => { const e=initialAcceptanceObservations(); e[0]!.status="observed_pass"; expect(acceptanceSummary(e).valid).toBe(false); expect(() => buildAcceptanceHandoff(e)).toThrow(); });
  it("never grants approval even with all observed passes", () => { const e=initialAcceptanceObservations().map(x=>({...x,status:"observed_pass" as const,notes:"Observed on physical test device with recorded steps"})); const h=buildAcceptanceHandoff(e); expect(h.realDeviceAcceptanceApproved).toBe(false); expect(h.independentScientificApproval).toBe(false); expect(h.verification).toBe("SELF_REPORTED_UNVERIFIED"); });
  it("rejects duplicates and missing entries", () => { const e=initialAcceptanceObservations(); expect(acceptanceSummary(e.slice(1)).valid).toBe(false); expect(acceptanceSummary([...e.slice(1),e[1]!]).valid).toBe(false); });
  it("covers privacy, offline, science, devices and role separation", () => { const ids=P34_ACCEPTANCE_LEDGER.cases.map(c=>c.id); for(const prefix of ["PRIVACY","OFFLINE","SCIENCE","DEVICE","AUTH"]) expect(ids.some(id=>id.startsWith(prefix))).toBe(true); });
});
