// P36 scientific authorization verifier against REAL SQL (pending migration in a DISPOSABLE local
// server) and the REAL server core. Refuses managed PG* variables; never touches the project DB.
// Applies: stubs -> committed migrations -> ONLY the pending P36 authorization file -> fixtures ->
// scenarios (server core + forged direct RPC calls) -> rollback refusal and clean rollback.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../src/domain/health-intelligence/observation-envelope";
import {
  authorizationContext,
  buildAuthorizationPayload,
  buildAuthorizationView,
  sha256Hex,
  type AuthorizationLedgerRow,
  type SubmissionInput,
} from "../src/domain/health-intelligence/p36-scientific-authorization";
import { listAuthorizationCore, submitAuthorizationCore, type AuthorizationDeps } from "../src/lib/p36-scientific-authorization.server";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["FV01_PG_SOCKET_DIR"];
if (!socket) {
  console.log("P36 scientific authorization PostgreSQL verification: SKIPPED (set FV01_PG_SOCKET_DIR to a disposable local server)");
  process.exit(0);
}
const port = process.env["FV01_PG_PORT"] ?? "55432";
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const base = ["-h", socket, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-X"];
const DB = "p36_sci_auth_it";
const MIG = "supabase/pending/20261104000000_p36_scientific_authorization.sql";
const RB = "supabase/pending/20261104000000_p36_scientific_authorization.rollback.sql";
const psql = (args: string[], d = "postgres", input?: string) => execFileSync("psql", [...base, "-d", d, ...args], { env, encoding: "utf8", cwd: root, input });

psql(["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`]);
psql(["-c", `alter database ${DB} set search_path = public, extensions`]);
psql(["-f", "tests/integration-pg/stub.sql"], DB);
for (const f of readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) psql(["-f", join("supabase/migrations", f)], DB);
psql(["-f", MIG], DB);
psql(["-f", "tests/integration-pg/fv01-setup.sql"], DB);

const GM = "00000000-0000-0000-0000-0000000000a2";
const RES = "00000000-0000-0000-0000-0000000000a3";
const RES2 = "00000000-0000-0000-0000-0000000000a9";
const OP = "00000000-0000-0000-0000-0000000000a1";
const CREW = "00000000-0000-0000-0000-0000000000b1";
psql(["-c", `insert into auth.users(id) values ('${RES2}'); insert into public.mission_memberships(mission_id,user_id,crew_member_id,role,active) values ('m1','${RES2}',null,'researcher',true);`], DB);

function call(uid: string, fn: string, args: string[], role = "authenticated"): { data: unknown; error: { code?: string } | null } {
  const vars = args.flatMap((a, i) => ["-v", `a${i}=${a}`]);
  const placeholders = args.map((_, i) => `:'a${i}'`).join(",");
  const sql = `\\set ON_ERROR_STOP 1\n\\set VERBOSITY verbose\nset role ${role};\nselect set_config('request.jwt.claim.sub', '${uid}', false);\n\\t on\n\\a\nselect public.${fn}(${placeholders})::text;\n`;
  try {
    const out = execFileSync("psql", [...base, "-d", DB, ...vars, "-f", "-"], { env, encoding: "utf8", input: sql });
    return { data: JSON.parse(out.trim().split("\n").filter(Boolean).at(-1) ?? "null"), error: null };
  } catch (e) {
    const stderr = String((e as { stderr?: string }).stderr ?? "");
    const code = /ERROR:\s+([0-9A-Z]{5}):/.exec(stderr)?.[1] ?? "XX000";
    return { data: null, error: { code } };
  }
}
const deps = (uid: string): AuthorizationDeps => ({
  userId: uid,
  now: () => new Date().toISOString(),
  rpc: async (fn, a) =>
    fn === "p36_sci_auth_list_v1"
      ? call(uid, fn, [String(a["p_mission_id"]), String(a["p_after_seq"]), String(a["p_limit"])])
      : call(uid, fn, [String(a["p_mission_id"]), String(a["p_submission_id"]), String(a["p_payload_canonical"]), String(a["p_payload_sha256"])]),
});

let passes = 0;
function check(ok: boolean, name: string) {
  if (!ok) throw new Error(`FAIL: ${name}`);
  passes += 1;
  console.log(`PASS: ${name}`);
}

const ctx = await authorizationContext();
const term = (label: string) => ctx.dossiers.find((d) => d.sourceLabel === label)!;
const UCA = term("Urinary Calcium 24h");
const VITD = term("25(OH) Vitamin D");
const PVT = term("PVT_MEDIAN_RT");
const CRP = term("IMM-007");

const fields = (d: typeof UCA, over: Partial<SubmissionInput> = {}): SubmissionInput & { actorRole: "ground_medical" | "researcher" } => ({
  termId: d.termId,
  kind: "recommendation",
  action: "RECOMMEND",
  actorRole: "ground_medical",
  authorityMissionId: "m1",
  submissionId: crypto.randomUUID(),
  canonicalCatalogId: d.candidateCatalogIds[0]!,
  domain: d.candidateCatalogIds[0]!.startsWith("bone") ? "bone_health" : d.candidateCatalogIds[0]!.startsWith("IMM") ? "immune" : "behavioral",
  specimenOrAcquisitionContext: "24-hour urine collection",
  methodOrInstrument: "Colorimetric assay on automated analyzer",
  protocol: "Synthetic test protocol A",
  protocolVersion: "v1.0",
  validatedUnit: d.sourceUnit,
  sourceRefs: [`handoff:${d.termId}`],
  validationEvidenceRefs: [],
  rationale: "Synthetic verifier recommendation with exact source unit text.",
  reviewerName: "Synthetic Recommender",
  reviewerQualification: "Synthetic test qualification",
  conflictOfInterestDeclaration: "",
  independenceConfirmed: false,
  recommendationEventId: null,
  supersedesEventId: null,
  ...over,
});
const decision = (d: typeof UCA, action: "APPROVE" | "REJECT" | "REQUEST_MORE_EVIDENCE", over: Partial<SubmissionInput> = {}) =>
  fields(d, {
    kind: "decision",
    action,
    rationale: "Independent synthetic verifier decision with cited evidence.",
    reviewerName: "Synthetic Researcher",
    reviewerQualification: "Synthetic PhD placeholder for tests",
    conflictOfInterestDeclaration: "No conflict of interest declared (synthetic test).",
    independenceConfirmed: true,
    validationEvidenceRefs: action === "APPROVE" ? ["doi:10.0000/synthetic-validation"] : [],
    ...over,
  });
const status = (r: unknown) => (r as { ok: boolean; status?: string; code?: string }).ok ? (r as { status: string }).status : `fail:${(r as { code: string }).code}`;

// --- unauthenticated / wrong roles
check(call("", "p36_sci_auth_list_v1", ["m1", "0", "100"]).error?.code === "42501", "no auth.uid() cannot list");
check(call("", "p36_sci_auth_list_v1", ["m1", "0", "100"], "anon").error?.code === "42501", "anon cannot list");
check(call(CREW, "p36_sci_auth_list_v1", ["m1", "0", "100"]).error?.code === "42501", "crew_self cannot list");
check(status(await submitAuthorizationCore(deps(OP), fields(UCA, { actorRole: "ground_medical" }))) === "fail:forbidden", "mission operator cannot recommend");
check(status(await submitAuthorizationCore(deps(CREW), fields(UCA, { actorRole: "researcher" }))) === "fail:forbidden", "crew_self cannot claim researcher");

// --- recommendation by Ground Medical
const gmRec = fields(UCA);
const rec = await submitAuthorizationCore(deps(GM), gmRec);
check(status(rec) === "inserted", "Ground Medical recommendation inserted");
const recId = (rec as { eventId: string }).eventId;
check(status(await submitAuthorizationCore(deps(GM), gmRec)) === "duplicate", "recommendation retry is an idempotent duplicate");

// --- Ground Medical cannot decide
const gmDec = await submitAuthorizationCore(deps(GM), decision(UCA, "REJECT"));
check(status(gmDec) === "fail:forbidden", "Ground Medical cannot record a final decision (server core)");
check(status(await submitAuthorizationCore(deps(GM), decision(UCA, "APPROVE", { recommendationEventId: recId }))).startsWith("fail:"), "Ground Medical cannot approve (server core)");
{
  const p = buildAuthorizationPayload(decision(UCA, "APPROVE", { recommendationEventId: recId }), { userId: GM, role: "researcher", now: new Date().toISOString() }, ctx);
  const c = canonicalJson(p);
  check(call(GM, "p36_sci_auth_append_v1", ["m1", p.submissionId, c, await sha256Hex(c)]).error?.code === "42501", "forged direct Ground Medical decision refused by the database");
}

// --- self approval
const resRec = fields(UCA, { actorRole: "researcher" });
const ownRec = await submitAuthorizationCore(deps(RES), resRec);
check(status(ownRec) === "inserted", "researcher recommendation inserted");
const ownRecId = (ownRec as { eventId: string }).eventId;
const self = await submitAuthorizationCore(deps(RES), decision(UCA, "APPROVE", { recommendationEventId: ownRecId }));
check(status(self) === "fail:invalid" && /Self-approval/.test((self as { message: string }).message), "self-approval rejected (server core)");
{
  const p = buildAuthorizationPayload(decision(UCA, "APPROVE", { recommendationEventId: ownRecId }), { userId: RES, role: "researcher", now: new Date().toISOString() }, ctx);
  const c = canonicalJson(p);
  const r = call(RES, "p36_sci_auth_append_v1", ["m1", p.submissionId, c, await sha256Hex(c)]);
  check((r.data as { status: string; detail: string })?.status === "rejected" && /self-approval/.test((r.data as { detail: string }).detail), "forged direct self-approval rejected by the database");
}

// --- validation failures
const bad = async (name: string, input: SubmissionInput & { actorRole: "researcher" | "ground_medical" }, re: RegExp) => {
  const r = await submitAuthorizationCore(deps(RES), input);
  check(status(r) === "fail:invalid" && re.test((r as { message: string }).message), name);
};
await bad("missing protocol version rejected", decision(UCA, "APPROVE", { recommendationEventId: recId, protocolVersion: null }), /protocol version/);
await bad("placeholder method rejected", decision(UCA, "APPROVE", { recommendationEventId: recId, methodOrInstrument: "unknown" }), /method/);
await bad("unit mismatch rejected", decision(UCA, "APPROVE", { recommendationEventId: recId, validatedUnit: "mg/day" }), /exact source unit/);
await bad("conflicting domain rejected", fields(VITD, { actorRole: "researcher", canonicalCatalogId: "bone-019", domain: "immune" }), /contradicts the catalog domain/);
await bad("non-candidate identity rejected", fields(VITD, { actorRole: "researcher", canonicalCatalogId: "bone-001", domain: "bone_health" }), /not a candidate/);
await bad("hsCRP mapped to CRP rejected", fields(CRP, { actorRole: "researcher", domain: "immune", methodOrInstrument: "hs-CRP immunoturbidimetric" }), /High-sensitivity CRP/);
await bad("missing validation evidence rejected", decision(UCA, "APPROVE", { recommendationEventId: recId, validationEvidenceRefs: [] }), /Validation evidence/);
await bad("missing independence rejected", decision(UCA, "REJECT", { independenceConfirmed: false }), /independent/);
await bad("approval without recommendation rejected", decision(UCA, "APPROVE", { recommendationEventId: null }), /reference a recorded recommendation/);
await bad("diagnosis wording rejected", decision(UCA, "REJECT", { rationale: "Rejected because it supports a diagnosis of disease." }), /diagnoses/);
{
  const pvtRec = await submitAuthorizationCore(deps(GM), fields(PVT, { domain: "behavioral" }));
  check(status(pvtRec) === "inserted", "PVT recommendation inserted");
  await bad(
    "unvalidated PVT protocol approval without primary validation rejected",
    decision(PVT, "APPROVE", { domain: "behavioral", recommendationEventId: (pvtRec as { eventId: string }).eventId, validationEvidenceRefs: ["doc:synthetic internal note"] }),
    /explicitly unvalidated/,
  );
}

// --- independent approval, retry, stale, supersession
const approval = decision(UCA, "APPROVE", { recommendationEventId: recId });
const ap = await submitAuthorizationCore(deps(RES), approval);
check(status(ap) === "inserted", "independent researcher approval inserted");
const apId = (ap as { eventId: string }).eventId;
check(status(await submitAuthorizationCore(deps(RES), approval)) === "duplicate", "approval retry is an idempotent duplicate");
await bad("second decision without supersession is stale", decision(UCA, "REJECT"), /Stale decision/);
{
  const p = buildAuthorizationPayload(decision(UCA, "REJECT"), { userId: RES2, role: "researcher", now: new Date().toISOString() }, ctx);
  const c = canonicalJson(p);
  check((call(RES2, "p36_sci_auth_append_v1", ["m1", p.submissionId, c, await sha256Hex(c)]).data as { status: string }).status === "stale", "forged non-superseding decision is stale in the database");
  const wrong = "0".repeat(63) + "1";
  check(call(RES2, "p36_sci_auth_append_v1", ["m1", crypto.randomUUID(), c, wrong]).error?.code === "22023", "payload digest mismatch refused");
}
const more = await submitAuthorizationCore(deps(RES2), decision(UCA, "REQUEST_MORE_EVIDENCE", { supersedesEventId: apId }));
check(status(more) === "inserted", "second researcher supersedes with request for more evidence");

// --- views and isolation
const listed = await listAuthorizationCore(deps(RES), "m1");
check(listed.ok && listed.rows.length === 5, "researcher lists the 5 mission events");
const gmList = await listAuthorizationCore(deps(GM), "m1");
check(gmList.ok && gmList.rows.length === 5, "Ground Medical reads the same history");
check((await listAuthorizationCore(deps(RES), "m3")).ok && ((await listAuthorizationCore(deps(RES), "m3")) as { rows: unknown[] }).rows.length === 0, "mission isolation: m3 has no m1 events");
check(status(await listAuthorizationCore(deps(GM), "m3")) === "fail:forbidden", "Ground Medical of m1 cannot read m3");
const rows = (listed as { rows: AuthorizationLedgerRow[] }).rows;
const view = await buildAuthorizationView(rows, "m1");
const uca = view.terms.find((t) => t.termId === UCA.termId)!;
check(uca.integrity === "VERIFIED" && uca.scientificStatus === "MORE_EVIDENCE_REQUIRED" && uca.history.length === 4, "latest superseding decision determines status; full history retained");
check(view.counts.ACTIVE === 0 && view.counts.ACTIVATION_BLOCKED === 12, "no term is active; every term activation-blocked");
check(view.counts.PENDING_NIKOLAS_REVIEW === 11, "all other terms remain pending");
const tampered = rows.map((r) => (r.event_id === apId ? { ...r, payload_canonical: r.payload_canonical.replace("Synthetic Researcher", "Forged Reviewer") } : r));
check((await buildAuthorizationView(tampered, "m1")).terms.find((t) => t.termId === UCA.termId)!.integrity === "FAILED", "tampered row fails verification (fail closed)");
check((await buildAuthorizationView(rows, "m3")).terms.every((t) => t.history.length === 0), "rows from another mission are never accepted");

// --- append-only
const sqlErr = (sql: string, role = "postgres") => {
  try {
    psql(["-c", role === "postgres" ? sql : `set role ${role}; ${sql}`], DB);
    return "ok";
  } catch {
    return "error";
  }
};
check(sqlErr("update public.p36_scientific_authorization_events set action = 'APPROVE'") === "error", "privileged update blocked");
check(sqlErr("delete from public.p36_scientific_authorization_events") === "error", "privileged delete blocked");
check(sqlErr("truncate public.p36_scientific_authorization_events") === "error", "truncate blocked");
check(sqlErr("insert into public.p36_scientific_authorization_events(authority_mission_id) values ('m1')", "authenticated") === "error", "direct authenticated insert denied");

// --- rollback
let refused = false;
try {
  psql(["-f", RB], DB);
} catch {
  refused = true;
}
check(refused, "rollback refuses while audit rows exist");
psql(["-f", "-"], DB, `begin;\nset local p36_sci_auth.allow_destructive_rollback = 'on';\n\\i ${RB}\ncommit;\n`);
check(psql(["-t", "-A", "-c", "select count(*) from pg_proc where proname like 'p36_sci_auth%'"], DB).trim() === "0" && psql(["-t", "-A", "-c", "select to_regclass('public.p36_scientific_authorization_events') is null"], DB).trim() === "t", "explicit rollback removes only its objects");
console.log(`P36 scientific authorization PostgreSQL verification: ${passes} PASS`);
