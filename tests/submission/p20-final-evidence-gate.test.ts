import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const gate = readFileSync("scripts/verify-submission-gate.mjs", "utf8");
const manifest = readFileSync("scripts/generate-submission-manifest.mjs", "utf8");
const storyboard = readFileSync("docs/VIDEO_STORYBOARD.md", "utf8");
const ledger = JSON.parse(readFileSync("data/submission/p20-evidence.v1.json", "utf8"));
const external = JSON.parse(readFileSync("data/submission/p20-final-external-evidence.v1.json", "utf8"));
const reproduction = JSON.parse(readFileSync("data/submission/p19-independent-reproduction.v1.json", "utf8"));

describe("P20 final evidence closure", () => {
  test("records independent reproduction and owner-confirmed video without inventing rules evidence", () => {
    expect(ledger.evidence.find((item: { id: string }) => item.id === "P20-RC-001")?.status).toBe("ready");
    expect(ledger.evidence.find((item: { id: string }) => item.id === "P20-VIDEO-001")?.status).toBe("ready");
    expect(ledger.evidence.find((item: { id: string }) => item.id === "P20-RULES-001")?.status).toBe("pending_external");
    expect(reproduction.commit).toBe("a2be5b2c6c02a96d5f164cc005768f9aa1250bb6");
    expect(reproduction.results.dockerSelfHostBuild).toBe("pass");
    expect(reproduction.results.trackedWorktreeClean).toBe(true);
  });

  test("video closure contains the confirmed public URL, rights, consents and UTC verification timestamp", () => {
    expect(external.video).toEqual({
      status: "ready",
      publicUrl: "https://mitochondria.edocinfo.com/competition/demo-video",
      originalTeamCreated: true,
      rightsAndLicensesConfirmed: true,
      requiredLikenessConsentsConfirmed: true,
      checkedAt: "2026-10-24T06:45:50Z",
    });
  });

  test("official 2026 rules remain unverified", () => {
    expect(external.official2026SubmissionRules).toEqual({
      status: "pending_external",
      officialSourceUrl: null,
      submissionFieldsRechecked: null,
      judgingInstructionsRechecked: null,
      rightsRequirementsRechecked: null,
      checkedAt: null,
    });
  });

  test("manifest generation fails closed on missing controlled inputs", () => {
    expect(manifest).toContain("existsSync");
    expect(manifest).toContain("mission-day-127.synthetic.json");
    expect(manifest).toContain("p19-independent-reproduction.v1.json");
    expect(manifest).toContain("p20-final-external-evidence.v1.json");
  });

  test("final gate verifies file existence, byte count, SHA-256 and external video/rules evidence", () => {
    expect(gate).toContain("manifest file is missing");
    expect(gate).toContain("manifest byte count drift");
    expect(gate).toContain("manifest SHA-256 drift");
    expect(gate).toContain("rightsAndLicensesConfirmed");
    expect(gate).toContain("requiredLikenessConsentsConfirmed");
    expect(gate).toContain("submissionFieldsRechecked");
    expect(gate).toContain("judgingInstructionsRechecked");
  });

  test("storyboard claims the proven physical Camera PPG path rather than an unproven wearable", () => {
    expect(storyboard).toContain("Real physical device / Phone Camera PPG");
    expect(storyboard).not.toContain("Real physical wearable");
  });
});
