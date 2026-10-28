import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("Bone correction notes, non-persisting cancellation and cursor behavior in the real form", () => {
  const result = spawnSync("python3", ["tests/mission/bone-notes-cancel.browser.py"], { encoding: "utf8", timeout: 90000 });
  expect(result.status).toBe(0);
}, 95000);