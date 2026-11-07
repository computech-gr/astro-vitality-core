/**
 * Regenerates data/scientific/biomarker-interpretation-registry.v1.json from the
 * governed handbook layers, the Immune/Behavioral domain catalog and the
 * read-only copy of the activated MITO_DEMO_2026 synthetic demo catalog.
 * Run: bun scripts/generate-biomarker-interpretation-registry.ts
 * Optional: --merge <approval-package.json> (owner-reviewed approval import).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInterpretationRegistry, type DemoActiveEntry, type TermMetadata } from "../src/domain/health-intelligence/biomarker-interpretation-registry-build";
import { mergeApprovalPackage, validateRegistry } from "../src/domain/health-intelligence/biomarker-interpretation";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REGISTRY_FILE = "data/scientific/biomarker-interpretation-registry.v1.json";
export const SOURCE_FILES = [
  "data/scientific/bone-health-handbook-v7.catalog.json",
  "data/scientific/bone-health-handbook-v7.en.json",
  "data/scientific/cardiovascular-handbook.catalog.v1.json",
  "data/scientific/cardiovascular-handbook.en.v1.json",
  "data/scientific/p355-proposed-domain-catalog.v1.json",
  "tests/fixtures/p40-mito-demo-active-catalog.v1.json",
  "tests/fixtures/p38-mito-demo-terms.v1.json",
] as const;

const read = (f: string) => readFileSync(resolve(root, f), "utf8");

export function registryInputs() {
  const sources = SOURCE_FILES.map((file) => ({ file, sha256: createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex") }));
  const demo = JSON.parse(read("tests/fixtures/p40-mito-demo-active-catalog.v1.json")) as { entries: DemoActiveEntry[] };
  const terms = JSON.parse(read("tests/fixtures/p38-mito-demo-terms.v1.json")) as {
    submissions: { terms: { termId: string; metadata: { candidateMetricIds?: string[] } }[] }[];
  };
  const termMetadata: TermMetadata[] = terms.submissions.flatMap((s) =>
    s.terms.map((t) => ({ termId: t.termId, candidateMetricIds: t.metadata.candidateMetricIds ?? [] })),
  );
  return { sources, demoEntries: demo.entries, termMetadata };
}

export const serializeRegistry = (r: unknown) => JSON.stringify(r, null, 1) + "\n";

if (import.meta.main) {
  const mergeAt = process.argv.indexOf("--merge");
  if (mergeAt > 0) {
    const current = validateRegistry(JSON.parse(read(REGISTRY_FILE)));
    if (current.excluded.length) throw new Error(`Registry has invalid records: ${JSON.stringify(current.excluded)}`);
    const pkg = JSON.parse(readFileSync(resolve(process.argv[mergeAt + 1]!), "utf8"));
    const merged = await mergeApprovalPackage(current.registry, pkg);
    if (!merged.ok) throw new Error(merged.reason);
    writeFileSync(resolve(root, REGISTRY_FILE), serializeRegistry(merged.registry));
    console.log(`Merged ${merged.changed.length} record(s) into registry version ${merged.registry.version}.`);
  } else {
    const registry = buildInterpretationRegistry(registryInputs());
    writeFileSync(resolve(root, REGISTRY_FILE), serializeRegistry(registry));
    console.log(`Wrote ${registry.records.length} records to ${REGISTRY_FILE}.`);
  }
}
