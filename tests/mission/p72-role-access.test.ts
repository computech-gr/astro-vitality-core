import { describe, expect, test } from "bun:test";
import {
  decideP72Entry,
  maskAccountEmail,
  P72_ROLE_ROUTES,
  P72_TARGET_MISSION,
  safeP72Next,
} from "@/domain/mission-access/p72-role-access";
import { P72_ROLE_ACCOUNTS, p72MatchesMappedAccount } from "@/lib/p72-role-access.server";
import type { MissionMembershipContext } from "@/infrastructure/mission-identity";

const crewSelf: MissionMembershipContext = { missionId: P72_TARGET_MISSION.missionId, role: "crew_self", crewMemberId: P72_TARGET_MISSION.crewMemberId };

describe("P72 homepage role access", () => {
  test("roles map to the exact accounts and consoles", () => {
    expect(P72_ROLE_ACCOUNTS).toEqual({ astronaut: "theosilv@gmail.com", researcher: "nikolasilvestros@gmail.com", medical: "marketing@computech.gr" });
    expect([P72_ROLE_ROUTES.astronaut.consolePath, P72_ROLE_ROUTES.researcher.consolePath, P72_ROLE_ROUTES.medical.consolePath]).toEqual(["/mission/experience", "/mission/scientific-review", "/mission/ground"]);
  });

  test("the browser shows only masked addresses matching the server mapping", () => {
    for (const role of ["astronaut", "researcher", "medical"] as const)
      expect(P72_ROLE_ROUTES[role].maskedAccount).toBe(maskAccountEmail(P72_ROLE_ACCOUNTS[role]));
  });

  test("target mission is Mitochondria validation mission — Astronaut Test 01", () => {
    expect(P72_TARGET_MISSION.missionId).toBe("mission-3fd366c331ed46afb0645cced1d45294");
    expect(P72_TARGET_MISSION.crewMemberId).toBe("crew-43f5fe4d102f40d19ced676dabd3b672");
  });

  test("signed-out and demo visitors get the one-click synthetic demo", () => {
    expect(decideP72Entry({ role: "astronaut", standardSession: false, mappedAccount: false, signedInAs: null, memberships: [] }).kind).toBe("demo");
    expect(decideP72Entry({ role: "medical", standardSession: false, mappedAccount: true, signedInAs: null, memberships: [] }).kind).toBe("demo");
  });

  test("the mapped account enters its console with the target membership preselected", () => {
    const d = decideP72Entry({ role: "astronaut", standardSession: true, mappedAccount: true, signedInAs: "theosilv@gmail.com", memberships: [crewSelf] });
    expect(d).toEqual({ kind: "console", path: "/mission/experience", membership: crewSelf });
  });

  test("astronaut membership must be for the target crew member", () => {
    const other = { ...crewSelf, crewMemberId: "crew-other" };
    const d = decideP72Entry({ role: "astronaut", standardSession: true, mappedAccount: true, signedInAs: "x", memberships: [other] });
    expect(d.kind === "console" && d.membership).toBe(undefined);
  });

  test("any other signed-in account is never switched or let through", () => {
    const d = decideP72Entry({ role: "researcher", standardSession: true, mappedAccount: false, signedInAs: "someone@example.com", memberships: [crewSelf] });
    expect(d).toEqual({ kind: "wrong_account", signedInAs: "someone@example.com" });
  });

  test("account matching uses the verified session email, case-insensitive, and refuses demo identities", () => {
    expect(p72MatchesMappedAccount("astronaut", { email: "TheoSilv@Gmail.com" })).toBe(true);
    expect(p72MatchesMappedAccount("astronaut", { email: "nikolasilvestros@gmail.com" })).toBe(false);
    expect(p72MatchesMappedAccount("medical", { email: "marketing@computech.gr", app_metadata: { mitochondria_public_demo: true } })).toBe(false);
    expect(p72MatchesMappedAccount("medical", {})).toBe(false);
  });

  test("only the three console paths are accepted as a destination", () => {
    expect(safeP72Next("/mission/ground")).toBe("/mission/ground");
    expect(safeP72Next("https://evil.example")).toBe(undefined);
  });
});
