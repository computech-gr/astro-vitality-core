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

const groundMedical: MissionMembershipContext = { missionId: P72_TARGET_MISSION.missionId, role: "ground_medical", crewMemberId: P72_TARGET_MISSION.crewMemberId };
const missionTestCrew: MissionMembershipContext = { missionId: "mission-3fd366c331ed46afb0645cced1d45294", role: "crew_self", crewMemberId: "crew-43f5fe4d102f40d19ced676dabd3b672" };
const missionTestMedical: MissionMembershipContext = { missionId: "mission-3fd366c331ed46afb0645cced1d45294", role: "ground_medical", crewMemberId: "crew-43f5fe4d102f40d19ced676dabd3b672" };

describe("P72 homepage role access", () => {
  test("P72.3: Astronaut and Medical map to marketing@ and the Ground Medical console; Researcher to nikolasilvestros@", () => {
    expect(P72_ROLE_ACCOUNTS).toEqual({ astronaut: "marketing@computech.gr", researcher: "nikolasilvestros@gmail.com", medical: "marketing@computech.gr" });
    expect([P72_ROLE_ROUTES.astronaut.consolePath, P72_ROLE_ROUTES.researcher.consolePath, P72_ROLE_ROUTES.medical.consolePath]).toEqual(["/mission/ground", "/mission/scientific-review", "/mission/ground"]);
    expect(P72_ROLE_ROUTES.astronaut.membershipRole).toBe("ground_medical");
    expect(P72_ROLE_ROUTES.researcher.membershipRole).toBe("researcher");
  });

  test("the browser shows only masked addresses matching the server mapping", () => {
    for (const role of ["astronaut", "researcher", "medical"] as const)
      expect(P72_ROLE_ROUTES[role].maskedAccount).toBe(maskAccountEmail(P72_ROLE_ACCOUNTS[role]));
  });

  test("P72.3 target is MITO_DEMO_2026 — Alex Morgan, not MISSION_TEST", () => {
    expect(P72_TARGET_MISSION.missionCode).toBe("MITO_DEMO_2026");
    expect(P72_TARGET_MISSION.missionId).toBe("mission-9d8ce8f3e5554509a0885461f9ad2e1c");
    expect(P72_TARGET_MISSION.crewMemberId).toBe("crew-9806e7e611f44dc38dac5e23f7740f1a");
  });

  test("signed-out and demo visitors get the one-click synthetic demo", () => {
    expect(decideP72Entry({ role: "astronaut", standardSession: false, mappedAccount: false, signedInAs: null, memberships: [] }).kind).toBe("demo");
    expect(decideP72Entry({ role: "medical", standardSession: false, mappedAccount: true, signedInAs: null, memberships: [] }).kind).toBe("demo");
  });

  test("Astronaut and Medical reach the same Ground Medical console with MITO_DEMO_2026 / Alex Morgan preselected", () => {
    const memberships = [missionTestMedical, groundMedical];
    const a = decideP72Entry({ role: "astronaut", standardSession: true, mappedAccount: true, signedInAs: "marketing@computech.gr", memberships });
    const m = decideP72Entry({ role: "medical", standardSession: true, mappedAccount: true, signedInAs: "marketing@computech.gr", memberships });
    expect(a).toEqual({ kind: "console", path: "/mission/ground", membership: groundMedical });
    expect(m).toEqual(a);
  });

  test("MISSION_TEST is never forced: without the MITO_DEMO_2026 / Alex Morgan membership nothing is preselected", () => {
    const other = { ...groundMedical, crewMemberId: "crew-other" };
    for (const role of ["astronaut", "medical"] as const) {
      const d = decideP72Entry({ role, standardSession: true, mappedAccount: true, signedInAs: "x", memberships: [missionTestMedical, missionTestCrew, other] });
      expect(d).toEqual({ kind: "console", path: "/mission/ground", membership: undefined });
    }
  });

  test("Researcher never receives a Ground Medical membership selection", () => {
    const d = decideP72Entry({ role: "researcher", standardSession: true, mappedAccount: true, signedInAs: "nikolasilvestros@gmail.com", memberships: [groundMedical] });
    expect(d).toEqual({ kind: "console", path: "/mission/scientific-review", membership: undefined });
  });

  test("the former Astronaut account is now treated as a different account for the Astronaut button", () => {
    expect(p72MatchesMappedAccount("astronaut", { email: "theosilv@gmail.com" })).toBe(false);
    expect(p72MatchesMappedAccount("astronaut", { email: "Marketing@Computech.gr" })).toBe(true);
  });

  test("any other signed-in account is never switched or let through", () => {
    const d = decideP72Entry({ role: "researcher", standardSession: true, mappedAccount: false, signedInAs: "someone@example.com", memberships: [groundMedical] });
    expect(d).toEqual({ kind: "wrong_account", signedInAs: "someone@example.com" });
  });

  test("account matching uses the verified session email, case-insensitive, and refuses demo identities", () => {
    expect(p72MatchesMappedAccount("researcher", { email: "NikolaSilvestros@Gmail.com" })).toBe(true);
    expect(p72MatchesMappedAccount("astronaut", { email: "nikolasilvestros@gmail.com" })).toBe(false);
    expect(p72MatchesMappedAccount("medical", { email: "marketing@computech.gr", app_metadata: { mitochondria_public_demo: true } })).toBe(false);
    expect(p72MatchesMappedAccount("medical", {})).toBe(false);
  });

  test("only the three console paths are accepted as a destination", () => {
    expect(safeP72Next("/mission/ground")).toBe("/mission/ground");
    expect(safeP72Next("https://evil.example")).toBe(undefined);
  });
});
