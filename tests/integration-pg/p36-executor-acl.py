"""Disposable-only live-default-ACL reproduction; not hosted platform acceptance."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SOCKET = os.environ.get("P36_DISPOSABLE_SOCKET", "")
if not SOCKET.startswith("/tmp/p36-unified/socket"):
    raise RuntimeError("Explicit disposable socket required; live execution prohibited")
BASE = ["psql", "-h", SOCKET, "-p", "55439", "-U", "lovable", "-X", "-At", "-v", "ON_ERROR_STOP=1"]
DB = "p36_executor_acl"
PENDING = ROOT / "supabase/pending"
FIX = (PENDING / "20261107000002_p36_handoff_executor_insert_remediation.sql").read_text()
ROLLBACK = (PENDING / "20261107000002_p36_handoff_executor_insert_remediation.rollback.sql").read_text()
TABLES = ["p36_dynamic_admission", "p36_dynamic_handoff_submissions", "p36_dynamic_handoff_terms"]
checks = 0


def sql(text, fail=False, db=DB):
    result = subprocess.run(BASE + ["-d", db], input=text, text=True, capture_output=True, cwd=ROOT)
    if (result.returncode == 0) == fail:
        raise AssertionError(result.stderr or "Expected refusal")
    return result.stderr if fail else result.stdout.strip()


def check(condition, message):
    global checks
    if not condition:
        raise AssertionError(message)
    checks += 1


sql(f"drop database if exists {DB} with (force);", db="postgres")
sql(f"create database {DB};", db="postgres")
sql("""
do $$ begin create role sandbox_exec login bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role executor_child inherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
grant sandbox_exec to executor_child;
grant sandbox_exec to lovable;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
revoke create on schema public from public,anon,authenticated,service_role,sandbox_exec;
create table missions(id text primary key);
create table crew_members(id text primary key,display_name text);
create table mission_crew_assignments(mission_id text,crew_member_id text,status text);
create table mission_memberships(mission_id text,user_id uuid,crew_member_id text,role text,active boolean);
insert into missions values('M1'); insert into crew_members values('C1','Disposable Crew');
insert into mission_crew_assignments values('M1','C1','active');
insert into mission_memberships values('M1','00000000-0000-0000-0000-000000000002',null,'ground_medical',true);
alter default privileges for role lovable in schema public grant select,insert on tables to sandbox_exec;
alter default privileges for role lovable in schema public grant select,usage on sequences to sandbox_exec;
create table unrelated_probe(id int);
""")
sql("BEGIN;\n" + (PENDING / "20261107000000_p36_dynamic_handoff.tool.sql").read_text() + "COMMIT;")
baseline = sql("select jsonb_agg(jsonb_build_array(relname,relacl::text) order by relname) from pg_class where relname in ('p36_dynamic_admission','p36_dynamic_handoff_submissions','p36_dynamic_handoff_terms');")
unchanged = """select jsonb_build_object(
'defaults',(select jsonb_agg(to_jsonb(d) order by oid) from pg_default_acl d),
'memberships',(select jsonb_agg(to_jsonb(m) order by member,roleid) from pg_auth_members m),
'functions',(select jsonb_agg(jsonb_build_array(proname,pg_get_functiondef(oid),proacl::text) order by proname) from pg_proc where proname like 'p36_dynamic%'),
'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where tablename like 'p36_dynamic%'),
'rls',(select jsonb_agg(jsonb_build_array(relname,relrowsecurity) order by relname) from pg_class where relname like 'p36_dynamic%' and relkind='r'),
'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgname like 'p36_dynamic%'),
'unrelated',(select relacl::text from pg_class where relname='unrelated_probe'),
'sequence',(select relacl::text from pg_class where relname='p36_dynamic_handoff_submissions_received_seq_seq'),
'rows',(select jsonb_agg(to_jsonb(m)) from mission_memberships m));"""
before = sql(unchanged)
for role in ["sandbox_exec", "executor_child"]:
    for table in TABLES:
        check(sql(f"select has_table_privilege('{role}','{table}','INSERT');") == "t", "Must reproduce direct/inherited INSERT defect")
check("INSERT 0 1" in sql("set role sandbox_exec; insert into p36_dynamic_admission(singleton) values(true);"), "Pre-fix privileged INSERT must execute despite RLS")
check(sql("select not handoff_open and not authorization_open from p36_dynamic_admission;") == "t", "Initial switches not closed")
sql("BEGIN;\n" + FIX + "SELECT 1/0; COMMIT;", True)
check(sql(unchanged) == before, "Failed transaction changed non-target state")
check(sql("select jsonb_agg(jsonb_build_array(relname,relacl::text) order by relname) from pg_class where relname in ('p36_dynamic_admission','p36_dynamic_handoff_submissions','p36_dynamic_handoff_terms');") == baseline, "Failure left partial ACL change")
sql("BEGIN;\n" + FIX + "COMMIT;")
check(sql(unchanged) == before, "Remediation changed unrelated defaults/memberships/RLS/functions/sequence")
for role in ["sandbox_exec", "executor_child", "anon", "authenticated", "service_role"]:
    for table in TABLES:
        for privilege in ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "TRIGGER", "REFERENCES"]:
            check(sql(f"select has_table_privilege('{role}','{table}','{privilege}');") == "f", f"Effective {role}.{table}.{privilege} exposed")
        check(sql(f"select count(*) from pg_attribute where attrelid='{table}'::regclass and attacl is not null;") == "0", "Unexpected column grant")
        for statement in [f"insert into {table} default values;", f"update {table} set " + ("singleton=true;" if table == TABLES[0] else "submission_id=submission_id;"), f"delete from {table};"]:
            check("permission denied" in sql(f"set role {role};" + statement, True), "Direct DML must be denied by effective ACL")
for table in TABLES:
    check(sql(f"select has_table_privilege('sandbox_exec','{table}','SELECT');") == "t", "Platform read lost")
check(sql("select has_sequence_privilege('sandbox_exec','p36_dynamic_handoff_submissions_received_seq_seq','SELECT,USAGE');") == "t", "Sequence privileges changed")
check("permission denied" in sql("set role sandbox_exec;select p36_dynamic_scope('M1','C1',true);", True), "Executor must not access definer helper")
auth = "set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';"
payload = {"schema": "mitochondria.p36-cloud-handoff.v1", "scope": {"missionId": "M1", "crewMemberId": "C1", "provenance": "synthetic"}, "requestId": "ubr-12345678", "scientificStatus": "PENDING_NIKOLAS_REVIEW", "catalogChangeApplied": False, "terms": [{"termId": "ubt-12345678", "originalLabels": ["Disposable term"], "exactUnit": "bpm", "classification": "source_unvalidated", "candidateMetricIds": [], "sourceDocumentSha256": [], "evidencePointers": [], "method": None, "specimen": None}]}
canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
sha = hashlib.sha256(canonical.encode()).hexdigest()
call = f"select p36_dynamic_handoff_append_v1('M1','C1','synthetic','ubr-12345678','{canonical}','{sha}')->>'status';"
check("admission is closed" in sql(auth + call, True), "Definer must retain closed gate")
sql("update p36_dynamic_admission set handoff_open=true;")  # Disposable only.
check(sql(auth + call).endswith("inserted"), "Definer owner must still insert after local admission")
check(sql("select count(*) from p36_dynamic_handoff_terms;") == "1", "Definer term transaction failed")
check("scope unavailable" in sql(auth + "select p36_dynamic_handoff_list_v1('M2','C1','synthetic',0,100);", True), "Scope isolation lost")
sql("update p36_dynamic_admission set handoff_open=false;")
check("admission is closed" in sql(auth + call, True), "Retaining disable failed")
post = sql("select jsonb_agg(jsonb_build_array(relname,relacl::text) order by relname) from pg_class where relname in ('p36_dynamic_admission','p36_dynamic_handoff_submissions','p36_dynamic_handoff_terms');")
sql("BEGIN;\n" + ROLLBACK + "SELECT 1/0;COMMIT;", True)
check(sql("select jsonb_agg(jsonb_build_array(relname,relacl::text) order by relname) from pg_class where relname in ('p36_dynamic_admission','p36_dynamic_handoff_submissions','p36_dynamic_handoff_terms');") == post, "Failed rollback partially restored grants")
sql("BEGIN;\n" + ROLLBACK + "COMMIT;")
check(sql("select jsonb_agg(jsonb_build_array(relname,relacl::text) order by relname) from pg_class where relname in ('p36_dynamic_admission','p36_dynamic_handoff_submissions','p36_dynamic_handoff_terms');") == baseline, "Rollback must restore exact original ACLs")
sql("BEGIN;\n" + FIX + "COMMIT;")
sql("BEGIN;\n" + FIX + "COMMIT;")
check(sql("select not handoff_open and not authorization_open from p36_dynamic_admission;") == "t", "Final local admission not closed")
check(sql("select count(*) from p36_dynamic_handoff_terms;") == "1", "ACL changes lost evidence")
# Future authorization defaults still grant executor INSERT: do not silently claim Step 3 safe.
sql("BEGIN;\n" + (PENDING / "20261107010000_p36_dynamic_authorization.tool.sql").read_text() + "COMMIT;")
for table in ["p36_dynamic_source_validation", "p36_dynamic_authorization_events"]:
    check(sql(f"select has_table_privilege('sandbox_exec','{table}','INSERT');") == "t", "Future Step 3 default ACL blocker not reproduced")
auth_fix_bytes = (PENDING / "20261107010001_p36_authorization_executor_insert_remediation.sql").read_bytes()
check(hashlib.sha256(auth_fix_bytes).hexdigest() == "90d89ad74bf6e5f163a6f2cd1cac14cbc6761d2a235960e325ead539cf2f1d2b", "Exact owner artifact hash changed")
auth_fix = auth_fix_bytes.decode()
auth_rollback = (PENDING / "20261107010001_p36_authorization_executor_insert_remediation.rollback.sql").read_text()
auth_tables = ["p36_dynamic_source_validation", "p36_dynamic_authorization_events"]
auth_acl = "select jsonb_agg(jsonb_build_array(relname,relacl::text) order by relname) from pg_class where relname in ('p36_dynamic_source_validation','p36_dynamic_authorization_events');"
# Representative existing scientific/audit records must survive permission-only work.
sql("create table scientific_dossier_probe(id int, status text); insert into scientific_dossier_probe values(12,'PENDING_NIKOLAS_REVIEW'); create table audit_history_probe(id int, note text); insert into audit_history_probe values(197,'immutable existing evidence');")
preserved = unchanged.replace("'rows',", "'authorization_sequence',(select relacl::text from pg_class where relname='p36_dynamic_authorization_events_received_seq_seq'),'scientific',(select jsonb_agg(to_jsonb(t)) from scientific_dossier_probe t),'audit',(select jsonb_agg(to_jsonb(t)) from audit_history_probe t),'missions',(select jsonb_agg(to_jsonb(t)) from missions t),'rows',")
pre_auth = sql(preserved)
pre_acl = sql(auth_acl)
sql("BEGIN;\n" + auth_fix + "SELECT 1/0;COMMIT;", True)
check(sql(auth_acl) == pre_acl, "Failed auth remediation changed ACL")
sql("BEGIN;\n" + auth_fix + "COMMIT;")
check(sql(preserved) == pre_auth, "Auth remediation affected existing grants/data/functions/RLS/triggers")
for table in auth_tables:
    for role in ["sandbox_exec", "executor_child", "anon", "authenticated", "service_role"]:
        for privilege in ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]:
            check(sql(f"select has_table_privilege('{role}','{table}','{privilege}');") == "f", "Auth effective direct write remains")
        for statement in [f"insert into {table} default values;", f"update {table} set provenance=provenance;", f"delete from {table};"]:
            check("permission denied" in sql(f"set role {role};" + statement, True), "Auth direct DML permitted")
    check(sql(f"select has_table_privilege('sandbox_exec','{table}','SELECT');") == "t", "Auth read grant lost")
    check(sql(f"select count(*) from pg_attribute where attrelid='{table}'::regclass and attacl is not null;") == "0", "Auth column write grant")
check(sql(auth + "select p36_dynamic_auth_list_v1('M1','C1','synthetic',0,100);").endswith("[]"), "Scoped auth read broken")
rpc = "select p36_dynamic_auth_append_v1('M1','C1','synthetic','00000000-0000-0000-0000-000000000004','{}',encode(sha256(convert_to('{}','UTF8')),'hex'));"
check("admission is closed" in sql(auth + rpc, True), "Auth closed admission broken")
check("permission denied" in sql("set role sandbox_exec;" + rpc, True), "Executor gained auth RPC")
post_acl = sql(auth_acl)
sql("BEGIN;\n" + auth_rollback + "SELECT 1/0;COMMIT;", True)
check(sql(auth_acl) == post_acl, "Auth rollback failure changed grants")
sql("BEGIN;\n" + auth_rollback + "COMMIT;")
check(sql(auth_acl) == pre_acl, "Auth rollback not exact ACL restoration")
sql("BEGIN;\n" + auth_fix + "COMMIT;")
sql("BEGIN;\n" + auth_fix + "COMMIT;")
check(sql(preserved) == pre_auth, "Auth replay changed non-target state")
check(sql("select not handoff_open and not authorization_open from p36_dynamic_admission;") == "t", "Auth validation left admission open")
print(f"PASS: {checks} disposable ACL/inheritance/DML/definer/transaction/rollback assertions. No live execution or platform compatibility attestation.")