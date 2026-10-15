import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const shell = readFileSync(resolve("src/components/app-shell.tsx"), "utf8");
const search = readFileSync(resolve("src/domain/navigation-search/search.ts"), "utf8");

describe("P36.3A Mission Documents navigation", () => {
  it("shows Mission Documents in the global Platform menu, including mobile navigation", () => {
    expect(shell).toContain('"Recorded Mission Data", "Mission Documents"');
    expect(shell).toContain('if (label === "Mission Documents") return "/mission/documents";');
    expect(shell).toContain('group.items.map');
  });
  it("makes Mission Documents discoverable through global search", () => {
    expect(search).toContain('"Mission Documents": ["document"');
    expect(shell).toContain('keywords: SEARCH_KEYWORDS[item]');
  });
  it("does not alter mission review access or data handling", () => {
    expect(shell).not.toContain("supabase.from("p36_biomarker_review_batches")");
  });
});
