-- ============================================================
-- Migration: 20260923130000_create_claims_schema
-- Description: Phase 1 of the Claimed Directory Listings epic (Monday:
--              "Claimed Directory Listings (Epic)" — see the epic plan for
--              the full 10-phase breakdown). Schema only, no UI, no RPCs —
--              nothing in this migration is reachable by any code path yet.
--
--              Introduces the claims domain, deliberately NOT represented
--              as a boolean on directory_entries — claims need their own
--              lifecycle, users, payment state and audit trail:
--                - directory_claim_settings  (one row per directory: is
--                  claiming enabled, price, payment type, intro HTML)
--                - claims                    (one row per historical claim
--                  attempt — a revoked claim stays revoked forever; see
--                  directory_entries.current_claim_id below for how "is
--                  this item currently claimable" stays a separate concept)
--                - claim_payments            (1:1 with claims, current
--                  payment/subscription state; provider-neutral even
--                  though only Stripe will populate it for now)
--                - claim_users               (owner/editor per claim;
--                  user_id is nullable and carries no FK to auth.users,
--                  same convention as contacts.user_id, since it's null
--                  until a magic-link invitation is accepted in a later
--                  phase)
--                - directory_entry_team_members (net new — no per-entry
--                  team-member concept exists anywhere today, for admins
--                  or anyone; this epic builds it from scratch)
--
--              Plus four columns on directory_entries:
--                - current_claim_id: null = open to a new claim. This is
--                  what keeps "is this item currently claimable" separate
--                  from a claim's own permanent history — revoking a claim
--                  sets claims.status='revoked' AND clears this back to
--                  null in the same transaction (enforced by later RPCs,
--                  not by this migration), so the historical claim record
--                  stays REVOKED forever while the item becomes claimable
--                  again.
--                - content_managed_by / content_last_edited_by_claim_user_id
--                  / content_last_edited_at: provenance, so a future AI
--                  enrichment job can tell claimant-managed content apart
--                  from platform-researched content before overwriting it.
--
--              Defence in depth: a partial unique index
--              (claims_one_active_per_item) blocks more than one non-
--              revoked claim per directory_item_id at the database level,
--              independent of whatever the RPCs in later phases enforce.
--              A BEFORE INSERT trigger derives claims.directory_id from
--              claims.directory_item_id server-side, so that denormalised
--              column (kept for cheap admin-list queries/RLS, avoiding a
--              join through directory_entries) can never drift from the
--              real relationship, regardless of what a caller passes.
--
--              RLS follows the exact `_admin_all` / `_own_client` pattern
--              used by entry_evidence_items/directory_accreditation_schemes
--              (20260826120000_create_directory_entry_extras.sql). This
--              covers platform admins and the organisation's own contacts
--              (the directory administrators) — it does NOT yet cover
--              claim users reading/editing their own claim, because the
--              claim-user identity/auth model doesn't exist until a later
--              phase of this epic. That policy is added when the auth flow
--              that makes auth.uid() meaningful for a claim_users row is
--              built, not before.
-- Affected tables: directory_claim_settings, claims, claim_payments,
--                   claim_users, directory_entry_team_members (all new);
--                   directory_entries (4 new columns)
-- Rollback: _20260923130000_create_claims_schema.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-23
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- If no error appears, the dry run passed. Then apply for real.
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- Run these BEFORE applying. Stop if any assertion fails.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_entries') then
    raise exception 'ABORT: table public.directory_entries does not exist';
  end if;
  if not exists (select 1 from pg_proc where proname = 'current_user_client_id') then
    raise exception 'ABORT: public.current_user_client_id() does not exist';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('directory_claim_settings', 'claims', 'claim_payments', 'claim_users', 'directory_entry_team_members')
  ) then
    raise exception 'ABORT: one of the new claims tables already exists — migration may have already run';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'current_claim_id'
  ) then
    raise exception 'ABORT: directory_entries.current_claim_id already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'directories'        as tbl, count(*) as rows from public.directories        union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Per-directory claim configuration (admin Claims → Settings tab, Phase 2)
create table public.directory_claim_settings (
  directory_id text primary key references public.directories(id) on delete cascade,
  enabled boolean not null default false,
  price_cents integer null check (price_cents is null or price_cents >= 0),
  currency text not null default 'GBP',
  payment_type text null check (payment_type in ('one_off', 'annual_recurring')),
  payment_provider text not null default 'stripe',
  intro_html text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.directory_claim_settings is
  'One row per directory: whether claiming is enabled, price/currency/payment type, and the intro HTML shown before a claimant starts. Phase 0 of the Claimed Directory Listings epic gates configuring this behind the maps.claims entitlement; enforcement of that lives in the Phase 2 UI/RPC, not this table.';

-- 2) Claims — one row per historical claim attempt, never overwritten to
--    represent "current" state (see directory_entries.current_claim_id below).
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  directory_item_id text not null references public.directory_entries(id) on delete cascade,
  status text not null default 'claim_started' check (status in (
    'claim_started', 'email_verification_pending', 'verified',
    'payment_pending', 'active', 'payment_failed', 'suspended', 'revoked'
  )),
  claimant_email text not null,
  claimant_domain text null,
  listing_domain text null,
  verification_method text null check (verification_method in ('domain_email', 'admin_override')),
  verification_note text null,
  admin_override_by uuid null,
  admin_override_at timestamptz null,
  created_by text not null default 'self_service' check (created_by in ('self_service', 'admin')),
  created_by_user_id uuid null,
  started_at timestamptz not null default now(),
  verified_at timestamptz null,
  activated_at timestamptz null,
  suspended_at timestamptz null,
  revoked_at timestamptz null,
  revoked_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_claims_directory on public.claims(directory_id);
create index idx_claims_directory_item on public.claims(directory_item_id);
create index idx_claims_status on public.claims(status);

-- Defence in depth: at most one non-revoked claim per item, at the DB level,
-- independent of whatever a later RPC also enforces.
create unique index claims_one_active_per_item
  on public.claims(directory_item_id)
  where status <> 'revoked';

comment on table public.claims is
  'One row per historical claim attempt on a directory_entries row. A revoked claim stays status=revoked forever (history is never deleted) — whether the item is currently open to a NEW claim is tracked separately on directory_entries.current_claim_id, not derived from this table''s latest row.';

-- Keep the denormalised directory_id honest server-side, regardless of what
-- a caller passes — never trust it as caller-supplied truth.
create or replace function public.derive_claim_directory_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select e.directory_id into new.directory_id
  from public.directory_entries e
  where e.id = new.directory_item_id;

  if new.directory_id is null then
    raise exception 'derive_claim_directory_id: directory_item_id % has no resolvable directory_id', new.directory_item_id;
  end if;

  return new;
end;
$$;

comment on function public.derive_claim_directory_id() is
  'BEFORE INSERT/UPDATE OF directory_item_id trigger on public.claims. Overwrites claims.directory_id from directory_entries, so the denormalised column (kept for cheap admin-list queries and simpler RLS) can never drift from the real relationship.';

create trigger trg_derive_claim_directory_id
  before insert or update of directory_item_id on public.claims
  for each row execute function public.derive_claim_directory_id();

-- 3) Claim payments — 1:1 with claims, current payment/subscription state.
--    Provider-neutral even though only Stripe is implemented (later epic).
create table public.claim_payments (
  claim_id uuid primary key references public.claims(id) on delete cascade,
  payment_provider text not null default 'stripe',
  payment_type text null check (payment_type in ('one_off', 'annual_recurring')),
  payment_status text null,
  subscription_status text null,
  provider_customer_id text null,
  provider_transaction_id text null,
  provider_subscription_id text null,
  amount_cents integer null check (amount_cents is null or amount_cents >= 0),
  currency text null,
  paid_at timestamptz null,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  updated_at timestamptz not null default now()
);

comment on table public.claim_payments is
  'Current payment/subscription state for a claim, 1:1. Individual payment attempts/failures are covered by the existing admin event model (claim_payment_started/completed/failed in AGENTS.md), not a separate ledger here. Populated by the follow-up "Claim Payments (Stripe)" epic; this epic''s self-service flow activates claims without ever writing a row here.';

-- 4) Claim users — owner/editor per claim.
create table public.claim_users (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  user_id uuid null,
  email text not null,
  role text not null check (role in ('owner', 'editor')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz null,
  removed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_claim_users_claim on public.claim_users(claim_id);
create index idx_claim_users_user on public.claim_users(user_id) where user_id is not null;

-- Exactly one non-removed owner per claim.
create unique index claim_users_one_owner
  on public.claim_users(claim_id)
  where role = 'owner' and removed_at is null;

-- No duplicate active invitations for the same email on the same claim.
create unique index claim_users_claim_email_active
  on public.claim_users(claim_id, email)
  where removed_at is null;

comment on table public.claim_users is
  'Owner/editor users authorised to manage one claim. user_id is nullable with no FK to auth.users (same convention as contacts.user_id) — it stays null until a magic-link invitation is accepted in a later phase of this epic.';

-- 5) Team members shown publicly on a listing — net new, doesn't exist for
--    admins or anyone today. Distinct from claim_users (who can edit) —
--    per the epic spec, a CEO can be displayed without editing access, and
--    a marketing manager can have editing access without appearing publicly.
create table public.directory_entry_team_members (
  id uuid primary key default gen_random_uuid(),
  directory_item_id text not null references public.directory_entries(id) on delete cascade,
  name text not null,
  role_title text null,
  photo_url text null,
  bio text null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_detm_entry on public.directory_entry_team_members(directory_item_id);

comment on table public.directory_entry_team_members is
  'People displayed publicly as part of a directory listing (build-scope: Claimed Directory Listings epic §10/§11). Distinct from claim_users, which controls who can EDIT the listing, not who is shown on it. Admin-side management ships alongside claimant-side management, for client/admin parity.';

-- 6) directory_entries: current claimability + content provenance.
alter table public.directory_entries
  add column current_claim_id uuid null references public.claims(id) on delete set null,
  add column content_managed_by text not null default 'platform' check (content_managed_by in ('platform', 'claimed_org')),
  add column content_last_edited_by_claim_user_id uuid null references public.claim_users(id) on delete set null,
  add column content_last_edited_at timestamptz null;

create index idx_directory_entries_current_claim on public.directory_entries(current_claim_id) where current_claim_id is not null;

comment on column public.directory_entries.current_claim_id is
  'Null = open to a new claim (UNCLAIMED). Set to a claims.id while that claim is in progress or active. A revoked claim clears this back to null (in the same transaction that sets claims.status=''revoked'') so the item becomes claimable again without deleting the claim''s history.';
comment on column public.directory_entries.content_managed_by is
  'platform (default) = researched/imported/generated content; claimed_org = a claim user has edited the body content. Any future automated enrichment job must check this before overwriting content_last_edited_at-tracked fields.';


-- ------------------------------------------------------------
-- RLS: `_admin_all` / `_own_client` pattern, exactly matching
-- entry_evidence_items/directory_accreditation_schemes
-- (20260826120000_create_directory_entry_extras.sql). No claim-user-facing
-- policies yet — see the migration description header.
-- ------------------------------------------------------------

alter table public.directory_claim_settings enable row level security;
alter table public.claims enable row level security;
alter table public.claim_payments enable row level security;
alter table public.claim_users enable row level security;
alter table public.directory_entry_team_members enable row level security;

-- ---- directory_claim_settings ----
create policy "dcs_admin_all"
  on public.directory_claim_settings for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "dcs_own_client"
  on public.directory_claim_settings for all
  to authenticated
  using (directory_id in (select id from public.directories where client_id = public.current_user_client_id()))
  with check (directory_id in (select id from public.directories where client_id = public.current_user_client_id()));

-- ---- claims ----
create policy "claims_admin_all"
  on public.claims for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "claims_own_client"
  on public.claims for all
  to authenticated
  using (directory_id in (select id from public.directories where client_id = public.current_user_client_id()))
  with check (directory_id in (select id from public.directories where client_id = public.current_user_client_id()));

-- ---- claim_payments ----
create policy "claim_payments_admin_all"
  on public.claim_payments for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "claim_payments_own_client"
  on public.claim_payments for all
  to authenticated
  using (
    claim_id in (
      select c.id from public.claims c
      join public.directories d on d.id = c.directory_id
      where d.client_id = public.current_user_client_id()
    )
  )
  with check (
    claim_id in (
      select c.id from public.claims c
      join public.directories d on d.id = c.directory_id
      where d.client_id = public.current_user_client_id()
    )
  );

-- ---- claim_users ----
create policy "claim_users_admin_all"
  on public.claim_users for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "claim_users_own_client"
  on public.claim_users for all
  to authenticated
  using (
    claim_id in (
      select c.id from public.claims c
      join public.directories d on d.id = c.directory_id
      where d.client_id = public.current_user_client_id()
    )
  )
  with check (
    claim_id in (
      select c.id from public.claims c
      join public.directories d on d.id = c.directory_id
      where d.client_id = public.current_user_client_id()
    )
  );

-- ---- directory_entry_team_members ----
create policy "detm_admin_all"
  on public.directory_entry_team_members for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "detm_own_client"
  on public.directory_entry_team_members for all
  to authenticated
  using (
    directory_item_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  )
  with check (
    directory_item_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  );

-- ------------------------------------------------------------
-- Data API grants (RLS still governs; these just let PostgREST reach the tables)
-- ------------------------------------------------------------
grant select, insert, update, delete on table public.directory_claim_settings to authenticated, service_role;
grant select, insert, update, delete on table public.claims to authenticated, service_role;
grant select, insert, update, delete on table public.claim_payments to authenticated, service_role;
grant select, insert, update, delete on table public.claim_users to authenticated, service_role;
grant select, insert, update, delete on table public.directory_entry_team_members to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_claim_settings') then
    raise exception 'VERIFY FAILED: directory_claim_settings was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'claims') then
    raise exception 'VERIFY FAILED: claims was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'claim_payments') then
    raise exception 'VERIFY FAILED: claim_payments was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'claim_users') then
    raise exception 'VERIFY FAILED: claim_users was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_entry_team_members') then
    raise exception 'VERIFY FAILED: directory_entry_team_members was not created';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'current_claim_id') then
    raise exception 'VERIFY FAILED: directory_entries.current_claim_id was not added';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_derive_claim_directory_id') then
    raise exception 'VERIFY FAILED: trg_derive_claim_directory_id was not created';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'claims_one_active_per_item') then
    raise exception 'VERIFY FAILED: claims_one_active_per_item unique index was not created';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'claim_users_one_owner') then
    raise exception 'VERIFY FAILED: claim_users_one_owner unique index was not created';
  end if;
  raise notice 'VERIFY PASSED: claims domain schema created';
end $$;

-- Row counts — directories/directory_entries must be unchanged; new tables start at 0
select
  'directories'                    as tbl, count(*) as rows from public.directories                    union all
  select 'directory_entries',          count(*) from public.directory_entries                           union all
  select 'directory_claim_settings',   count(*) from public.directory_claim_settings                    union all
  select 'claims',                     count(*) from public.claims                                      union all
  select 'claim_payments',             count(*) from public.claim_payments                              union all
  select 'claim_users',                count(*) from public.claim_users                                 union all
  select 'directory_entry_team_members', count(*) from public.directory_entry_team_members
order by tbl;

-- RLS enabled on all new tables
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('directory_claim_settings', 'claims', 'claim_payments', 'claim_users', 'directory_entry_team_members')
order by tablename;
-- All rows must show rowsecurity = true

-- Orphan checks — must all return 0
select count(*) as orphaned_claim_settings from public.directory_claim_settings x where not exists (select 1 from public.directories d where d.id = x.directory_id);
select count(*) as orphaned_claims_directory from public.claims x where not exists (select 1 from public.directories d where d.id = x.directory_id);
select count(*) as orphaned_claims_item from public.claims x where not exists (select 1 from public.directory_entries e where e.id = x.directory_item_id);
select count(*) as orphaned_claim_payments from public.claim_payments x where not exists (select 1 from public.claims c where c.id = x.claim_id);
select count(*) as orphaned_claim_users from public.claim_users x where not exists (select 1 from public.claims c where c.id = x.claim_id);
select count(*) as orphaned_team_members from public.directory_entry_team_members x where not exists (select 1 from public.directory_entries e where e.id = x.directory_item_id);
select count(*) as orphaned_current_claim_id from public.directory_entries x where x.current_claim_id is not null and not exists (select 1 from public.claims c where c.id = x.current_claim_id);
