-- PENDING: separate owner approval required. Provisions the P72.6 global
-- Researcher READ capability (synthetic-only) for the owner-named Researcher
-- account (user id of nikolasilvestros@gmail.com). Grants no mission
-- membership, no Medical role and no approval or activation authority.
insert into public.p726_global_research_readers(user_id, authorization_ref)
values ('33c9c6d0-3404-40e2-8aba-4e251db1be0e', 'owner-authorization:p726-global-researcher-read-2026-11-15')
on conflict (user_id) do nothing;
