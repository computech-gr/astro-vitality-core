import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
const guide = readFileSync(join(root, "src/components/project-guide.tsx"), "utf8");

describe("final public navigation", () => {
  test("documentation-only submenu items use specific guide anchors rather than category fallback", () => {
    expect(shell).toContain('"Scientific Foundation": guideHref("scientific-foundation")');
    expect(shell).toContain('"System Architecture": guideHref("system-architecture")');
    expect(shell).toContain('Roadmap: guideHref("roadmap")');
  });

  test("implemented operational surfaces keep direct mission routes", () => {
    expect(shell).toContain('if (label === "Live Monitoring") return "/mission/live"');
    expect(shell).toContain('if (label === "Device Integration Center") return "/mission/devices"');
    expect(shell).toContain('if (label === "Health Intelligence") return "/mission/intelligence"');
    expect(shell).toContain('if (label === "Explainable Alerts") return "/mission/alerts"');
    expect(shell).toContain('if (label === "Action Guidance") return "/mission/guidance"');
    expect(shell).toContain('if (label === "Challenge Submission") return "/mission/submission"');
  });

  test("project guide contains unique destinations for public project concepts", () => {
    for (const id of ["our-mission", "personal-baselines", "system-architecture", "device-adapter-sdk", "team", "roadmap", "resources-references"]) {
      expect(guide).toContain(`id: "${id}"`);
    }
  });
});
