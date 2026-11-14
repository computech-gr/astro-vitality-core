import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

describe("P70 landing page and Mission Access", () => {
  const shell = read("src/components/app-shell.tsx");

  test("homepage shows the requested headline and subtitle", () => {
    expect(shell).toContain('Where Scientific Reasoning Meets{" "} <span className="text-primary">AI-Powered Intelligence.</span>');
    expect(shell).toContain(
      "MITOCHONDRIA combines evidence-based scientific reasoning with AI-driven analysis to explore astronaut health, uncover meaningful patterns, and support informed decisions during long-duration space missions.",
    );
    expect(shell).toContain('<PublicDemoRoleEntry variant="hero" />');
  });

  test("three role buttons, no password field, and a Standard sign-in link", () => {
    const entry = read("src/components/public-demo/public-demo-role-entry.tsx");
    expect(entry).toContain("DEMO_ROLES.map");
    expect(entry).not.toMatch(/type="password"/);
    expect(entry).toContain('to="/mission/identity"');
    expect(entry).toContain("Standard sign-in");
    expect(read("src/domain/public-demo/workflow.ts")).toContain('export const DEMO_ROLES: readonly DemoRole[] = ["astronaut", "researcher", "medical"];');
  });

  test("standard sign-in keeps password, sign-up, magic link and password change", () => {
    const identity = read("src/components/mission-identity.tsx");
    expect(identity).toContain('id="standard-sign-in"');
    expect(identity).toContain('id="mission-password"');
    expect(identity).toContain('id="new-mission-password"');
    const infra = read("src/infrastructure/mission-identity.ts");
    for (const api of ["signInWithPassword", "signInWithOtp", "signUp", "updateUser"]) expect(infra).toContain(api);
  });

  test("no autonomous diagnosis or clinical clearance claims in the new public copy", () => {
    const copy = [
      shell,
      read("src/components/public-demo/public-demo-role-entry.tsx"),
      read("src/components/public-demo/public-demo-workspace.tsx"),
      read("src/domain/public-demo/workflow.ts"),
    ].join(" ");
    expect(copy).not.toMatch(/diagnoses (your|the)|clinically (cleared|approved)|autonomous(ly)? diagnos/i);
    expect(read("src/domain/public-demo/workflow.ts")).toContain("not a medical device, diagnosis or clinical clearance");
  });

  test("navigation exposes the live demo and the demo route is noindex", () => {
    expect(shell).toContain('if (label === "NASA Live Demo") return "/mission/demo"');
    expect(read("src/routes/mission.demo.tsx")).toContain('path: "/mission/demo"');
    expect(read("src/infrastructure/seo.ts")).toContain('"/mission/demo"');
  });
});
