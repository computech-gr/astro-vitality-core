import { describe, expect, test } from "bun:test";
import { p35Readiness, p35Handoff } from "../../src/domain/challenge-submission/p35-readiness";
describe("P35 fail-closed submission handoff", () => {
  test("does not claim independent scientific or real device acceptance", () => { const r = p35Readiness(); expect(r.readyToSubmit).toBe(false); expect(r.scientificApproval).toBe(false); expect(r.realDeviceAcceptanceApproved).toBe(false); });
  test("preserves all pending physical and scientific gates", () => { const r = p35Readiness(); expect(r.devicePending).toHaveLength(15); expect(r.sciencePending).toHaveLength(8); });
  test("external video and rules are not invented", () => { const r = p35Readiness(); expect(r.videoReady).toBe(false); expect(r.rulesReady).toBe(false); });
  test("handoff names evidence paths and human actions", () => { const h = p35Handoff(); expect(h.evidencePaths.length).toBeGreaterThan(3); expect(h.humanActions.length).toBeGreaterThan(3); });
});
