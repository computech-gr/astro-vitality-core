import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const shell = readFileSync("src/components/app-shell.tsx", "utf8");

describe("P35.10 role-neutral user journey", () => {
  test("mission, evidence, intelligence and scientific navigation are grouped", () => {
    for (const label of ["Mission Console", "Health & Intelligence", "Science", "Technology", "About & Open Source"]) {
      expect(shell).toContain(`label: "${label}"`);
    }
    for (const label of ["Mission Documents", "Bone Health", "Cardiovascular Health", "Immune Changes", "Behavioral Health", "Health Intelligence", "Ground & Research Console"]) {
      expect(shell).toContain(`"${label}"`);
    }
  });
  test("navigation does not confer authorization or introduce demo impersonation", () => {
    expect(shell).not.toContain("isSuperAdmin");
    expect(shell).not.toContain("bypassRls");
    expect(shell).not.toContain("impersonateRole");
  });
});
