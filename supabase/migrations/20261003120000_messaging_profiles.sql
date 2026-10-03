-- ============================================================
-- Migration: 20261003120000_messaging_profiles
-- Description: Slice 1 of "per-map / per-directory messaging".
--
--   Until now messaging was one set of settings per organisation, stored on
--   public.clients (sending domain + From address, subject/intro/prompt,
--   enable toggle, test mode). This migration moves it to:
--
--     * public.messaging_profiles  -- a *sending identity* (From name/address
--       + Resend domain + verification status + DNS records). An organisation
--       can have many, created and verified like Domains.
--     * per-map and per-directory columns -- which profile to send through,
--       the enable toggle, test mode + recipient, and the message text
--       (prompt shown to visitors, email subject, email intro). Message text
--       lives ONLY on the map/directory, not on the profile.
--     * map_messaging_settings / directory_messaging_settings views -- the
--       anon-readable, entitlement-aware replacement for
--       client_messaging_settings.
--
--   Messaging is "ready" only when the map/directory has chosen a profile,
--   the toggle is on, and the client's "messaging" entitlement resolves true
--   (blocked until a profile is chosen -- there is no platform fallback for
--   "no profile"). An unverified profile domain still sends, from the platform
--   address with the profile's display name (same as today).
--
--   Backfill: every client with messaging on or any email config gets one
--   "Default" profile copied from its clients.* columns; all of that client's
--   maps and directories are linked to it and receive the client's current
--   enable/test-mode/prompt/subject/intro values, so behaviour is identical on
--   day one.
--
--   NOT in this migration: the old clients.* columns and the old
--   client_messaging_settings view are left untouched (dropping needs explicit
--   sign-off). No application code reads the new objects yet -- that is
--   slice 2 (Edge Functions) onward.
-- Affected tables: messaging_profiles (new), maps, directories (columns added)
-- New views: map_messaging_settings, directory_messaging_settings
-- New functions: resolve_messaging_entitlement, enforce_messaging_profile_same_client
-- Rollback: _20261003120000_messaging_profiles.rollback.sql
-- Author: Claude Code
-- Date: 2026-10-03
-- ============================================================
--
-- DRY-RUN BLOCK (run this first -- makes NO persistent changes):
--
--   BEGIN;
--   <paste the whole file body here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run -> apply on STAGING (beqejxneehilplrtpntn) -> run the
-- POST-MIGRATION VERIFICATION -> only then PRODUCTION (gxixwdjfmegxcxfeflro)
-- after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clients') then
    raise exception 'ABORT: table public.clients does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maps') then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'messaging_profiles') then
    raise exception 'ABORT: public.messaging_profiles already exists -- migration may have already run';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('maps', 'directories')
      and column_name in ('messaging_profile_id', 'messaging_enabled', 'email_test_mode', 'email_test_recipient',
                          'message_prompt', 'message_subject', 'message_intro')
  ) then
    raise exception 'ABORT: one of the new maps/directories messaging columns already exists';
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'current_user_client_id') then
    raise exception 'ABORT: function public.current_user_client_id() does not exist';
  end if;
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'messaging') then
    raise exception 'ABORT: features.maps.messaging does not exist (20260820140000 not applied)';
  end if;
end $$;

-- Row counts -- save this output and compare with the post-migration block.
select 'clients' as tbl, count(*) as rows from public.clients union all
select 'maps', count(*) from public.maps union all
select 'directories', count(*) from public.directories union all
select 'listings', count(*) from public.listings
order by tbl;

-- Backfill preview: clients that will receive a "Default" profile.
select c.id as client_id, c.name, c.messaging_enabled, c.email_domain_status,
       (select count(*) from public.maps m where m.client_id = c.id) as maps,
       (select count(*) from public.directories d where d.client_id = c.id) as directories
from public.clients c
where c.messaging_enabled
   or c.email_from_name is not null or c.email_from_address is not null
   or c.email_domain is not null or c.resend_domain_id is not null
   or c.email_message_intro is not null or c.email_message_subject is not null
   or c.messaging_prompt is not null
order by c.name;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) messaging_profiles -- sending identities --------------------------------
create table public.messaging_profiles (
  id                  uuid primary key default gen_random_uuid(),
  client_id           text not null references public.clients(id) on delete cascade,
  name                text not null,
  email_from_name     text null,
  email_from_address  text null,
  email_domain        text null,
  resend_domain_id    text null,
  email_domain_status text not null default 'not_configured',
  email_dns_records   jsonb null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint messaging_profiles_name_not_blank check (length(btrim(name)) > 0),
  constraint messaging_profiles_domain_status check (
    email_domain_status in ('not_configured', 'not_started', 'pending', 'verified', 'failed', 'temporary_failure')
  )
);

create index idx_messaging_profiles_client on public.messaging_profiles (client_id);
-- A Resend domain id can only back one profile (Resend domains are global to our account).
create unique index idx_messaging_profiles_resend_domain
  on public.messaging_profiles (resend_domain_id) where resend_domain_id is not null;

comment on table public.messaging_profiles is
  'A sending identity for visitor messaging: From name/address + Resend domain + verification state. Many per client. Which profile a map or directory sends through is maps.messaging_profile_id / directories.messaging_profile_id. Message text (prompt/subject/intro) is NOT here -- it lives on the map or directory.';
comment on column public.messaging_profiles.email_domain_status is 'Resend domain verification status. Same lifecycle as the legacy clients.email_domain_status.';
comment on column public.messaging_profiles.email_dns_records is 'DNS records from Resend (JSON array) for the setup UI.';

alter table public.messaging_profiles enable row level security;

create policy "messaging_profiles_admin_all"
  on public.messaging_profiles for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "messaging_profiles_own_client"
  on public.messaging_profiles for all
  to authenticated
  using (client_id = public.current_user_client_id())
  with check (client_id = public.current_user_client_id());

-- No anon access: profiles hold From addresses and DNS records.
grant select, insert, update, delete on table public.messaging_profiles to authenticated, service_role;


-- 2) Per-map / per-directory columns -----------------------------------------
alter table public.maps
  add column messaging_profile_id uuid null references public.messaging_profiles(id) on delete set null,
  add column messaging_enabled    boolean not null default false,
  add column email_test_mode      boolean not null default true,
  add column email_test_recipient text null,
  add column message_prompt       text null,
  add column message_subject      text null,
  add column message_intro        text null;

alter table public.directories
  add column messaging_profile_id uuid null references public.messaging_profiles(id) on delete set null,
  add column messaging_enabled    boolean not null default false,
  add column email_test_mode      boolean not null default true,
  add column email_test_recipient text null,
  add column message_prompt       text null,
  add column message_subject      text null,
  add column message_intro        text null;

create index idx_maps_messaging_profile on public.maps (messaging_profile_id) where messaging_profile_id is not null;
create index idx_directories_messaging_profile on public.directories (messaging_profile_id) where messaging_profile_id is not null;

comment on column public.maps.messaging_profile_id is 'Sending profile for visitor messages from this map. NULL = messaging blocked until one is chosen.';
comment on column public.maps.messaging_enabled is 'Per-map master switch. Effective only when a profile is chosen and the client has the messaging entitlement (see map_messaging_settings).';
comment on column public.maps.email_test_mode is 'When true, messages go to email_test_recipient instead of the listing address. Defaults true so nothing goes live by accident.';
comment on column public.maps.message_prompt is 'Intro text shown to visitors above the contact form.';
comment on column public.maps.message_subject is 'Email subject template; {listing} is replaced with the listing name. Blank = built-in default.';
comment on column public.maps.message_intro is 'Opening text placed at the top of the email the recipient receives; {listing} supported.';
comment on column public.directories.messaging_profile_id is 'Sending profile for Make an Enquiry on this directory. NULL = messaging blocked until one is chosen.';
comment on column public.directories.messaging_enabled is 'Per-directory master switch. Effective only when a profile is chosen and the client has the messaging entitlement (see directory_messaging_settings).';
comment on column public.directories.email_test_mode is 'When true, enquiries go to email_test_recipient instead of enquiry_email. Defaults true.';
comment on column public.directories.message_prompt is 'Intro text shown to visitors in the Make an Enquiry drawer.';
comment on column public.directories.message_subject is 'Email subject template; {listing} is replaced with the entry name. Blank = built-in default.';
comment on column public.directories.message_intro is 'Opening text placed at the top of the email the recipient receives; {listing} supported.';


-- 3) A profile may only be used by maps/directories of the same client -------
create or replace function public.enforce_messaging_profile_same_client()
returns trigger
language plpgsql
as $$
begin
  if new.messaging_profile_id is not null and not exists (
    select 1 from public.messaging_profiles p
    where p.id = new.messaging_profile_id and p.client_id = new.client_id
  ) then
    raise exception 'messaging_profile_id must belong to the same client as the %', tg_table_name;
  end if;
  return new;
end;
$$;

create trigger maps_messaging_profile_same_client
  before insert or update of messaging_profile_id, client_id on public.maps
  for each row execute function public.enforce_messaging_profile_same_client();

create trigger directories_messaging_profile_same_client
  before insert or update of messaging_profile_id, client_id on public.directories
  for each row execute function public.enforce_messaging_profile_same_client();


-- 4) Entitlement resolver (same precedence the old view used) ----------------
create or replace function public.resolve_messaging_entitlement(p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when f.kill_switch_enabled then false
        when ov.feature_id is not null then ov.bool_value
        when p.is_founder_tier then true
        when pf.feature_id is not null then pf.bool_value
        else f.default_bool_value
      end
      from public.clients c
      left join public.plans p on p.key = coalesce(c.plan_key, 'standard')
      left join public.features f on f.product_key = 'maps' and f.key = 'messaging'
      left join public.client_overrides ov on ov.feature_id = f.id and ov.client_id = c.id
      left join public.plan_features pf on pf.feature_id = f.id and pf.plan_key = coalesce(c.plan_key, 'standard')
      where c.id = p_client_id
    ),
    false
  );
$$;

grant execute on function public.resolve_messaging_entitlement(text) to anon, authenticated, service_role;

comment on function public.resolve_messaging_entitlement(text) is
  'Resolved "messaging" entitlement for a client: kill switch > override > Founder tier > plan default > catalog fallback. Used by the per-entity messaging views and Edge Functions.';


-- 5) Public-safe views --------------------------------------------------------
-- messaging_enabled here is the EFFECTIVE value: toggle AND profile chosen AND entitlement.
create or replace view public.map_messaging_settings
  with (security_invoker = false)
as
  select
    m.id        as map_id,
    m.client_id as client_id,
    (m.messaging_enabled
      and m.messaging_profile_id is not null
      and public.resolve_messaging_entitlement(m.client_id)) as messaging_enabled,
    m.message_prompt,
    m.email_test_mode,
    m.email_test_recipient
  from public.maps m;

-- No recipient column: the published directory pages only need to know test mode is on.
create or replace view public.directory_messaging_settings
  with (security_invoker = false)
as
  select
    d.id        as directory_id,
    d.client_id as client_id,
    (d.messaging_enabled
      and d.messaging_profile_id is not null
      and public.resolve_messaging_entitlement(d.client_id)) as messaging_enabled,
    d.message_prompt,
    d.email_test_mode
  from public.directories d;

grant select on public.map_messaging_settings to anon, authenticated;
grant select on public.directory_messaging_settings to anon, authenticated;

comment on view public.map_messaging_settings is
  'Public-safe per-map messaging settings. messaging_enabled = map toggle AND a profile chosen AND the messaging entitlement. Replaces client_messaging_settings for maps.';
comment on view public.directory_messaging_settings is
  'Public-safe per-directory messaging settings. messaging_enabled = directory toggle AND a profile chosen AND the messaging entitlement. Replaces client_messaging_settings for directories.';


-- 6) Backfill ----------------------------------------------------------------
-- One "Default" profile per client with messaging on or any email config.
create temporary table _messaging_backfill (client_id text primary key, profile_id uuid not null) on commit drop;

with created as (
  insert into public.messaging_profiles (
    client_id, name, email_from_name, email_from_address, email_domain,
    resend_domain_id, email_domain_status, email_dns_records
  )
  select
    c.id, 'Default', c.email_from_name, c.email_from_address, c.email_domain,
    c.resend_domain_id, c.email_domain_status, c.email_dns_records
  from public.clients c
  where c.messaging_enabled
     or c.email_from_name is not null or c.email_from_address is not null
     or c.email_domain is not null or c.resend_domain_id is not null
     or c.email_message_intro is not null or c.email_message_subject is not null
     or c.messaging_prompt is not null
  returning id, client_id
)
insert into _messaging_backfill (client_id, profile_id)
select client_id, id from created;

update public.maps m
set messaging_profile_id = b.profile_id,
    messaging_enabled    = c.messaging_enabled,
    email_test_mode      = c.email_test_mode,
    email_test_recipient = c.email_test_recipient,
    message_prompt       = c.messaging_prompt,
    message_subject      = c.email_message_subject,
    message_intro        = c.email_message_intro
from _messaging_backfill b
join public.clients c on c.id = b.client_id
where m.client_id = b.client_id;

update public.directories d
set messaging_profile_id = b.profile_id,
    messaging_enabled    = c.messaging_enabled,
    email_test_mode      = c.email_test_mode,
    email_test_recipient = c.email_test_recipient,
    message_prompt       = c.messaging_prompt,
    message_subject      = c.email_message_subject,
    message_intro        = c.email_message_intro
from _messaging_backfill b
join public.clients c on c.id = b.client_id
where d.client_id = b.client_id;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
declare
  expected int;
  actual   int;
begin
  select count(*) into expected from public.clients c
  where c.messaging_enabled
     or c.email_from_name is not null or c.email_from_address is not null
     or c.email_domain is not null or c.resend_domain_id is not null
     or c.email_message_intro is not null or c.email_message_subject is not null
     or c.messaging_prompt is not null;
  select count(*) into actual from public.messaging_profiles;
  if expected <> actual then
    raise exception 'VERIFY FAILED: expected % profiles, found %', expected, actual;
  end if;

  -- Every map/directory of a backfilled client is linked.
  if exists (
    select 1 from public.maps m
    where m.messaging_profile_id is null
      and exists (select 1 from public.messaging_profiles p where p.client_id = m.client_id)
  ) then
    raise exception 'VERIFY FAILED: a map of a backfilled client has no profile';
  end if;
  if exists (
    select 1 from public.directories d
    where d.messaging_profile_id is null
      and exists (select 1 from public.messaging_profiles p where p.client_id = d.client_id)
  ) then
    raise exception 'VERIFY FAILED: a directory of a backfilled client has no profile';
  end if;

  -- Nothing links across clients.
  if exists (select 1 from public.maps m join public.messaging_profiles p on p.id = m.messaging_profile_id where p.client_id <> m.client_id)
     or exists (select 1 from public.directories d join public.messaging_profiles p on p.id = d.messaging_profile_id where p.client_id <> d.client_id) then
    raise exception 'VERIFY FAILED: a map/directory is linked to another client''s profile';
  end if;

  raise notice 'VERIFY PASSED: % profiles created and linked', actual;
end $$;

-- Row counts -- clients/maps/directories/listings must match the pre-migration output.
select 'clients' as tbl, count(*) as rows from public.clients union all
select 'maps', count(*) from public.maps union all
select 'directories', count(*) from public.directories union all
select 'listings', count(*) from public.listings union all
select 'messaging_profiles', count(*) from public.messaging_profiles
order by tbl;

-- RLS enabled on the new table (must be true).
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('messaging_profiles', 'maps', 'directories', 'clients')
order by tablename;

-- Orphan checks (all must return 0).
select count(*) as orphaned_profiles from public.messaging_profiles p where not exists (select 1 from public.clients c where c.id = p.client_id);
select count(*) as orphaned_maps from public.maps m where not exists (select 1 from public.clients c where c.id = m.client_id);
select count(*) as orphaned_directories from public.directories d where not exists (select 1 from public.clients c where c.id = d.client_id);

-- PARITY CHECK: the new per-entity "effective enabled" must equal the old
-- per-client view for every map/directory of a backfilled client.
-- Must return 0 rows.
select m.id as map_id, mms.messaging_enabled as new_enabled, cms.messaging_enabled as old_enabled
from public.maps m
join public.map_messaging_settings mms on mms.map_id = m.id
join public.client_messaging_settings cms on cms.client_id = m.client_id
where mms.messaging_enabled is distinct from cms.messaging_enabled
union all
select d.id, dms.messaging_enabled, cms.messaging_enabled
from public.directories d
join public.directory_messaging_settings dms on dms.directory_id = d.id
join public.client_messaging_settings cms on cms.client_id = d.client_id
where dms.messaging_enabled is distinct from cms.messaging_enabled;
