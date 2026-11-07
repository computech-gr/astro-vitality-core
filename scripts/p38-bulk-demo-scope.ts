/**
 * Deterministic P38 preflight of the actual MITO_DEMO_2026 submitted-term
 * metadata (tests/fixtures/p38-mito-demo-terms.v1.json, a read-only copy) and
 * generator of the owner scope authorization SQL for every term that the
 * preflight leaves decidable: eligible now, eligible once the Researcher picks
 * a domain (no reference names one), or eligible once the Researcher resolves
 * conflicting domain references. Already active, existing catalog matches,
 * ambiguous units and duplicates are never authorized.
 * Run: bun scripts/p38-bulk-demo-scope.ts            (print counts)
 *      bun scripts/p38-bulk-demo-scope.ts --write    (rewrite the pending SQL)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildBulkDemoPreflight,
  catalogExistingMatch,
  needsDomainChoice,
  preflightCounts,
  termKey,
  type PreflightRow,
  type PreflightTermInput,
} from "../src/domain/health-intelligence/p38-bulk-demo-preflight";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SCOPE_SQL_PATH = resolve(
  root,
  "supabase/pending/20261108030001_p38_bulk_demo_scope.authorize.sql",
);
interface Fixture {
  missionId: string;
  submissions: {
    submissionId: string;
    terms: {
      termId: string;
      metadata: {
        originalLabels: string[];
        exactUnit: string;
        classification: string;
        candidateMetricIds: string[];
      };
    }[];
  }[];
}
export const fixture = JSON.parse(
  readFileSync(resolve(root, "tests/fixtures/p38-mito-demo-terms.v1.json"), "utf8"),
) as Fixture;
export const fixtureTerms = (): PreflightTermInput[] =>
  fixture.submissions.flatMap((s, i) =>
    s.terms.map((t) => ({
      submissionId: s.submissionId,
      termId: t.termId,
      receivedSeq: i + 1,
      originalLabels: t.metadata.originalLabels,
      exactUnit: t.metadata.exactUnit,
      classification: t.metadata.classification,
      candidateMetricIds: t.metadata.candidateMetricIds,
    })),
  );
/** Live state read on 2026-11-07 (read-only): two triage acceptances, one active demo entry. */
export const LIVE_STATE = {
  triage: new Map([
    ["4fc8aee1-deb3-4f4c-9173-46c2a3401fa7:ubt-7c10c994", "ACCEPT_FOR_REVIEW"],
    ["79291202-436a-4568-af8a-5458640913eb:ubt-7b25ce69", "ACCEPT_FOR_REVIEW"],
  ]),
  scope: new Set(["79291202-436a-4568-af8a-5458640913eb:ubt-7b25ce69"]),
  events: [
    {
      submissionId: "79291202-436a-4568-af8a-5458640913eb",
      termId: "ubt-7b25ce69",
      demoId: "demo:ubt-7b25ce69",
      entry: { displayName: "25-Hydroxyvitamin D", aliases: ["25(OH) Vitamin D"], unit: "ng/mL" },
      activationEventId: "live-activation",
      revocationEventId: null,
    },
  ],
};
export function livePreflight(): PreflightRow[] {
  return buildBulkDemoPreflight(fixtureTerms(), {
    ...LIVE_STATE,
    existingMatch: catalogExistingMatch(fixture.missionId),
  });
}
export const authorizable = (r: PreflightRow) =>
  r.category === "eligible" || r.category === "conflicting_identity" || needsDomainChoice(r);

const lit = (s: string) => "'" + s.replaceAll("'", "''") + "'";
export function scopeAuthorizationSql(rows = livePreflight()): string {
  const chosen = rows.filter(authorizable).sort((a, b) => a.key.localeCompare(b.key));
  const values = chosen
    .map((r) => `  (${lit(r.submissionId)}::uuid, ${lit(r.termId)}, ${lit(r.unit)})`)
    .join(",\n");
  return `-- PENDING OWNER AUTHORIZATION (single statement). Adds exactly ${chosen.length} synthetic
-- MITO_DEMO_2026 terms to the owner-authorized SYNTHETIC DEMO scope, so the Researcher
-- may record bulk SYNTHETIC DEMO decisions (not scientific approvals) for them. Generated
-- by scripts/p38-bulk-demo-scope.ts from the read-only preflight of the submitted metadata:
-- ${preflightCountsLine(rows)}
-- Excluded: already active, existing handbook/catalog matches, ambiguous or missing units
-- and duplicates. Each row must still match mission, synthetic provenance and the exact
-- submitted unit, and the statement inserts nothing unless the scope holds only the one
-- previously authorized term.
insert into public.p37_demo_scope (submission_id, term_id, authorization_ref)
select v.submission_id, v.term_id, 'owner-authorization:p38-bulk-synthetic-demo-2026-11-07'
from (values
${values}
) as v(submission_id, term_id, exact_unit)
join public.p36_dynamic_handoff_submissions h
  on h.submission_id = v.submission_id and h.mission_id = ${lit(fixture.missionId)} and h.provenance = 'synthetic'
join public.p36_dynamic_handoff_terms t
  on t.submission_id = v.submission_id and t.term_id = v.term_id and t.metadata->>'exactUnit' = v.exact_unit
where (select count(*) from public.p37_demo_scope) = 1
  and not exists (select 1 from public.p37_demo_scope d where d.submission_id = v.submission_id and d.term_id = v.term_id);
`;
}
function preflightCountsLine(rows: PreflightRow[]) {
  const c = preflightCounts(rows);
  const domain = rows.filter(needsDomainChoice).length;
  return `${c.total} terms: ${c.already_active} already active, ${c.eligible} eligible, ${domain} eligible after a domain choice, ${c.conflicting_identity} conflicting identity, ${c.existing_catalog_match} existing catalog match, ${c.ambiguous_unit} ambiguous unit, ${c.duplicate} duplicate, ${c.blocked - domain} other blocked.`;
}

if (import.meta.main) {
  const rows = livePreflight();
  console.log(preflightCountsLine(rows));
  console.log(`authorizable: ${rows.filter(authorizable).length}`);
  if (process.argv.includes("--write")) {
    writeFileSync(SCOPE_SQL_PATH, scopeAuthorizationSql(rows));
    console.log(`wrote ${SCOPE_SQL_PATH}`);
  }
  void termKey;
}
