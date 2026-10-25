import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/medical-advisor-workbench.tsx", "utf8");

describe("legacy medical draft UI safety", () => {
  test("does not dispatch the disabled production draft endpoint", () => {
    expect(source).not.toContain('fetch("/api/medical-ai-draft"');
    expect(source).not.toContain("generateWithAI");
  });
  test("links to guarded factual Q&A and explains separation", () => {
    expect(source).toContain('href="#synthetic-research-qa"');
    expect(source).toContain("legacy research-draft endpoint is unavailable");
  });
  test("cannot capture an empty draft", () => {
    expect(source).toContain("!draftText.trim()");
  });
});
