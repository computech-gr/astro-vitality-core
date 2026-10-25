import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const review = readFileSync("src/components/synthetic-medical-review.tsx", "utf8");

describe("synthetic research navigation and safe Q&A entry", () => {
  test("owner administration has a direct Mission Console navigation destination", () => {
    expect(shell).toContain('"AI Administration & Usage"');
    expect(shell).toContain('if (label === "AI Administration & Usage") return "/mission/ai-administration"');
  });
  test("research Q&A has a direct Health & Intelligence destination", () => {
    expect(shell).toContain('"Synthetic Research AI"');
    expect(shell).toContain('if (label === "Synthetic Research AI") return "/mission/health-report#synthetic-research-qa"');
    expect(review).toContain('id="synthetic-research-qa"');
  });
  test("fixture is loaded explicitly and consent is required for Q&A", () => {
    expect(review).toContain('Load authorized synthetic fixture');
    expect(review).toContain('disabled={busy || !qaConsent || !question.trim()}');
    expect(review).toContain('onClick={() => void run(askQuestion)}');
    expect(review).not.toContain('Production synthetic fixture review is disabled pending separate authorization.');
    expect(review.indexOf('id="synthetic-research-qa"')).toBeLessThan(review.indexOf('Generate synthetic research draft'));
  });
});
