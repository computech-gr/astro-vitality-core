import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("P19 self-host packaging", () => {
  test("Docker and runtime consume the actual Nitro .output tree", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    const runtime = readFileSync(join(process.cwd(), "scripts/serve-dist.mjs"), "utf8");

    expect(dockerfile).toContain("COPY --from=build /app/.output ./.output");
    expect(dockerfile).not.toContain("/app/dist");
    expect(runtime).toContain('.output/public');
    expect(runtime).toContain('.output/server/index.mjs');
    expect(runtime).not.toContain('dist/client');
    expect(runtime).not.toContain('dist/server/index.mjs');
  });
});
