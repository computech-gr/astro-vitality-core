/**
 * Disposable socket-only verification of the pending P38 bulk SYNTHETIC DEMO
 * batch functions and the owner scope authorization, on top of the installed
 * P36/P37 chain, using the actual MITO_DEMO_2026 submitted-term metadata (read-
 * only fixture copy, synthetic). Covers preflight-driven scope, bulk triage,
 * bulk decisions, bulk activation, batch bounds, all-or-nothing batch failure
 * and retry, Researcher / Ground Medical separation, concurrency, signed
 * snapshot verification, automatic recognition in a NEW multi-biomarker
 * synthetic examination (online and offline), revocation with history,
 * no real-data / other-mission recognition, untouched production tables and
 * rollback. Never uses managed PG* configuration or the live backend.
 * Run: P36_DISPOSABLE_SOCKET=/tmp/p36-unified/socket-... bun scripts/verify-p38-bulk-demo-pg.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { canonicalJson } from "../src/domain/health-intelligence/observation-envelope";
import { classifyWithGovernedExtensions } from "../src/domain/health-intelligence/unknown-biomarker-review";
import { generateTestSigningKey } from "../src/domain/health-intelligence/catalog-snapshot-signing";
import type { SnapshotStorage } from "../src/domain/health-intelligence/active-catalog-runtime";
import {
  SYNTHETIC_DEMO_ACKNOWLEDGEMENT,
  demoSnapshotFromRpc,
  signSyntheticDemoSnapshot,
  type DemoSnapshotRpc,
} from "../src/domain/health-intelligence/synthetic-demo-catalog";
import {
  getSyntheticDemoCatalogs,
  installOfferedDemoCatalog,
  loadInstalledDemoCatalogs,
  resetSyntheticDemoCatalogsForTests,
} from "../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import {
  buildBulkDemoPreflight,
  catalogExistingMatch,
  needsDomainChoice,
  preflightCounts,
  termKey,
  type PreflightRow,
} from "../src/domain/health-intelligence/p38-bulk-demo-preflight";
import { chunk } from "../src/domain/health-intelligence/p38-bulk-demo-batches";
import { fixture, fixtureTerms, scopeAuthorizationSql } from "./p38-bulk-demo-scope";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["P36_DISPOSABLE_SOCKET"];
if (!socket?.startsWith("/tmp/p36-unified/socket"))
  throw Error("Explicit isolated socket required; live database prohibited.");
const DB = "p38_bulk_it";
const base = ["-h", socket, "-p", "55439", "-U", "lovable", "-v", "ON_ERROR_STOP=1", "-X", "-At"];
const run = (q: string, db = DB) =>
  spawnSync("psql", [...base, "-d", db], {
    input: q,
    encoding: "utf8",
    cwd: root,
    maxBuffer: 64 << 20,
  });
const runAsync = (q: string): Promise<{ status: number | null; stdout: string; stderr: string }> =>
  new Promise((res) => {
    const p = spawn("psql", [...base, "-d", DB], { cwd: root });
    let stdout = "",
      stderr = "";
    p.stdout.on("data", (d) => (stdout += String(d)));
    p.stderr.on("data", (d) => (stderr += String(d)));
    p.on("close", (status) => res({ status, stdout, stderr }));
    p.stdin.end(q);
  });
function sql(q: string, db = DB) {
  const r = run(q, db);
  if (r.status !== 0) throw Error(`Unexpected SQL failure: ${r.stderr.slice(0, 2000)}`);
  return r.stdout.trim();
}
function sqlErr(q: string) {
  const r = run(q);
  if (r.status === 0) throw Error(`Expected SQL failure: ${q.slice(0, 200)}`);
  return r.stderr;
}
const pending = (f: string) => readFileSync(resolve(root, "supabase/pending", f), "utf8");
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const as = (n: number) => `set role authenticated; set request.jwt.claim.sub='${uid(n)}';`;
const last = (s: string) => s.trim().split("\n").at(-1) ?? "";
const json = <T = Record<string, unknown>>(s: string): T => JSON.parse(last(s)) as T;
const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
let count = 0;
const check = (yes: boolean, label: string) => {
  if (!yes) throw Error(`assertion failed: ${label}`);
  count++;
};
let k = 0;
const key = () => `38000000-0000-4000-8000-${String(++k).padStart(12, "0")}`;
const M = fixture.missionId,
  C = fixture.crewMemberId;
const [SUB_A, SUB_B] = fixture.submissions.map((s) => s.submissionId) as [string, string];

// Roles: 1 crew_self · 2 GM mission-wide (submitter) · 3 GM crew-scoped C · 4 Researcher
// (reviewer + triage + approver) and GM · 7 GM crew-scoped other crew · 8 GM inactive ·
// 12 global reviewer without approver or triage grant · 5 GM of another mission.
sql(`drop database if exists ${DB} with (force);`, "postgres");
sql(`create database ${DB};`, "postgres");
sql(`do $r$ begin create role authenticated; exception when duplicate_object then null; end $r$;
do $r$ begin create role anon; exception when duplicate_object then null; end $r$;
do $r$ begin create role service_role; exception when duplicate_object then null; end $r$;
do $r$ begin create role sandbox_exec login bypassrls; exception when duplicate_object then null; end $r$;
alter default privileges in schema public grant select, insert on tables to sandbox_exec;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
create table missions(id text primary key, code text not null, name text not null, status text not null default 'planning');
create table crew_members(id text primary key, display_name text);
create table mission_crew_assignments(mission_id text, crew_member_id text, status text);
create table mission_memberships(id uuid primary key default gen_random_uuid(), mission_id text, user_id uuid, crew_member_id text, role text, active boolean);
create table mission_research_keys(mission_id text primary key, pseudonym_salt bytea not null default decode(md5(random()::text) || md5(random()::text), 'hex'));
create table p36_metric_unit_catalog(metric_id text not null, unit text not null);
insert into p36_metric_unit_catalog values ('cv-001','bpm');
insert into missions(id, code, name) values('${M}','MITO_DEMO_2026','Synthetic Demonstration'),('M2','TEST-B','Security Test B');
insert into mission_research_keys(mission_id) values('${M}'),('M2');
insert into crew_members values('${C}','Synthetic Astronaut'),('C2','Synthetic Crew Two');
insert into mission_crew_assignments values('${M}','${C}','active'),('${M}','C2','active'),('M2','C2','active');
insert into mission_memberships(mission_id, user_id, crew_member_id, role, active) values
 ('${M}','${uid(1)}','${C}','crew_self',true),('${M}','${uid(2)}',null,'ground_medical',true),
 ('${M}','${uid(3)}','${C}','ground_medical',true),('${M}','${uid(4)}',null,'ground_medical',true),
 ('${M}','${uid(7)}','C2','ground_medical',true),('${M}','${uid(8)}',null,'ground_medical',false),
 ('M2','${uid(5)}',null,'ground_medical',true);`);
sql(`BEGIN;\n${pending("20261107000000_p36_dynamic_handoff.tool.sql")}\nCOMMIT;`);
sql(pending("20261107000001_p36_closed_admission.initialize.sql"));
sql(`BEGIN;\n${pending("20261107000002_p36_handoff_executor_insert_remediation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107010000_p36_dynamic_authorization.tool.sql")}\nCOMMIT;`);
sql(
  `BEGIN;\n${pending("20261107010001_p36_authorization_executor_insert_remediation.sql")}\nCOMMIT;`,
);
sql(`BEGIN;\n${pending("20261107020000_p36_authorized_crew_roster.tool.sql")}\nCOMMIT;`);

// Actual submitted-term metadata, inserted with the live submission IDs (synthetic, read-only copy).
for (const [i, s] of fixture.submissions.entries()) {
  const payload = canonicalJson({
    fixture: "p38-live-synthetic-term-metadata",
    submissionId: s.submissionId,
  });
  sql(`insert into p36_dynamic_handoff_submissions(submission_id, mission_id, crew_member_id, provenance, request_id, submitted_by, submitted_role, payload_canonical, payload_sha256)
values ('${s.submissionId}','${M}','${C}','synthetic','ubr-0000003${i}','${uid(2)}','ground_medical',${literal(payload)},encode(sha256(convert_to(${literal(payload)},'UTF8')),'hex'));
insert into p36_dynamic_handoff_terms(submission_id, term_id, metadata) values
${s.terms.map((t) => `('${s.submissionId}','${t.termId}',${literal(JSON.stringify(t.metadata))}::jsonb)`).join(",\n")};`);
}
check(
  sql("select count(*) from p36_dynamic_handoff_terms;") === "209",
  "209 actual submitted terms loaded",
);
sql(`BEGIN;\n${pending("20261107030000_p36_global_scientific_review.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107040000_p36_global_triage.sql")}\nCOMMIT;`);
sql(`insert into p36_global_scientific_reviewers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:disposable'),('${uid(12)}','owner-authorization:disposable');
insert into p36_mission_scientific_sharing(mission_id, permitted_provenance, policy_ref) values ('${M}', array['synthetic'], 'owner-policy:disposable');
insert into p36_global_triage_writers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:triage-disposable');`);
sql(`BEGIN;\n${pending("20261108000000_p37_catalog_activation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261108010000_p37_ground_medical_activation.sql")}\nCOMMIT;`);
sql(
  `insert into p37_scientific_approvers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:p37-disposable');`,
);
sql(`BEGIN;\n${pending("20261108020000_p37_synthetic_demo_catalog.sql")}\nCOMMIT;`);
check(
  sql(
    pending("20261108020001_p37_synthetic_demo_scope.authorize.sql") +
      "select count(*) from p37_demo_scope;",
  ) === "INSERT 0 1\n1",
  "original one-term scope applies to the actual IDs",
);
const fingerprint =
  "select md5(string_agg(submission_id::text || payload_sha256, ',' order by received_seq)) || ':' || (select md5(string_agg(submission_id::text || term_id || metadata::text, ',' order by submission_id, term_id)) from p36_dynamic_handoff_terms) from p36_dynamic_handoff_submissions;";
const before = sql(fingerprint);

// Reproduce the live state: two triage acceptances, ubt-7b25ce69 decided and active.
for (const [s, t] of [
  [SUB_A, "ubt-7b25ce69"],
  [SUB_B, "ubt-7c10c994"],
] as const)
  sql(
    as(4) +
      `select public.p36_global_triage_append_v1('${M}','synthetic','${s}','${t}','ACCEPT_FOR_REVIEW',null,'{}'::text[],null,'${key()}');`,
  );
const d0 = json<{ status: string; event_id: string; entry_sha256: string }>(
  sql(
    as(4) +
      `select public.p37_demo_decide_v1('${M}','${SUB_A}','ubt-7b25ce69','25-Hydroxyvitamin D','bone',${literal(SYNTHETIC_DEMO_ACKNOWLEDGEMENT)},'${key()}');`,
  ),
);
check(d0.status === "recorded", "live-state decision reproduced");
check(
  json<{ status: string }>(
    sql(
      as(3) +
        `select public.p37_demo_activate_v1('${d0.event_id}','${d0.entry_sha256}','${key()}');`,
    ),
  ).status === "recorded",
  "live-state activation reproduced",
);
const counts =
  "select (select count(*) from p37_catalog_events) || ':' || (select count(*) from p36_dynamic_source_validation) || ':' || (select count(*) from p36_dynamic_authorization_events) || ':' || (select count(*) from p36_metric_unit_catalog) || ':' || (select count(*) from p37_scientific_approvers);";
const countsBefore = sql(counts);
check(countsBefore === "0:0:0:1:1", "baseline: no production approvals or receipts");

// --- Install the pending P38 change -------------------------------------------------
sql(`BEGIN;\n${pending("20261108030000_p38_bulk_synthetic_demo.sql")}\nCOMMIT;`);
check(
  sql(`BEGIN;\n${pending("20261108030000_p38_bulk_synthetic_demo.rollback.sql")}
select (not exists (select 1 from pg_proc where proname like 'p38_demo_%'))::text;
ROLLBACK;`)
    .split("\n")
    .includes("true"),
  "rollback removes every P38 function",
);
const FNS = [
  "p38_demo_bulk_triage_accept_v1(text,jsonb)",
  "p38_demo_bulk_decide_v1(text,text,jsonb)",
  "p38_demo_bulk_activate_v1(text,jsonb)",
];
for (const f of FNS) {
  for (const [role, want] of [
    ["authenticated", "true"],
    ["anon", "false"],
    ["service_role", "false"],
    ["sandbox_exec", "false"],
  ] as const)
    check(
      sql(`select has_function_privilege('${role}','${f}','EXECUTE')::text;`) === want,
      `${role} execute ${f} = ${want}`,
    );
  const name = f.slice(0, f.indexOf("("));
  check(
    sql(
      `select (prosecdef and proconfig::text like '%search_path=public, pg_temp%' and pg_get_userbyid(proowner) = current_user)::text from pg_proc where proname='${name}';`,
    ) === "true",
    `${name} definer, pinned search_path, trusted owner`,
  );
}
check(
  sql(
    "select has_function_privilege('authenticated','p38_demo_bulk_check_items(jsonb,text)','EXECUTE')::text;",
  ) === "false",
  "helper not callable",
);

type Item = Record<string, unknown>;
type Res = {
  status: string;
  detail?: string;
  event_id?: string;
  term_id?: string;
  submission_id?: string;
};
type Out = { ok: true; results: Res[] } | { ok: false; err: string };
const call = (r: { status: number | null; stdout: string; stderr: string }): Out =>
  r.status === 0
    ? { ok: true, results: json<{ results: Res[] }>(r.stdout).results }
    : { ok: false, err: r.stderr };
const bulkTriage = (u: number, items: Item[]) =>
  call(
    run(
      as(u) +
        `select public.p38_demo_bulk_triage_accept_v1('${M}',${literal(JSON.stringify(items))}::jsonb);`,
    ),
  );
const bulkDecide = (u: number, items: Item[], ack = SYNTHETIC_DEMO_ACKNOWLEDGEMENT) =>
  call(
    run(
      as(u) +
        `select public.p38_demo_bulk_decide_v1('${M}',${literal(ack)},${literal(JSON.stringify(items))}::jsonb);`,
    ),
  );
const bulkActivateSql = (u: number, items: Item[], mission = M) =>
  as(u) +
  `select public.p38_demo_bulk_activate_v1('${mission}',${literal(JSON.stringify(items))}::jsonb);`;
const bulkActivate = (u: number, items: Item[], mission = M) =>
  call(run(bulkActivateSql(u, items, mission)));
const statuses = (o: Out) => (o.ok ? o.results.map((r) => r.status) : ["error"]);
const all = (o: Out, s: string) =>
  o.ok && o.results.length > 0 && o.results.every((r) => r.status === s);
const demoCount = (t: string) =>
  sql(`select count(*) from p37_demo_catalog_events where event_type='${t}';`);

// --- Preflight from the actual metadata and database state ----------------------------
const dbState = () => {
  const triage = new Map(
    JSON.parse(
      sql(
        `select coalesce(json_agg(json_build_array(submission_id::text || ':' || term_id, action)), '[]') from p36_global_triage_events e where not exists (select 1 from p36_global_triage_events n where n.previous_event_id = e.id);`,
      ),
    ) as [string, string][],
  );
  const scope = new Set(
    JSON.parse(
      sql(
        `select coalesce(json_agg(submission_id::text || ':' || term_id), '[]') from p37_demo_scope;`,
      ),
    ) as string[],
  );
  const events = JSON.parse(
    sql(as(4) + `select public.p37_demo_lifecycle_v1('${M}')->'events';`)
      .split("\n")
      .at(-1)!,
  ) as {
    submission_id: string;
    term_id: string;
    demo_id: string;
    entry: { displayName: string; aliases: string[]; unit: string };
    activation_event_id: string | null;
    revocation_event_id: string | null;
    decision_event_id: string;
    entry_sha256: string;
  }[];
  return { triage, scope, events };
};
const preflight = (
  overrides?: Map<string, { domain?: "bone" | "immune" | "cardiovascular" | "behavioral" }>,
) => {
  const s = dbState();
  return buildBulkDemoPreflight(fixtureTerms(), {
    triage: s.triage,
    scope: s.scope,
    events: s.events.map((e) => ({
      submissionId: e.submission_id,
      termId: e.term_id,
      demoId: e.demo_id,
      entry: e.entry,
      activationEventId: e.activation_event_id,
      revocationEventId: e.revocation_event_id,
    })),
    overrides,
    existingMatch: catalogExistingMatch(M),
  });
};
const p0 = preflight();
const c0 = preflightCounts(p0);
check(
  c0.total === 209 &&
    c0.already_active === 1 &&
    c0.eligible === 66 &&
    c0.ambiguous_unit === 17 &&
    c0.existing_catalog_match === 6 &&
    c0.conflicting_identity === 2 &&
    c0.duplicate === 0 &&
    p0.filter(needsDomainChoice).length === 117 &&
    c0.blocked === 117,
  "preflight of the actual metadata: 1 active, 66 eligible, 117 need a domain, 2 conflicting, 6 existing, 17 ambiguous",
);
check(
  scopeAuthorizationSql(p0) === pending("20261108030001_p38_bulk_demo_scope.authorize.sql"),
  "scope SQL equals the preflight-generated bytes",
);

// --- Owner scope ------------------------------------------------------------------------
const eligible0 = p0.filter((r) => r.category === "eligible");
const triageItem = (r: PreflightRow) => ({
  submission_id: r.submissionId,
  term_id: r.termId,
  expected_previous_event_id: null,
  idempotency_key: key(),
});
check(
  all(bulkTriage(4, eligible0.slice(0, 3).map(triageItem)), "rejected") &&
    sql("select count(*) from p36_global_triage_events;") === "2",
  "bulk triage refused outside the owner scope; nothing written",
);
check(
  sql(
    pending("20261108030001_p38_bulk_demo_scope.authorize.sql") +
      "select count(*) from p37_demo_scope;",
  ) === "INSERT 0 185\n186",
  "owner scope authorization adds exactly 185 terms",
);
check(
  sql(
    pending("20261108030001_p38_bulk_demo_scope.authorize.sql") +
      "select count(*) from p37_demo_scope;",
  ) === "INSERT 0 0\n186",
  "scope authorization is not re-applicable",
);
check(
  !sql("select string_agg(term_id, ',') from p37_demo_scope;").includes("ubt-7c10c994"),
  "ambiguous-unit term never authorized",
);

// Test-only domain choices for the terms no reference classifies (the Researcher chooses in the app).
const overrides = new Map(
  p0
    .filter((r) => needsDomainChoice(r) || r.category === "conflicting_identity")
    .map((r) => [r.key, { domain: "cardiovascular" as const }]),
);
const p1 = preflight(overrides);
const decidable = p1.filter((r) => r.category === "eligible" && r.inScope);
check(decidable.length === 185, "185 decidable after explicit domain choices");

// --- Authorization separation (whole batch refused, nothing written) -------------------
const firstTriage = decidable.slice(0, 50).map(triageItem);
for (const u of [2, 3, 1, 12, 5])
  check(!bulkTriage(u, firstTriage).ok, `bulk triage denied for user ${u}`);
check(
  sql("select count(*) from p36_global_triage_events;") === "2",
  "denied batches wrote nothing",
);
const decideItem = (r: PreflightRow, k2 = key()) => ({
  submission_id: r.submissionId,
  term_id: r.termId,
  display_name: r.displayName,
  domain: r.domain,
  idempotency_key: k2,
});
check(
  all(
    bulkDecide(
      4,
      decidable.slice(0, 5).map((r) => decideItem(r)),
    ),
    "rejected",
  ) && demoCount("DEMO_DECIDE") === "1",
  "decision refused before triage acceptance; nothing written",
);
for (const u of [12, 2, 3, 1])
  check(
    !bulkDecide(
      u,
      decidable.slice(0, 5).map((r) => decideItem(r)),
    ).ok,
    `bulk decision denied for user ${u}`,
  );
check(
  !bulkDecide(
    4,
    decidable.slice(0, 5).map((r) => decideItem(r)),
    "I agree",
  ).ok,
  "acknowledgement required for the whole batch",
);

// --- Bounds and malformed batches -----------------------------------------------------
check(
  !bulkTriage(4, []).ok && !bulkTriage(4, decidable.slice(0, 51).map(triageItem)).ok,
  "batches hold 1 to 50 terms",
);
const dupe = triageItem(decidable[0]!);
check(
  !bulkTriage(4, [dupe, { ...dupe, idempotency_key: key() }]).ok,
  "a term twice in one batch is refused",
);

// --- Bulk triage in bounded batches, retry -------------------------------------------
const triageBatches = chunk(decidable.map(triageItem));
check(triageBatches.length === 4, "185 terms = 4 bounded batches");
for (const b of triageBatches) check(all(bulkTriage(4, b), "recorded"), "triage batch recorded");
check(
  all(bulkTriage(4, triageBatches[0]!), "duplicate"),
  "triage retry with the same keys is a duplicate",
);
check(
  all(bulkTriage(4, decidable.slice(0, 10).map(triageItem)), "skipped"),
  "already accepted terms are skipped",
);
check(sql("select count(*) from p36_global_triage_events;") === "187", "one triage event per term");

// --- Partial batch failure → whole batch rolled back → retry -----------------------------
const p2 = preflight(overrides).filter(
  (r) => r.category === "eligible" && r.inScope && r.triageAction === "ACCEPT_FOR_REVIEW",
);
check(p2.length === 185, "all 185 accepted for review");
const decideBatches = chunk(p2.map((r) => decideItem(r)));
const broken = decideBatches[0]!.map((x, i) =>
  i === 30 ? { ...x, submission_id: "not-a-uuid" } : x,
);
check(
  !bulkDecide(4, broken).ok && demoCount("DEMO_DECIDE") === "1",
  "a failing item rolls back the whole batch (no partial state)",
);
const bad = bulkDecide(
  4,
  decideBatches[0]!.map((x, i) => (i === 7 ? { ...x, domain: "kidney" } : x)),
);
check(
  bad.ok &&
    bad.results.filter((r) => r.status === "rejected").length === 1 &&
    demoCount("DEMO_DECIDE") === "50",
  "per-term rejection reported while the other 49 are recorded",
);
check(
  statuses(bulkDecide(4, decideBatches[0]!)).filter((s) => s === "duplicate").length === 49,
  "retry: recorded terms return duplicate",
);
for (const b of decideBatches) bulkDecide(4, b);
check(demoCount("DEMO_DECIDE") === "186", "one immutable decision per term (185 + already active)");
check(
  all(
    bulkDecide(
      4,
      decideBatches[1]!.map((x) => ({ ...x, idempotency_key: key() })),
    ),
    "skipped",
  ),
  "decided terms are skipped under a new key",
);
const activeItem = p0.find((r) => r.termId === "ubt-7b25ce69")!;
check(
  all(
    bulkDecide(4, [
      {
        submission_id: activeItem.submissionId,
        term_id: "ubt-7b25ce69",
        display_name: "Changed",
        domain: "bone",
        idempotency_key: key(),
      },
    ]),
    "skipped",
  ),
  "already active entry never processed again",
);
check(demoCount("DEMO_ACTIVATE") === "1", "Researcher decisions activate nothing");

// --- Ground Medical bulk activation ----------------------------------------------------
const pendingDecisions = dbState().events.filter((e) => !e.activation_event_id);
check(pendingDecisions.length === 185, "185 proposals pending activation");
const actItem = (e: (typeof pendingDecisions)[number], k2 = key()) => ({
  decision_event_id: e.decision_event_id,
  expected_entry_sha256: e.entry_sha256,
  idempotency_key: k2,
});
const actBatches = chunk(pendingDecisions.map((e) => actItem(e)));
check(
  all(bulkActivate(4, actBatches[0]!), "rejected") && demoCount("DEMO_ACTIVATE") === "1",
  "the Researcher (also Ground Medical) cannot activate own decisions",
);
check(
  all(bulkActivate(7, actBatches[0]!), "rejected"),
  "Ground Medical of another crew is refused per term",
);
for (const u of [8, 1, 12, 5])
  check(!bulkActivate(u, actBatches[0]!).ok, `bulk activation denied for user ${u}`);
check(
  all(
    bulkActivate(5, actBatches[0]!, "M2").ok
      ? bulkActivate(5, actBatches[0]!, "M2")
      : { ok: true, results: [{ status: "rejected" }] },
    "rejected",
  ),
  "other-mission Ground Medical cannot reach these decisions",
);
check(
  !bulkActivate(
    3,
    actBatches[0]!.map((x, i) => (i === 3 ? { ...x, expected_entry_sha256: "x" } : x)),
  ).ok && demoCount("DEMO_ACTIVATE") === "1",
  "malformed digest rolls back the whole activation batch",
);
const tampered = bulkActivate(3, [
  { ...actBatches[0]![0]!, expected_entry_sha256: "0".repeat(64) },
]);
check(
  tampered.ok && tampered.results[0]!.status === "rejected",
  "digest mismatch rejected per term",
);
// Concurrency: two Ground Medical members activate the same batch at once.
const [ca, cb] = await Promise.all([
  runAsync(bulkActivateSql(3, actBatches[0]!)),
  runAsync(
    bulkActivateSql(
      2,
      actBatches[0]!.map((x) => ({ ...x, idempotency_key: key() })),
    ),
  ),
]);
const oa = call(ca),
  ob = call(cb);
check(oa.ok && ob.ok, "concurrent batches both complete");
const recordedTotal = [...statuses(oa), ...statuses(ob)].filter((s) => s === "recorded").length;
check(
  recordedTotal === 50 && demoCount("DEMO_ACTIVATE") === "51",
  "concurrent batches serialize: exactly one activation per decision",
);
for (const b of actBatches.slice(1))
  check(all(bulkActivate(3, b), "recorded"), "activation batch recorded");
check(
  statuses(bulkActivate(3, actBatches[1]!)).every((s) => s === "duplicate"),
  "activation retry is a duplicate",
);
check(demoCount("DEMO_ACTIVATE") === "186", "186 active synthetic demo entries");

// --- Signed snapshot, automatic recognition in a NEW multi-biomarker examination ---------
const snap = json<DemoSnapshotRpc>(sql(as(1) + `select p37_demo_catalog_snapshot_v1('${M}');`));
check(
  snap.entries.length === 186 && snap.entries.every((e) => e.status === "ACTIVE"),
  "crew member reads 186 active demo entries",
);
check(
  ![uid(2), uid(3), uid(4)].some((u) => JSON.stringify(snap).includes(u)),
  "snapshot carries no identities",
);
const k0 = await generateTestSigningKey("disposable-p38-demo-key");
const trusted = { ...k0.trusted, environment: "synthetic_demo" as const };
const store = new Map<string, string>();
const storage: SnapshotStorage = {
  get: (x) => store.get(x) ?? null,
  set: (x, v) => void store.set(x, v),
};
const device = { storage, trustedKeys: [trusted] };
const sign = (r: DemoSnapshotRpc) =>
  signSyntheticDemoSnapshot(
    demoSnapshotFromRpc(r, new Date().toISOString()),
    trusted.keyId,
    k0.privateKey,
  );
resetSyntheticDemoCatalogsForTests();
check(
  (await installOfferedDemoCatalog(await sign(snap), M, device)).installed,
  "signed 186-entry demo catalog verified and installed",
);
const evaluated = getSyntheticDemoCatalogs().get(M)!;
check(
  evaluated.active.length === 186 && evaluated.excluded.length === 0,
  "no conflicting or malformed entries",
);
const tamperedSnap = await sign(snap);
tamperedSnap.snapshot.entries[5]!.unit = "mg/L";
tamperedSnap.snapshot.demoCatalogVersion += 1;
check(
  !(await installOfferedDemoCatalog(tamperedSnap, M, device)).installed,
  "tampered signature rejected",
);
const exam = [
  {
    label: "White blood cell count (total leukocytes)",
    unit: "10^9/L",
    want: "demo:ubt-813d9e97",
    domain: "immune",
  },
  { label: "IMM-001", unit: "10^9/L", want: "demo:ubt-813d9e97", domain: "immune" },
  { label: "Urinary Potassium", unit: "mmol/day", want: "demo:ubt-0312222c", domain: "bone" },
  {
    label: "Total sleep time (main sleep + naps)",
    unit: "h",
    want: "demo:ubt-d900847d",
    domain: "behavioral",
  },
  { label: "25(OH) Vitamin D", unit: "ng/mL", want: "demo:ubt-7b25ce69", domain: "bone" },
  {
    label: "Resting heart rate",
    unit: "bpm",
    want: "demo:" + p0.find((r) => r.labels[0] === "Resting heart rate")!.termId,
    domain: "cardiovascular",
  },
] as const;
const classify = (label: string, unit: string, extra: Record<string, unknown> = {}) =>
  classifyWithGovernedExtensions({ label, unit, provenance: "synthetic", missionId: M, ...extra });
for (const row of exam) {
  const c = classify(row.label, row.unit).classification;
  check(
    c.status === "matched" && c.metricId === row.want && c.domain === row.domain,
    `new examination recognizes ${row.label} (${row.unit}) in ${row.domain}`,
  );
}
check(
  classify("25(OH) Vitamin D", "nmol/L").classification.status !== "matched",
  "different unit never recognized (no conversion)",
);
const hb = classify("Hemoglobin", "g/dL").classification;
check(hb.status === "matched" && hb.metricId === "cv-075", "existing handbook match still wins");
check(
  classify("Urinary Potassium", "mmol/day", { provenance: "real" }).classification.status !==
    "matched",
  "no real-data recognition",
);
check(
  classify("Urinary Potassium", "mmol/day", { missionId: "M2" }).classification.status !==
    "matched",
  "no other-mission recognition",
);
check(
  classify("Urinary Potassium", "mmol/day", { sourceValidation: "unvalidated" }).classification
    .status !== "matched",
  "rows marked unvalidated stay review-only",
);
// Offline: reload from the stored signed snapshot with the network disabled.
resetSyntheticDemoCatalogsForTests();
const realFetch = globalThis.fetch;
globalThis.fetch = (() => {
  throw new Error("network disabled");
}) as unknown as typeof fetch;
check(
  (await loadInstalledDemoCatalogs(device)).loaded === 1 &&
    exam.every((r) => classify(r.label, r.unit).classification.status === "matched"),
  "offline recognition from the stored signed snapshot",
);
globalThis.fetch = realFetch;

// --- Revocation keeps history ------------------------------------------------------------
const potassium = dbState().events.find((e) => e.term_id === "ubt-0312222c")!;
const rv = json<{ status: string }>(
  sql(
    as(3) +
      `select public.p37_demo_revoke_v1('${potassium.activation_event_id}','Synthetic bulk demo revocation test','${key()}');`,
  ),
);
check(rv.status === "recorded", "Ground Medical revokes one bulk entry");
const snap2 = json<DemoSnapshotRpc>(sql(as(1) + `select p37_demo_catalog_snapshot_v1('${M}');`));
check(
  snap2.demo_catalog_version > snap.demo_catalog_version &&
    snap2.entries.filter((e) => e.status === "REVOKED").length === 1,
  "snapshot reflects one revocation",
);
check(
  (await installOfferedDemoCatalog(await sign(snap2), M, device)).installed,
  "revised catalog installed",
);
check(
  classify("Urinary Potassium", "mmol/day").classification.status !== "matched",
  "revoked entry no longer recognized",
);
const hist = classifyWithGovernedExtensions({
  label: "demo:ubt-0312222c",
  unit: "mmol/day",
  provenance: "synthetic",
  missionId: M,
  identity: "canonical",
  includeRevoked: true,
});
check(
  hist.classification.status === "matched" && hist.classification.domain === "bone",
  "historical records still resolve after revocation",
);
check(
  classify("IMM-001", "10^9/L").classification.status === "matched",
  "other entries unaffected",
);
resetSyntheticDemoCatalogsForTests();

// --- Preservation ---------------------------------------------------------------------------
check(sql(fingerprint) === before, "submissions and terms unchanged");
check(
  sql(counts) === countsBefore,
  "production catalog ledger, receipts, authorization ledger, unit catalog and approver grants unchanged",
);
check(
  sqlErr(`update p37_demo_catalog_events set reason='tampered' where event_type='DEMO_REVOKE';`)
    .length > 0,
  "demo events immutable",
);
sql(`BEGIN;\n${pending("20261108030000_p38_bulk_synthetic_demo.rollback.sql")}\nCOMMIT;`);
check(
  sql("select count(*) from pg_proc where proname like 'p38_demo_%';") === "0" &&
    demoCount("DEMO_ACTIVATE") === "186",
  "rollback removes the batch functions and keeps every event",
);
void termKey;
sql(`drop database if exists ${DB} with (force);`, "postgres");
console.log(`P38 bulk synthetic demo disposable verification: ${count} assertions passed`);
