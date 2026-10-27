import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

test("reference picker work preserves the proposal catalog bytes and pending status", () => {
  const raw = readFileSync("data/scientific/p355-proposed-domain-catalog.v1.json", "utf8");
  expect(createHash("sha256").update(raw).digest("hex")).toBe(
    "1ee9b54a30e07da2f218d3c72d92efdef974c253f596afd0b2221669a45e3dfc",
  );
  const catalog = JSON.parse(raw) as { entries: { status: string }[] };
  expect(catalog.entries.length).toBeGreaterThan(0);
  for (const entry of catalog.entries) expect(entry.status).toBe("PENDING_NIKOLAS_REVIEW");
});

test("owner-reported review does not change either original handbook source", () => {
  const sources = [
    ["nikolas-immune-intake.v1.json", "22e52600ac675d79cefc5421bc730be667a510060f6693f371810111b5b06aa3"],
    ["nikolas-behavioral-intake.v1.json", "9fffef752423df4eaaa31c635bf00d772edb81c3fecb9f6d0be57800f05d9e64"],
  ];
  for (const [name, hash] of sources) {
    const raw = readFileSync(`data/scientific/${name}`, "utf8");
    expect(createHash("sha256").update(raw).digest("hex")).toBe(hash);
  }
});