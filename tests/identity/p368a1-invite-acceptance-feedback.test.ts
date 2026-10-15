import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const component = readFileSync("src/components/mission-identity.tsx", "utf8");
const infra = readFileSync("src/infrastructure/mission-identity.ts", "utf8");

describe("P36.8A.1 invitation feedback safeguards", () => {
  it("displays localized inline success and failure and prevents double-submit", () => {
    expect(component).toContain('id="invite-feedback"');
    expect(component).toContain('role={inviteFeedback.kind === "error" ? "alert" : "status"}');
    expect(component).toContain("busy || inviteBusy || !inviteCode.trim()");
    expect(component).toContain("setInviteFeedback(null)");
    expect(component).toContain("await refresh()");
  });
  it("accepts deployed RPC success shape but fails closed on unknown responses", () => {
    expect(infra).toContain('data?.status === "rejected"');
    expect(infra).toContain('data?.status === "accepted"');
    expect(infra).toContain('data?.mission_id');
    expect(infra).toContain('if (!accepted) throw new Error');
  });
});
