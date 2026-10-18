import { describe, expect, test } from "bun:test";
import { DEMO_APPROVAL_PHRASE, DEMO_MISSION_CODE, evaluateDemoMissionActivation } from "../../src/domain/mission-access/demo-mission-activation";
const ready = { signedIn: true, hasOperatorMembership: true, approval: DEMO_APPROVAL_PHRASE, confirmed: true, existingMissionCodes: [] as string[] };
describe("P35.21 explicit owner-gated mission creation", () => {
  test("requires signed in identity", () => expect(evaluateDemoMissionActivation({ ...ready, signedIn: false }).allowed).toBe(false));
  test("requires operator membership", () => expect(evaluateDemoMissionActivation({ ...ready, hasOperatorMembership: false }).allowed).toBe(false));
  test("requires exact typed approval", () => expect(evaluateDemoMissionActivation({ ...ready, approval: "CREATE" }).allowed).toBe(false));
  test("requires checkbox confirmation", () => expect(evaluateDemoMissionActivation({ ...ready, confirmed: false }).allowed).toBe(false));
  test("rejects existing demo mission", () => expect(evaluateDemoMissionActivation({ ...ready, existingMissionCodes: [DEMO_MISSION_CODE] }).allowed).toBe(false));
  test("permits request only after explicit owner action", () => expect(evaluateDemoMissionActivation(ready).allowed).toBe(true));
});
