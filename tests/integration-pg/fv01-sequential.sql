-- FV-01.2 sequential PostgreSQL integration scenarios (disposable database only).
\set ON_ERROR_STOP 1
\set op   '00000000-0000-0000-0000-0000000000a1'
\set gm   '00000000-0000-0000-0000-0000000000a2'
\set res  '00000000-0000-0000-0000-0000000000a3'
\set c1u  '00000000-0000-0000-0000-0000000000b1'
\set c2u  '00000000-0000-0000-0000-0000000000b2'
\set c3u  '00000000-0000-0000-0000-0000000000b3'
\set c4u  '00000000-0000-0000-0000-0000000000b4'

-- ---------- ingestion: accept / duplicate / conflict / cross-mission ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'c1u', false);
select fvtest.check(public.ingest_mission_event(fvtest.ev('m1','c1','e-c1-1','2026-10-01'), 'key-e-c1-1-aaaaaaaaaaaa')->>'status' = 'accepted', 'crew self ingest accepted');
select fvtest.check(public.ingest_mission_event(fvtest.ev('m1','c1','e-c1-1','2026-10-01'), 'key-e-c1-1-aaaaaaaaaaaa')->>'status' = 'duplicate', 'offline retry is idempotent duplicate');
select fvtest.check((public.ingest_mission_event(jsonb_set(fvtest.ev('m1','c1','e-c1-1','2026-10-01'),'{payload,v}','2'), 'key-e-c1-1-bbbbbbbbbbbb') ? 'remote'), 'same-scope conflict returns own metadata');

select set_config('request.jwt.claim.sub', :'c4u', false);
select fvtest.check(
  (select r->>'status' = 'rejected' and r->>'reason' = 'identifier_unavailable' and not (r ? 'remote')
   from (select public.ingest_mission_event(fvtest.ev('m2','c4','e-c1-1','2026-10-01'), 'key-cross-mission-cccccc') r) x),
  'cross-mission id collision discloses no metadata');
select fvtest.check(
  (select not (r ? 'remote') from (select public.ingest_mission_event(fvtest.ev('m2','c4','e-c4-x','2026-10-01'), 'key-e-c1-1-aaaaaaaaaaaa') r) x),
  'cross-mission idempotency-key collision discloses no metadata');

-- crew c2 / c3 events; c3 has no crew_self membership so ground medical ingests for it
select set_config('request.jwt.claim.sub', :'c2u', false);
select public.ingest_mission_event(fvtest.ev('m1','c2','e-c2-'||g,'2026-10-02'), 'key-e-c2-'||g||'-aaaaaaaaaa') from generate_series(1,4) g;
select set_config('request.jwt.claim.sub', :'gm', false);
select public.ingest_mission_event(fvtest.ev('m1','c3','e-c3-'||g,'2026-10-02'), 'key-e-c3-'||g||'-aaaaaaaaaa') from generate_series(1,4) g;
select set_config('request.jwt.claim.sub', :'c1u', false);
select public.ingest_mission_event(fvtest.ev('m1','c1','e-c1-'||g,'2026-10-02'), 'key-e-c1-'||g||'-aaaaaaaaaa') from generate_series(2,4) g;

-- ground medical cannot write for crew not assigned to the mission
select set_config('request.jwt.claim.sub', :'gm', false);
do $$ begin
  perform public.ingest_mission_event(fvtest.ev('m1','c4','e-gm-c4','2026-10-02'), 'key-e-gm-c4-aaaaaaaaaa');
  raise exception 'FAIL: unassigned crew write accepted';
exception when others then
  if sqlerrm not like '%crew assignment inactive%' then raise; end if;
end $$;
select 'PASS: ground medical cannot write for unassigned crew';

-- ---------- operator snapshot is operational only ----------
select set_config('request.jwt.claim.sub', :'op', false);
select fvtest.check(
  (select s->>'scope' = 'operational' and s->'finding_count' = 'null'::jsonb and s->'total_events' = 'null'::jsonb and jsonb_array_length(s->'crew') = 0
   from (select public.get_ground_mission_snapshot('m1') s) x),
  'operator snapshot excludes identified medical activity');

-- ---------- direct table writes denied for authenticated ----------
do $$ begin insert into public.missions(id,code,name,status) values('mx','FV-MX','x x x','active'); raise exception 'FAIL: direct mission insert';
exception when insufficient_privilege then null; end $$;
do $$ begin insert into public.mission_memberships(mission_id,user_id,role) values('m2', auth.uid(),'mission_operator'); raise exception 'FAIL: self-elevation';
exception when insufficient_privilege then null; end $$;
do $$ begin update public.audit_events set action='x'; raise exception 'FAIL: audit update';
exception when insufficient_privilege then null; end $$;
do $$ begin delete from public.mission_events; raise exception 'FAIL: event delete';
exception when insufficient_privilege then null; end $$;
do $$ begin perform * from public.mission_research_snapshots; raise exception 'FAIL: snapshot readable';
exception when insufficient_privilege then null; end $$;
select 'PASS: authenticated direct writes and snapshot reads denied';

-- ---------- deactivated crew self loses event reads ----------
select set_config('request.jwt.claim.sub', :'c2u', false);
select fvtest.check((select count(*) from public.mission_events where mission_id='m1') = 4, 'active crew self reads own events only');
reset role;
update public.mission_memberships set active=false where user_id = :'c2u';
set role authenticated;
select set_config('request.jwt.claim.sub', :'c2u', false);
select fvtest.check((select count(*) from public.mission_events) = 0, 'deactivated crew self cannot read events');
select fvtest.check((select count(*) from public.crew_members) = 0, 'deactivated crew self cannot read crew identity');
reset role;
update public.mission_memberships set active=true where user_id = :'c2u';

-- ---------- invite binding conflict: rejection with persisted audit ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
select public.create_mission_invite('m1','crew_self','c3',24)->>'code' as invite_code \gset
select set_config('request.jwt.claim.sub', :'c1u', false);
select fvtest.check(public.accept_mission_invite(:'invite_code')->>'reason' = 'crew_self_binding_conflict', 'invite re-binding rejected');
reset role;
select fvtest.check((select count(*) from public.audit_events where action='mission_invite_binding_conflict') = 1, 'binding-conflict audit row persisted');
select fvtest.check((select not active and claimed_at is null from public.mission_invites where crew_member_id='c3'), 'conflicting invite revoked, not claimed');
select fvtest.check((select crew_member_id = 'c1' from public.mission_memberships where user_id = :'c1u' and mission_id='m1'), 'existing crew self binding unchanged');

-- ---------- audit + events append-only for every role (including owner) ----------
do $$ begin update public.audit_events set action='x'; raise exception 'FAIL: owner audit update';
exception when others then if sqlerrm not like '%append-only%' then raise; end if; end $$;
do $$ begin delete from public.mission_events where id='e-c1-1'; raise exception 'FAIL: owner event delete';
exception when others then if sqlerrm not like '%append-only%' then raise; end if; end $$;
select 'PASS: audit_events and mission_events append-only even for owner';

-- ---------- close mission and freeze research snapshot ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
select public.update_mission_operation('m1', null, 'completed');
reset role;
select fvtest.check((select crew_count = 3 and event_count = 12 from public.mission_research_snapshots where mission_id='m1'), 'snapshot frozen atomically at close (3 crew, 12 events)');
select ends_at as m1_end from public.missions where id='m1' \gset

-- researcher export
set role authenticated;
select set_config('request.jwt.claim.sub', :'res', false);
select public.export_research_mission('m1')::text as export_1 \gset
select fvtest.check(:'export_1'::jsonb->>'event_count_lower_bound' = '10', 'export reads frozen snapshot');
do $$ begin perform public.export_research_mission('m1'); raise exception 'FAIL: second export allowed';
exception when others then if sqlerrm not like '%rate limit%' then raise; end if; end $$;
select 'PASS: 24h limit refuses repeated export';

-- post-close mutations
select set_config('request.jwt.claim.sub', :'c1u', false);
select fvtest.check(public.ingest_mission_event(fvtest.ev('m1','c1','e-c1-1','2026-10-01'), 'key-e-c1-1-aaaaaaaaaaaa')->>'status' = 'duplicate', 'offline retry still duplicate after close');
select fvtest.check(public.ingest_mission_event(fvtest.ev('m1','c1','e-late-1', (:'m1_end'::timestamptz - interval '1 hour')), 'key-e-late-1-aaaaaaaaaa')->>'status' = 'accepted', 'late offline event captured before close accepted');
do $$ begin perform public.ingest_mission_event(fvtest.ev('m1','c1','e-after', now() + interval '1 hour'), 'key-e-after-aaaaaaaaaaa'); raise exception 'FAIL: post-close event accepted';
exception when others then if sqlerrm not like '%mission closed%' then raise; end if; end $$;
select 'PASS: events after close rejected';

select set_config('request.jwt.claim.sub', :'op', false);
do $$ begin perform public.update_mission_operation('m1', null, 'active'); raise exception 'FAIL: reopen via RPC';
exception when others then if sqlerrm not like '%invalid mission lifecycle%' and sqlerrm not like '%reopened%' then raise; end if; end $$;
do $$ begin perform public.update_mission_operation('m1', null, null, null, now() + interval '1 day'); raise exception 'FAIL: re-date via RPC';
exception when others then if sqlerrm not like '%immutable after close%' then raise; end if; end $$;
do $$ begin perform public.update_mission_crew_member('m1','c1','Renamed Crew',null,null); raise exception 'FAIL: post-close assignment edit';
exception when others then if sqlerrm not like '%frozen after mission close%' then raise; end if; end $$;
do $$ begin perform public.create_mission_crew_member('m1','Late Crew'); raise exception 'FAIL: post-close crew create';
exception when others then if sqlerrm not like '%closed mission%' then raise; end if; end $$;
reset role;
do $$ begin update public.missions set status='active' where id='m1'; raise exception 'FAIL: owner reopen';
exception when others then if sqlerrm not like '%cannot be reopened%' then raise; end if; end $$;
do $$ begin update public.missions set ends_at=now() where id='m1'; raise exception 'FAIL: owner re-date';
exception when others then if sqlerrm not like '%immutable after close%' then raise; end if; end $$;
do $$ begin insert into public.mission_crew_assignments(mission_id,crew_member_id,status) values('m1','c4','active'); raise exception 'FAIL: owner assignment insert';
exception when others then if sqlerrm not like '%frozen after mission close%' then raise; end if; end $$;
do $$ begin update public.mission_crew_assignments set status='inactive' where mission_id='m1'; raise exception 'FAIL: owner assignment update';
exception when others then if sqlerrm not like '%frozen after mission close%' then raise; end if; end $$;
do $$ begin update public.mission_research_snapshots set event_count=0; raise exception 'FAIL: snapshot update';
exception when others then if sqlerrm not like '%append-only%' then raise; end if; end $$;
select 'PASS: closed mission cannot be reopened, re-dated, re-staffed or snapshot-edited by any role';

select fvtest.check((select crew_count = 3 and event_count = 12 from public.mission_research_snapshots where mission_id='m1'), 'snapshot unchanged after late ingestion and mutation attempts');

-- alternate authorized role (ground medical) gets byte-identical aggregate
set role authenticated;
select set_config('request.jwt.claim.sub', :'gm', false);
select public.export_research_mission('m1')::text as export_2 \gset
select fvtest.check(:'export_1' = :'export_2', 'alternate role receives identical frozen aggregate');

-- active mission export suppressed
select set_config('request.jwt.claim.sub', :'res', false);
reset role;
select 'SEQUENTIAL DONE';
