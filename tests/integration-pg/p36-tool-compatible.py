"""Socket-only equivalence/failure tests. Never uses managed PG connection defaults."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SOCKET = os.environ.get("P36_DISPOSABLE_SOCKET", "")
if not SOCKET.startswith("/tmp/p36-unified/socket"):
    raise RuntimeError("Explicit disposable socket required; live execution prohibited")
BASE = ["psql", "-h", SOCKET, "-p", "55439", "-U", "lovable", "-X", "-At", "-v", "ON_ERROR_STOP=1"]
NAMES = ["20261107000000_p36_dynamic_handoff", "20261107010000_p36_dynamic_authorization", "20261107020000_p36_authorized_crew_roster"]
PENDING = ROOT / "supabase/pending"
INIT = (PENDING / "20261107000001_p36_closed_admission.initialize.sql").read_text()
checks = 0

def sql(db, text, fail=False):
    result = subprocess.run(BASE + ["-d", db], input=text, text=True, capture_output=True, cwd=ROOT)
    if (result.returncode == 0) == fail:
        raise AssertionError(result.stderr or "Expected refusal")
    return result.stderr if fail else result.stdout.strip()

def check(condition, message):
    global checks
    if not condition:
        raise AssertionError(message)
    checks += 1

def statements(text):
    # PostgreSQL lexical boundaries: semicolons inside bodies/strings are not statements.
    token = re.compile(r"--[^\n]*|/\*[\s\S]*?\*/|\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|;", re.M)
    start = 0
    position = 0
    while True:
        match = token.search(text, position)
        if match is None:
            break
        value = match.group()
        if value.startswith("$"):
            end = text.find(value, match.end())
            if end < 0:
                raise AssertionError("Unclosed body")
            position = end + len(value)
            continue
        position = match.end()
        if value == ";":
            yield text[start:position]
            start = position
    if text[start:].strip():
        yield text[start:]

SETUP = """
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
revoke create on schema public from public,anon,authenticated,service_role;
create table missions(id text primary key);
create table crew_members(id text primary key,display_name text);
create table mission_crew_assignments(mission_id text,crew_member_id text,status text);
create table mission_memberships(mission_id text,user_id uuid,crew_member_id text,role text,active boolean);
insert into missions values('M1'); insert into crew_members values('C1','Synthetic Crew');
insert into mission_crew_assignments values('M1','C1','active');
insert into mission_memberships values('M1','00000000-0000-0000-0000-000000000002',null,'ground_medical',true);
"""
SNAPSHOT = """
select jsonb_build_object(
'relations',(select jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),c.relacl::text) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and a.attnum>0 and not a.attisdropped and c.relkind='r'),
'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid)) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
'functions',(select jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl::text) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'p36_dynamic%'),
'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),
'indexes',(select jsonb_agg(jsonb_build_array(indexname,indexdef) order by indexname) from pg_indexes where schemaname='public'),
'base_rows',jsonb_build_array((select jsonb_agg(to_jsonb(t)) from missions t),(select jsonb_agg(to_jsonb(t)) from crew_members t),(select jsonb_agg(to_jsonb(t)) from mission_memberships t),(select jsonb_agg(to_jsonb(t)) from mission_crew_assignments t)));
"""

for db in ["p36_tool_original", "p36_tool_candidate"]:
    sql("postgres", f"drop database if exists {db} with (force); create database {db};")
    sql(db, SETUP)

original = "p36_tool_original"
candidate = "p36_tool_candidate"
for i, name in enumerate(NAMES):
    source = (PENDING / (name + ".sql")).read_text()
    replacement = (PENDING / (name + ".tool.sql")).read_text()
    expected = source.replace("\nbegin;\n", "\n", 1)
    expected = expected[:expected.rfind("commit;")]
    if i == 0:
        expected = expected.replace(INIT, "", 1)
    check(replacement == expected, f"Unexpected semantic edit: {name}")
    parts = list(statements(replacement))
    check(not any(re.sub(r"--[^\n]*", "", p).strip().lower() in ("begin;", "commit;") for p in parts), "Top-level wrapper remains")
    before = sql(candidate, SNAPSHOT)
    # Force failure after EVERY installation statement, including grants and final statements.
    for boundary in range(1, len(parts) + 1):
        error = sql(candidate, "BEGIN;\n" + "\n".join(parts[:boundary]) + "\nSELECT 1/0;\nCOMMIT;", True)
        check("division by zero" in error, f"Unexpected failure at {name}:{boundary}")
        check(sql(candidate, SNAPSHOT) == before, f"Partial objects survived {name}:{boundary}")
    sql(original, source)
    sql(candidate, "BEGIN;\n" + replacement + "\nCOMMIT;")
    if i == 0:
        check(sql(candidate, "select count(*) from p36_dynamic_admission;") == "0", "Initialization silently seeded")
        denied = "set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'; select p36_dynamic_handoff_append_v1('M1','C1','synthetic','ubr-12345678','{}','x');"
        check("admission is closed" in sql(candidate, denied, True), "Missing row admitted writes")
        sql(candidate, "BEGIN;\n" + INIT + "SELECT 1/0; COMMIT;", True)
        check(sql(candidate, "select count(*) from p36_dynamic_admission;") == "0", "Failed initialization left a row")
        check("permission denied" in sql(candidate, "set role authenticated;" + INIT, True), "Caller initialized admission")
        sql(candidate, INIT)
        check(sql(candidate, "select singleton and not handoff_open and not authorization_open and change_note='initial: closed' from p36_dynamic_admission;") == "t", "Initial state differs")
        sql(candidate, INIT, True)
        check(sql(candidate, "select count(*) from p36_dynamic_admission;") == "1", "Replay changed singleton")
    check(sql(candidate, SNAPSHOT) == sql(original, SNAPSHOT), f"Catalog/ACL/RLS/history/base-row equivalence failed: {name}")
    check(sql(candidate, "select not handoff_open and not authorization_open from p36_dynamic_admission;") == "t", "Admission opened")

check(sql(candidate, "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'p36_dynamic%' and pg_get_userbyid(p.proowner)<>'lovable';") == "0", "Unexpected function owner")
check(sql(candidate, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'p36_dynamic%' and c.relkind='r' and not c.relrowsecurity;") == "0", "RLS disabled")
check(sql(candidate, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'p36_dynamic%' and c.relkind='r' and (has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'));") == "0", "Direct table privileges exposed")
# Nonempty receipt blocks the original authorization rollback without losing its data.
sql(candidate, "insert into p36_dynamic_source_validation values('M1','C1','synthetic','test','" + "a" * 64 + "','cv-001','bpm','synthetic','synthetic','synthetic','v1','test-only','disposable',now());")
before = sql(candidate, SNAPSHOT)
check("Rollback refused" in sql(candidate, (PENDING / (NAMES[1] + ".rollback.sql")).read_text(), True), "Nonempty rollback accepted")
check(sql(candidate, "select count(*) from p36_dynamic_source_validation;") == "1", "Rollback lost receipt")
check(sql(candidate, SNAPSHOT) == before, "Refused rollback altered schema")
# Original DB stays empty: dependency guard then full successful reverse-order rollback.
check("Rollback refused" in sql(original, (PENDING / (NAMES[0] + ".rollback.sql")).read_text(), True), "Out-of-order rollback accepted")
for name in reversed(NAMES):
    sql(original, (PENDING / (name + ".rollback.sql")).read_text())
check(sql(original, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'p36_dynamic%';") == "0", "Rollback left tables")
check(sql(original, "select count(*) from missions;") == "1", "Rollback touched original missions")
print(f"PASS: {checks} replacement equivalence/failure/ACL/RLS/ownership/closed-state/rollback assertions. Local transaction emulation, not live tool execution or real-auth acceptance.")