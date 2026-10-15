-- P36.2B4: staged revision of P36.2B3, never deployed.
-- Identity provenance uses mission_memberships rather than direct auth.users references.
-- NO authenticated/anon grants, NO ingest RPC, NO automatic observation promotion.
create table if not exists public.p36_biomarker_review_batches (
  id uuid primary key default gen_random_uuid(),
  mission_id text not null references public.missions(id) on delete cascade,
  crew_member_id text not null references public.crew_members(id) on delete cascade,
  submitted_by_membership_id uuid not null references public.mission_memberships(id) on delete restrict,
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  source_filename text not null check (char_length(source_filename) between 1 and 255),
  observation_date date not null,
  status text not null default 'pending_review' check (status in ('pending_review','rejected','approved')),
  classification text not null default 'synthetic' check (classification = 'synthetic'),
  created_at timestamptz not null default now(),
  reviewed_by_membership_id uuid references public.mission_memberships(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  constraint p36_reviewer_independent check (reviewed_by_membership_id is null or reviewed_by_membership_id <> submitted_by_membership_id),
  constraint p36_review_state_consistent check (
    (status = 'pending_review' and reviewed_by_membership_id is null and reviewed_at is null)
    or (status in ('approved','rejected') and reviewed_by_membership_id is not null and reviewed_at is not null)
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
comment on table public.p36_biomarker_review_batches is 'P36.2B4 staged schema: NO CLIENT ACCESS OR WRITE PATH. Synthetic-only; independent authorization acceptance required.';
comment on table public.p36_biomarker_review_items is 'P36.2B4 staged schema: no import, no scientific approval and no clinical use.';
