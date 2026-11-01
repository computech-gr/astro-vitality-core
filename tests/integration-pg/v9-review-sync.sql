-- v9 review sync: RLS / role / append-only scenarios. DISPOSABLE local database only
-- (scripts/verify-v9-review-sync-pg.mjs). Requires fv01-setup.sql fixtures:
--   a2 = ground_medical m1 (mission-wide) · b1 = crew_self m1/c1 · b2 = crew_self m1/c2
--   a3 = researcher m1 · a1 = mission_operator m1 · b4 = crew_self m2/c4 · c4 is not assigned to m1.
\set ON_ERROR_STOP 1
create schema v9t;
grant usage on schema v9t to authenticated, anon;
create function v9t.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlstate;
end $$;
grant execute on function v9t.err(text) to authenticated, anon;
create function v9t.check(ok boolean, name text) returns text language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', name; end if;
  return 'PASS: ' || name;
end $$;
grant execute on function v9t.check(boolean, text) to authenticated, anon;
create function v9t.att(p_id text, p_action text, p_record text, p_actor text, p_reason text default 'Reviewed source evidence ok',
  p_supersedes text default null, p_decided text default '2026-10-20T10:00:00Z') returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_build_object('eventId',p_id,'action',p_action,'recordId',p_record,'recordFingerprint','rfp-0000abcd',
    'metricId','cv-001','badge','cardiovascular','actorUserId',p_actor,'reason',p_reason,'decidedAt',p_decided,'batchId','atb-0000beef',
    'supersedesEventId',p_supersedes))
$$;
grant execute on function v9t.att(text,text,text,text,text,text,text) to authenticated;
create function v9t.status(p jsonb) returns text language sql immutable as $$ select p->0->>'status' $$;
grant execute on function v9t.status(jsonb) to authenticated;

\set GM '00000000-0000-0000-0000-0000000000a2'
\set CREW1 '00000000-0000-0000-0000-0000000000b1'
\set CREW2 '00000000-0000-0000-0000-0000000000b2'
\set RES '00000000-0000-0000-0000-0000000000a3'
\set OP '00000000-0000-0000-0000-0000000000a1'
\set CREW4 '00000000-0000-0000-0000-0000000000b4'

-- Unauthenticated
set role anon;
select v9t.check(v9t.err($q$select public.review_sync_append_v1('m1','c1','synthetic','[]','[]')$q$) = '42501', 'anon cannot call append');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select v9t.check(v9t.err($q$select public.review_sync_append_v1('m1','c1','synthetic','[]','[]')$q$) = '42501', 'no auth.uid() is refused');

-- Ground Medical: insert, duplicate, conflict, actor mismatch
select set_config('request.jwt.claim.sub', :'GM', false);
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','synthetic', v9t.att('att-00000001','attest','obs-1',:'GM'), '[]')) = 'inserted', 'GM attestation inserted');
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','synthetic', v9t.att('att-00000001','attest','obs-1',:'GM'), '[]')) = 'duplicate', 'identical replay is an idempotent duplicate');
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','synthetic', v9t.att('att-00000001','attest','obs-1',:'GM','A different reason text'), '[]')) = 'conflict', 'same id different content is a conflict');
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','synthetic', v9t.att('att-00000002','attest','obs-2',:'CREW1'), '[]')) = 'rejected', 'payload actor must equal auth.uid()');
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','synthetic', v9t.att('att-00000003','attest','obs-3',:'GM','short'), '[]')) = 'rejected', 'reason under 10 characters rejected');
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','synthetic', v9t.att('att-00000004','attest','obs-4',:'GM','Reviewed source evidence ok',null,'2099-01-01T00:00:00Z'), '[]')) = 'rejected', 'future decision time rejected');
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','synthetic', v9t.att('att-00000005','revoke','obs-1',:'GM'), '[]')) = 'rejected', 'revoke without superseded attestation rejected');
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','synthetic', v9t.att('att-00000006','revoke','obs-9',:'GM','Reviewed source evidence ok','att-00000001'), '[]')) = 'rejected', 'revoke of another record rejected');
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','synthetic', v9t.att('att-00000007','revoke','obs-1',:'GM','Source document mismatch','att-00000001','2026-10-21T10:00:00Z'), '[]')) = 'inserted', 'revocation superseding the attestation inserted');
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','synthetic', v9t.att('att-00000008','revoke','obs-1',:'GM','Second revocation try','att-00000007','2026-10-22T10:00:00Z'), '[]')) = 'rejected', 'a revocation cannot be revoked');
select v9t.check(v9t.status(public.review_sync_append_v1('m1','c1','real', v9t.att('att-00000001','attest','obs-1',:'GM'), '[]')) = 'inserted', 'same event id in another provenance is a separate scope');

-- Corrections
select v9t.check(public.review_sync_append_v1('m1','c1','synthetic','[]', jsonb_build_array(jsonb_build_object('intentId','corr-0000000000000001','originalRecordId','obs-1','correctedRecordId','obs-1b','metricId','cv-001','actorUserId',:'GM','reason','Transcription error fixed','decidedAt','2026-10-20T11:00:00Z')))->0->>'status' = 'inserted', 'correction intent inserted');
select v9t.check(public.review_sync_append_v1('m1','c1','synthetic','[]', jsonb_build_array(jsonb_build_object('intentId','corr-0000000000000001','originalRecordId','obs-1','correctedRecordId','obs-1b','metricId','cv-001','actorUserId',:'GM','reason','Transcription error fixed','decidedAt','2026-10-20T11:00:00Z')))->0->>'status' = 'duplicate', 'correction replay is a duplicate');
select v9t.check(public.review_sync_append_v1('m1','c1','synthetic','[]', jsonb_build_array(jsonb_build_object('intentId','corr-0000000000000002','originalRecordId','obs-1','correctedRecordId','obs-1c','metricId','cv-001','actorUserId',:'GM','reason','Another device correction','decidedAt','2026-10-20T12:00:00Z')))->0->>'status' = 'conflict', 'second correction of the same original is a conflict');

-- Scope and role denials
select v9t.check(v9t.err($q$select public.review_sync_append_v1('m2','c4','synthetic','[]','[]')$q$) = '42501', 'GM of m1 cannot write m2');
select v9t.check(v9t.err($q$select public.review_sync_append_v1('m1','c4','synthetic','[]','[]')$q$) = '42501', 'crew not assigned to the mission is refused');
select v9t.check(v9t.err($q$select public.review_sync_append_v1('m1','c1','other','[]','[]')$q$) = '22023', 'invalid provenance refused');
select v9t.check(jsonb_array_length(public.review_sync_list_v1('m1','c1','synthetic','attestation',0,100)) = 2, 'GM lists scope events');
select v9t.check(jsonb_array_length(public.review_sync_list_v1('m1','c1','synthetic','attestation',1,100)) = 1, 'cursor pagination by received_seq');
select v9t.check(v9t.err($q$insert into public.review_sync_attestation_events(mission_id,crew_member_id,provenance,event_id,action,record_id,record_fingerprint,metric_id,badge,reason,decided_at,batch_id,actor_user_id) values ('m1','c1','synthetic','att-0000ffff','attest','x','rfp-00000000','cv-001','cardiovascular','direct insert attempt',now(),'atb-00000000',auth.uid())$q$) = '42501', 'direct insert denied');
select v9t.check(v9t.err($q$update public.review_sync_attestation_events set reason = 'tampered reason text'$q$) = '42501', 'direct update denied');
select v9t.check(v9t.err($q$delete from public.review_sync_attestation_events$q$) = '42501', 'direct delete denied');

select set_config('request.jwt.claim.sub', :'CREW1', false);
select v9t.check(v9t.err($q$select public.review_sync_append_v1('m1','c1','synthetic','[]','[]')$q$) = '42501', 'crew_self cannot append');
select v9t.check(jsonb_array_length(public.review_sync_list_v1('m1','c1','synthetic','attestation',0,100)) = 2, 'crew_self reads own crew events');
select v9t.check(v9t.err($q$select public.review_sync_list_v1('m1','c2','synthetic','attestation',0,100)$q$) = '42501', 'crew_self cannot read another crew member');
select v9t.check((select count(*) from public.review_sync_attestation_events) = 3, 'crew_self direct select limited to own crew (both provenances)');

select set_config('request.jwt.claim.sub', :'CREW2', false);
select v9t.check((select count(*) from public.review_sync_attestation_events) = 0, 'other crew sees no rows via RLS');

select set_config('request.jwt.claim.sub', :'RES', false);
select v9t.check(v9t.err($q$select public.review_sync_append_v1('m1','c1','synthetic','[]','[]')$q$) = '42501', 'researcher cannot append');
select v9t.check(v9t.err($q$select public.review_sync_list_v1('m1','c1','synthetic','attestation',0,100)$q$) = '42501', 'researcher cannot list');
select v9t.check((select count(*) from public.review_sync_attestation_events) = 0, 'researcher sees no rows via RLS');

select set_config('request.jwt.claim.sub', :'OP', false);
select v9t.check(v9t.err($q$select public.review_sync_append_v1('m1','c1','synthetic','[]','[]')$q$) = '42501', 'mission operator cannot append');

select set_config('request.jwt.claim.sub', :'CREW4', false);
select v9t.check((select count(*) from public.review_sync_correction_events) = 0, 'cross-mission crew sees no corrections');
reset role;

-- Append-only even for privileged roles
select v9t.check(v9t.err($q$update public.review_sync_attestation_events set reason = 'superuser tamper text'$q$) = '42501', 'trigger blocks privileged update');
select v9t.check(v9t.err($q$delete from public.review_sync_correction_events$q$) = '42501', 'trigger blocks privileged delete');
select v9t.check(v9t.err($q$truncate public.review_sync_attestation_events$q$) = '42501', 'trigger blocks truncate');
select v9t.check((select count(*) from public.audit_events where action = 'review_sync_appended') >= 3, 'server audit events recorded');
select 'V9 REVIEW SYNC DONE';
