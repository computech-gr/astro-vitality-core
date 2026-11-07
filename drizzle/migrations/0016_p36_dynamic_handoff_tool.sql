-- PENDING: development only; owner-authorized production application is separate.
-- Atomic submission header + immutable term children. No clinical payloads.
create table public.p36_dynamic_handoff_submissions (
  submission_id uuid primary key default gen_random_uuid(),
  mission_id text not null references public.missions(id),
  crew_member_id text not null references public.crew_members(id),
  provenance text not null check (provenance in ('synthetic','real')),
  request_id text not null check (request_id ~ '^ubr-[0-9a-f]{8}$'),
  submitted_by uuid not null,
  submitted_role text not null check (submitted_role in ('crew_self','ground_medical')),
  payload_canonical text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default clock_timestamp(),
  received_seq bigint generated always as identity unique,
  unique (submitted_by, mission_id, crew_member_id, provenance, request_id)
);
revoke all on public.p36_dynamic_handoff_submissions from public, anon, authenticated, service_role;
grant select on public.p36_dynamic_handoff_submissions to service_role;
alter table public.p36_dynamic_handoff_submissions enable row level security;

create table public.p36_dynamic_handoff_terms (
  submission_id uuid not null references public.p36_dynamic_handoff_submissions(submission_id),
  term_id text not null check (term_id ~ '^ubt-[0-9a-f]{8}$'),
  metadata jsonb not null,
  primary key (submission_id, term_id)
);
revoke all on public.p36_dynamic_handoff_terms from public, anon, authenticated, service_role;
grant select on public.p36_dynamic_handoff_terms to service_role;
alter table public.p36_dynamic_handoff_terms enable row level security;
-- No direct application SELECT policies: all access uses caller-scoped RPCs.

-- Database-level admission control (retaining disable). Closed by default:
-- granting EXECUTE never admits writes on its own, independent of app flags.
-- Only the trusted schema owner may open/close admission with plain SQL;
-- closing never deletes or rewrites any record, and list RPCs stay readable
-- so preserved evidence remains reviewable.
create table public.p36_dynamic_admission (
  singleton boolean primary key default true check (singleton),
  handoff_open boolean not null default false,
  authorization_open boolean not null default false,
  changed_at timestamptz not null default clock_timestamp(),
  change_note text not null default 'initial: closed'
);
revoke all on public.p36_dynamic_admission from public, anon, authenticated, service_role;
grant select on public.p36_dynamic_admission to service_role;
alter table public.p36_dynamic_admission enable row level security;
create function public.p36_dynamic_admission_reject_delete() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'p36 admission row cannot be removed; close admission instead' using errcode='42501'; end $$;
create trigger p36_dynamic_admission_no_delete before delete on public.p36_dynamic_admission for each row execute function public.p36_dynamic_admission_reject_delete();
create trigger p36_dynamic_admission_no_truncate before truncate on public.p36_dynamic_admission for each statement execute function public.p36_dynamic_admission_reject_delete();

create function public.p36_dynamic_scope(p_mission text, p_crew text, p_write boolean)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.mission_crew_assignments where mission_id=p_mission and crew_member_id=p_crew and status='active') then
    raise exception 'scope unavailable' using errcode='42501'; end if;
  select m.role into v_role from public.mission_memberships m
    where m.mission_id=p_mission and m.user_id=auth.uid() and m.active
    and (m.crew_member_id=p_crew or (m.crew_member_id is null and m.role in ('ground_medical','researcher')))
    and (case when p_write then m.role in ('crew_self','ground_medical') else m.role in ('crew_self','ground_medical','researcher') end)
    order by case m.role when 'ground_medical' then 0 when 'researcher' then 1 else 2 end limit 1;
  if v_role is null then raise exception 'scope denied' using errcode='42501'; end if;
  return v_role;
end $$;

create function public.p36_dynamic_reject_mutation() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'dynamic handoff is immutable' using errcode='42501'; end $$;
create trigger p36_dynamic_header_immutable before update or delete on public.p36_dynamic_handoff_submissions for each row execute function public.p36_dynamic_reject_mutation();
create trigger p36_dynamic_header_no_truncate before truncate on public.p36_dynamic_handoff_submissions for each statement execute function public.p36_dynamic_reject_mutation();
create trigger p36_dynamic_term_immutable before update or delete on public.p36_dynamic_handoff_terms for each row execute function public.p36_dynamic_reject_mutation();
create trigger p36_dynamic_term_no_truncate before truncate on public.p36_dynamic_handoff_terms for each statement execute function public.p36_dynamic_reject_mutation();

create function public.p36_dynamic_handoff_append_v1(p_mission_id text,p_crew_member_id text,p_provenance text,p_request_id text,p_payload_canonical text,p_payload_sha256 text)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare v_role text; v_p jsonb; v_t jsonb; v_row public.p36_dynamic_handoff_submissions; v_key text; v_n int;
begin
  if not coalesce((select a.handoff_open from public.p36_dynamic_admission a where a.singleton), false) then
    raise exception 'p36 dynamic handoff admission is closed' using errcode='55000'; end if;
  v_role := public.p36_dynamic_scope(p_mission_id,p_crew_member_id,true);
  -- Serialize with concurrent revocation: lock the authorizing rows, re-evaluated after any in-flight change.
  perform 1 from public.mission_crew_assignments where mission_id=p_mission_id and crew_member_id=p_crew_member_id and status='active' for share;
  if not found then raise exception 'scope unavailable' using errcode='42501'; end if;
  perform 1 from public.mission_memberships m where m.mission_id=p_mission_id and m.user_id=auth.uid() and m.active and m.role=v_role
    and (m.crew_member_id=p_crew_member_id or (m.crew_member_id is null and m.role='ground_medical')) for share;
  if not found then raise exception 'scope denied' using errcode='42501'; end if;
  if p_provenance not in ('synthetic','real') or p_request_id !~ '^ubr-[0-9a-f]{8}$' or octet_length(p_payload_canonical) not between 2 and 1048576 then raise exception 'invalid metadata' using errcode='22023'; end if;
  if encode(sha256(convert_to(p_payload_canonical,'UTF8')),'hex') is distinct from p_payload_sha256 then raise exception 'digest mismatch' using errcode='22023'; end if;
  v_p := p_payload_canonical::jsonb;
  if jsonb_typeof(v_p) is distinct from 'object' or v_p->>'schema' is distinct from 'mitochondria.p36-cloud-handoff.v1' or
     v_p->'scope' is distinct from jsonb_build_object('missionId',p_mission_id,'crewMemberId',p_crew_member_id,'provenance',p_provenance) or
     v_p->>'requestId' is distinct from p_request_id or v_p->>'scientificStatus' is distinct from 'PENDING_NIKOLAS_REVIEW' or v_p->'catalogChangeApplied' is distinct from 'false'::jsonb then raise exception 'invalid scope or status' using errcode='22023'; end if;
  for v_key in select jsonb_object_keys(v_p) loop
    if v_key not in ('schema','scope','requestId','terms','scientificStatus','catalogChangeApplied') then raise exception 'unexpected payload field' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(v_p->'terms') is distinct from 'array' then raise exception 'terms required' using errcode='22023'; end if;
  v_n := jsonb_array_length(v_p->'terms');
  if v_n not between 1 and 1000 then raise exception 'term limit' using errcode='22023'; end if;
  for v_t in select value from jsonb_array_elements(v_p->'terms') loop
    if not (v_t ?& array['termId','originalLabels','exactUnit','classification','candidateMetricIds','sourceDocumentSha256','evidencePointers','method','specimen']) then raise exception 'required metadata missing' using errcode='22023'; end if;
    if jsonb_typeof(v_t) is distinct from 'object' or v_t->>'termId' !~ '^ubt-[0-9a-f]{8}$' or v_t->'method' is distinct from 'null'::jsonb or v_t->'specimen' is distinct from 'null'::jsonb or
       v_t->>'classification' not in ('unclassified','ambiguous','unit_review_required','source_unvalidated') or jsonb_typeof(v_t->'exactUnit') is distinct from 'string' or char_length(v_t->>'exactUnit')>64 then raise exception 'invalid term' using errcode='22023'; end if;
    for v_key in select jsonb_object_keys(v_t) loop
      if v_key not in ('termId','originalLabels','exactUnit','classification','candidateMetricIds','sourceDocumentSha256','evidencePointers','method','specimen') then raise exception 'clinical or unknown term field' using errcode='22023'; end if;
    end loop;
    foreach v_key in array array['originalLabels','candidateMetricIds','sourceDocumentSha256','evidencePointers'] loop
      if jsonb_typeof(v_t->v_key) is distinct from 'array' or jsonb_array_length(v_t->v_key)>1000 then raise exception 'invalid metadata array' using errcode='22023'; end if;
      if exists(select 1 from jsonb_array_elements(v_t->v_key) e where jsonb_typeof(e) <> 'string') then raise exception 'invalid metadata item' using errcode='22023'; end if;
    end loop;
    if jsonb_array_length(v_t->'originalLabels') not between 1 and 20 or exists(select 1 from jsonb_array_elements_text(v_t->'originalLabels') e where char_length(e) not between 1 and 300) then raise exception 'label limit' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements_text((v_t->'sourceDocumentSha256') || (v_t->'evidencePointers')) e where e !~ '^[0-9a-f]{64}$') then raise exception 'opaque fingerprints required' using errcode='22023'; end if;
  end loop;
  if (select count(distinct t->>'termId') from jsonb_array_elements(v_p->'terms') t) <> v_n then raise exception 'duplicate terms' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext('p36handoff|'||auth.uid()::text||'|'||p_mission_id||'|'||p_crew_member_id||'|'||p_provenance||'|'||p_request_id));
  select * into v_row from public.p36_dynamic_handoff_submissions where submitted_by=auth.uid() and mission_id=p_mission_id and crew_member_id=p_crew_member_id and provenance=p_provenance and request_id=p_request_id;
  if found then
    return jsonb_build_object('status',case when v_row.payload_canonical=p_payload_canonical and v_row.payload_sha256=p_payload_sha256 then 'duplicate' else 'conflict' end,'submission_id',v_row.submission_id,'received_at',v_row.received_at);
  end if;
  insert into public.p36_dynamic_handoff_submissions(mission_id,crew_member_id,provenance,request_id,submitted_by,submitted_role,payload_canonical,payload_sha256)
    values(p_mission_id,p_crew_member_id,p_provenance,p_request_id,auth.uid(),v_role,p_payload_canonical,p_payload_sha256) returning * into v_row;
  insert into public.p36_dynamic_handoff_terms(submission_id,term_id,metadata) select v_row.submission_id,t->>'termId',t from jsonb_array_elements(v_p->'terms') t;
  return jsonb_build_object('status','inserted','submission_id',v_row.submission_id,'received_at',v_row.received_at);
end $$;

create function public.p36_dynamic_handoff_list_v1(p_mission_id text,p_crew_member_id text,p_provenance text,p_after_seq bigint,p_limit int)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.p36_dynamic_scope(p_mission_id,p_crew_member_id,false);
  if p_provenance not in ('synthetic','real') then raise exception 'invalid provenance' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.received_seq) from (
    select * from public.p36_dynamic_handoff_submissions where mission_id=p_mission_id and crew_member_id=p_crew_member_id and provenance=p_provenance and received_seq>coalesce(p_after_seq,0)
    order by received_seq limit least(greatest(coalesce(p_limit,100),1),100)) s),'[]'::jsonb);
end $$;
revoke all on sequence public.p36_dynamic_handoff_submissions_received_seq_seq from public,anon,authenticated,service_role;
revoke all on function public.p36_dynamic_admission_reject_delete() from public,anon,authenticated,service_role;
revoke all on function public.p36_dynamic_scope(text,text,boolean), public.p36_dynamic_reject_mutation(), public.p36_dynamic_handoff_append_v1(text,text,text,text,text,text), public.p36_dynamic_handoff_list_v1(text,text,text,bigint,int) from public,anon,authenticated,service_role;
grant execute on function public.p36_dynamic_handoff_append_v1(text,text,text,text,text,text), public.p36_dynamic_handoff_list_v1(text,text,text,bigint,int) to authenticated;
