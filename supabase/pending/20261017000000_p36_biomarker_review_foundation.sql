-- P36.2B7: staged revision, never deployed. Pending quarantine only; no approval path.
-- Identity provenance uses mission_memberships rather than direct auth.users references.
-- NO authenticated/anon grants, NO ingest RPC, NO automatic observation promotion.
create table if not exists public.p36_biomarker_review_batches (
  id uuid primary key default gen_random_uuid(),
  mission_id text not null references public.missions(id) on delete cascade,
  crew_member_id text not null references public.crew_members(id) on delete cascade,
  submitted_by_membership_id uuid not null references public.mission_memberships(id) on delete restrict,
  submitted_by_user_snapshot uuid not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  source_filename text not null check (char_length(source_filename) between 1 and 255),
  observation_date date not null,
  status text not null default 'pending_review' check (status in ('pending_review','rejected','approved','quarantined')),
  classification text not null default 'synthetic' check (classification = 'synthetic'),
  created_at timestamptz not null default now(),
  reviewed_by_membership_id uuid references public.mission_memberships(id) on delete restrict,
  reviewed_by_user_snapshot uuid,
  reviewed_at timestamptz,
  review_note text,
  constraint p36_reviewer_independent check (reviewed_by_membership_id is null or reviewed_by_membership_id <> submitted_by_membership_id),
  constraint p36_review_state_consistent check (
    (status = 'pending_review' and reviewed_by_membership_id is null and reviewed_at is null)
    or (status in ('approved','rejected','quarantined') and reviewed_by_membership_id is not null and reviewed_at is not null)
  ),
  unique (mission_id, crew_member_id, source_fingerprint, observation_date)
);
create table if not exists public.p36_biomarker_review_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.p36_biomarker_review_batches(id) on delete cascade,
  metric_id text not null check (char_length(metric_id) between 1 and 128),
  measured_value numeric not null,
  unit text not null check (char_length(unit) between 1 and 64),
  source_excerpt text not null check (char_length(source_excerpt) <= 500),
  disposition text not null default 'pending' check (disposition in ('pending','accepted','rejected')),
  unique (batch_id, metric_id)
);
create index if not exists p36_review_batches_scope on public.p36_biomarker_review_batches(mission_id,crew_member_id,created_at desc);
create index if not exists p36_review_items_batch on public.p36_biomarker_review_items(batch_id);
alter table public.p36_biomarker_review_batches enable row level security;
alter table public.p36_biomarker_review_batches force row level security;
alter table public.p36_biomarker_review_items enable row level security;
alter table public.p36_biomarker_review_items force row level security;
revoke all on public.p36_biomarker_review_batches, public.p36_biomarker_review_items from public, anon, authenticated;
-- Explicit DENY policies document intent even if privileges are accidentally expanded.
drop policy if exists p36_batches_deny_all on public.p36_biomarker_review_batches;
create policy p36_batches_deny_all on public.p36_biomarker_review_batches as restrictive for all to public using (false) with check (false);
drop policy if exists p36_items_deny_all on public.p36_biomarker_review_items;
create policy p36_items_deny_all on public.p36_biomarker_review_items as restrictive for all to public using (false) with check (false);
comment on table public.p36_biomarker_review_batches is 'P36.2B7 staged schema: NO CLIENT ACCESS OR WRITE PATH. Synthetic-only; no approval workflow.';
comment on table public.p36_biomarker_review_items is 'P36.2B4 staged schema: no import, no scientific approval and no clinical use.';

-- P36.2B5: Integrity guard for any future privileged writer. This does NOT
-- create a writer or reviewer API. Enforce real-user separation and scope.
create or replace function public.p36_validate_review_memberships()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_submit public.mission_memberships%rowtype;
  v_review public.mission_memberships%rowtype;
begin
  select * into v_submit from public.mission_memberships
    where id = new.submitted_by_membership_id;
  -- On INSERT the submitter must currently be authorized. On UPDATE the
  -- historical submitter may have been revoked, but identity/scope stay frozen.
  if not found or v_submit.mission_id is distinct from new.mission_id
     or v_submit.crew_member_id is distinct from new.crew_member_id then
    raise exception 'P36 submitter membership scope mismatch';
  end if;
  if tg_op = 'INSERT' and (not v_submit.active or v_submit.role <> 'crew_self') then
    raise exception 'P36 new submission requires active crew_self';
  end if;
  if tg_op = 'INSERT' and (new.status <> 'pending_review' or new.reviewed_by_membership_id is not null or new.reviewed_by_user_snapshot is not null) then
    raise exception 'P36 new batches must start pending with no reviewer';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.mission_id is distinct from old.mission_id
       or new.crew_member_id is distinct from old.crew_member_id
       or new.submitted_by_membership_id is distinct from old.submitted_by_membership_id
       or new.submitted_by_user_snapshot is distinct from old.submitted_by_user_snapshot
       or new.source_fingerprint is distinct from old.source_fingerprint
       or new.source_filename is distinct from old.source_filename
       or new.observation_date is distinct from old.observation_date
       or new.classification is distinct from old.classification
       or new.created_at is distinct from old.created_at
       or old.reviewed_by_membership_id is not null
       or old.reviewed_by_user_snapshot is not null
       or old.reviewed_at is not null
       or old.review_note is not null
       or old.status <> 'pending_review'
       or new.status <> 'quarantined'
       or new.reviewed_by_membership_id is null
       or new.reviewed_at is null then
      raise exception 'P36 historical reviewer/submitter provenance is immutable; only pending-to-quarantined is staged';
    end if;
    -- This special transition is ONLY for a revoked submitter. Active
    -- submitters remain pending until a separately reviewed workflow exists.
    if v_submit.active and v_submit.role = 'crew_self' then
      raise exception 'P36 quarantine requires revoked or disqualified submitter';
    end if;
  end if;
  if new.submitted_by_user_snapshot is distinct from v_submit.user_id then
    raise exception 'P36 submitter snapshot must match membership user';
  end if;
  if new.reviewed_by_membership_id is not null then
    select * into v_review from public.mission_memberships
      where id = new.reviewed_by_membership_id;
    if not found or not v_review.active or v_review.role <> 'ground_medical'
       or v_review.mission_id is distinct from new.mission_id
       or v_review.user_id = v_submit.user_id then
      raise exception 'P36 reviewer must be an independent active ground_medical user in the same mission';
    end if;
    if new.reviewed_by_user_snapshot is distinct from v_review.user_id then
      raise exception 'P36 reviewer snapshot must match membership user';
    end if;
  elsif new.reviewed_by_user_snapshot is not null then
    raise exception 'P36 reviewer snapshot requires a reviewer membership';
  end if;
  return new;
end $$;
revoke all on function public.p36_validate_review_memberships() from public, anon, authenticated;
drop trigger if exists p36_review_membership_guard on public.p36_biomarker_review_batches;
create trigger p36_review_membership_guard before insert or update
  on public.p36_biomarker_review_batches for each row
  execute function public.p36_validate_review_memberships();

-- P36.2B6 emergency revocation: NO membership update/delete guard trigger.
-- Membership deactivation and role removal must remain possible immediately.
-- Historical user snapshots preserve attribution. Existing review rows remain
-- inaccessible to browser roles; a future privileged approval service MUST
-- check current membership status and user identity at decision time.
-- Membership deletion is still restricted by the FK: use active=false to revoke.

-- P36.2B7: The pending-to-quarantined transition is a schema-level safety
-- constraint for a future audited privileged service. There is NO such service,
-- no approval/rejection API, and no browser write permission in this patch.
-- The original submitter may be inactive; a NEW active independent medical
-- reviewer is mandatory for quarantine. Item rows remain unchanged.
