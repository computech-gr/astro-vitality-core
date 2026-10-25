import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const prefix = "supabase/pending/20261027000000_medical_v3_synthetic_";
const originalPin = "cf2b070aa6f7e899efebbc976c2ba08bd1d56e6d277d416b02f0e3d8d82e5795";
const committedPin = "acd4eb5c7bf3bb6495f3ebd78cdb1bf576c16ba71184bc226461f92c33e79259";
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

test("approved and committed schema audit facts differ only by the two attested spaces", () => {
  const approved = readFileSync(`${prefix}schema.sql`);
  const committed = readFileSync("drizzle/migrations/0011_medical_v3_synthetic_schema_only.sql");
  expect(hash(approved)).toBe("2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc");
  expect(hash(committed)).toBe("eb0921ca3155d4e15c9cfb2d60996de85ef53a04956634970ea1a4fc75ffe237");
  const lines = approved.toString("utf8").split("\n");
  for (const line of [10, 350]) lines[line - 1] = ` ${lines[line - 1]}`;
  expect(Buffer.from(lines.join("\n"))).toEqual(committed);
});

test("seed reconciliation changes exactly one pin and preserves every other byte", () => {
  const seed = readFileSync(`${prefix}seed.sql`, "utf8");
  expect(hash(seed)).toBe("131502bd285c5714586220f05f2f2a0da43c383a88b92dd5372ef0ea811095e1");
  expect(seed.split(committedPin)).toHaveLength(2);
  expect(seed.includes(originalPin)).toBe(false);
  expect(hash(seed.replace(committedPin, originalPin))).toBe(
    "39f18901515d5adbf8942bd88b20723b8ded215d53f07f2d076f3cbcb51c6343",
  );
  expect((seed.match(/^DO \$seed\$/gm) ?? []).length).toBe(1);
  expect(seed.trimEnd().endsWith("END $seed$;")).toBe(true);
});

test("retaining-disable reconciliation changes exactly one pin without altering recovery", () => {
  const rollback = readFileSync(`${prefix}disable.rollback.sql`, "utf8");
  expect(hash(rollback)).toBe("e7eb66b4e676aac6b410ca18aaa3ac2758e4ec8bbc7ef809f681415b96cf09b3");
  expect(rollback.split(committedPin)).toHaveLength(2);
  expect(hash(rollback.replace(committedPin, originalPin))).toBe(
    "40f19bba27c5ba8b42535416ab1eefa22d40b34e29b952f6b91ce6580cab1a21",
  );
});
