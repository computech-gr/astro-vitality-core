import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

import { ROADMAP_DOCS, ROADMAP_GITHUB_DOCS_URL, ROADMAP_PHASES, ROADMAP_UNVERIFIED_ENTRIES, ROADMAP_VALIDATION_DIMENSIONS } from "@/content/roadmap-phases";

describe("development roadmap registry", () => {
  test("covers every numbered phase P0–P47 exactly once in numeric order", () => {
    expect(ROADMAP_PHASES.map((p) => p.number)).toEqual(Array.from({ length: 48 }, (_, i) => i));
    expect(ROADMAP_PHASES.map((p) => p.id)).toEqual(ROADMAP_PHASES.map((p) => `P${p.number}`));
  });

  test("includes the previously omitted phases", () => {
    for (const id of ["P0", "P1", "P2", "P3", "P15", "P21", "P22", "P23", "P36", "P37", "P38", "P39", "P40", "P41", "P42", "P43", "P44", "P45", "P46", "P47"]) {
      expect(ROADMAP_PHASES.some((p) => p.id === id)).toBe(true);
    }
  });

  test("every linked document and verifier exists in the repository", () => {
    for (const doc of ROADMAP_DOCS) expect(existsSync(doc)).toBe(true);
    for (const p of ROADMAP_PHASES) if (p.verifier) expect(existsSync(p.verifier)).toBe(true);
  });

  test("links point to the public GitHub main branch", () => {
    expect(ROADMAP_GITHUB_DOCS_URL).toBe("https://github.com/computech-gr/astro-vitality-core/blob/main/");
  });

  test("subphase ids are unique and missing records are listed, not invented", () => {
    const ids = ROADMAP_PHASES.flatMap((p) => (p.subphases ?? []).map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("P23B");
    expect(ROADMAP_UNVERIFIED_ENTRIES.map((e) => e.id)).toContain("P23B");
    expect(ROADMAP_PHASES.find((p) => p.id === "P0")?.status).toBe("referenced_only");
  });

  test("scientific review phases are never shown as approved", () => {
    for (const id of ["P21", "P37", "P38", "P39", "P40", "P41", "P42", "P43", "P44"]) {
      expect(ROADMAP_PHASES.find((p) => p.id === id)?.status).toBe("review_only");
    }
    const sci = ROADMAP_VALIDATION_DIMENSIONS.find((d) => d.id === "scientific");
    expect(sci?.state).toContain("0 approvals");
    const evidence = JSON.parse(readFileSync("data/submission/p46-acceptance-evidence.v1.json", "utf8"));
    expect(evidence.scientific.independent_approvals).toBe(0);
  });

  test("submission and acceptance gates stay open", () => {
    for (const id of ["P20", "P22", "P34", "P36", "P46", "P47"]) expect(ROADMAP_PHASES.find((p) => p.id === id)?.status).toBe("gate_open");
    const handoff = JSON.parse(readFileSync("data/submission/p47-competition-handoff.v1.json", "utf8"));
    expect(handoff.submission_ready).toBe(false);
    expect(ROADMAP_VALIDATION_DIMENSIONS.find((d) => d.id === "submission")?.state).toBe("Not confirmed");
  });

  test("project guide renders the registry instead of a hardcoded list", () => {
    const guide = readFileSync("src/components/project-guide.tsx", "utf8");
    expect(guide).not.toContain("roadmapPhases");
    expect(guide).toContain("<ProjectRoadmap />");
    expect(guide).toContain('href="#roadmap-detail"');
  });
});
