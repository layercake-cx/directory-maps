-- ============================================================
-- Migration: 20260805120000_create_feature_flags
-- Description: Generic feature-flag layer so in-development features
--              can be tested in production and pre-released to named
--              customers before general availability.
--
--              Two tables:
--                - feature_flags            (registry: one row per flag +
--                                            its global default and whether
--                                            internal @layercake-cx.biz users
--                                            see it automatically)
--                - feature_flag_overrides   (per-organisation allow/deny list —
--                                            this is how a specific customer is
--                                            let into a beta feature)
--
--              Resolution precedence (highest first) is centralised in the
--              security-definer RPC public.get_my_feature_flags():
--                1. platform admin (profiles.role = 'admin')         -> true
--                2. internal user (@layercake-cx.biz) AND
--                   flag.internal_enabled                            -> true
--                3. per-organisation override                        -> its value
--                4. flag.default_enabled                             -> default
--
--              Seeds one flag: 'directories' (Directories & Categorisations,
--              in development) — default OFF, internal ON.
--
--              This is UI/route gating for unreleased features, NOT a
--              security boundary; the underlying directory tables remain
--              tenant-scoped by their own RLS regardless of this flag.
-- Affected tables: feature_flags, feature_flag_overrides (both new)
-- Rollback: _20260805120000_create_feature_flags.rollback.sql
-- Author: Cursor agent
-- Date: 2026-08-05
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

-- A) Confirm the objects we reference exist
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clients'
  ) then
    raise exception 'ABORT: table public.clients does not exist';
  end if;
  if not exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'is_admin'
  ) then
    raise exception 'ABORT: function public.is_admin() does not exist';
  end if;
  if not exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'current_user_client_id'
  ) then
    raise exception 'ABORT: function public.current_user_client_id() does not exist';
  end if;
end $$;

-- B) Row counts — inspect before proceeding
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'contacts',  count(*) from public.contacts
order by tbl;
-- Save this output. You will compare it to the post-migration counts.

-- C) Idempotency guard — the new tables must NOT already exist
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('feature_flags', 'feature_flag_overrides')
  ) then
    raise exception 'ABORT: a feature-flag table already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Registry: one row per flag.
create table public.feature_flags (
  key              text primary key,
  description      text null,
  default_enabled  boolean not null default false,  -- global default when no override/segment matches
  internal_enabled boolean not null default true,   -- @layercake-cx.biz users see it automatically
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.feature_flags is
  'Registry of feature flags. default_enabled = global default; internal_enabled = auto-on for @layercake-cx.biz users. Resolution precedence lives in get_my_feature_flags().';

-- 2) Per-organisation overrides (the customer allow/deny list).
create table public.feature_flag_overrides (
  id         uuid primary key default gen_random_uuid(),
  flag_key   text not null references public.feature_flags(key) on delete cascade,
  client_id  text not null references public.clients(id) on delete cascade,
  enabled    boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flag_key, client_id)
);

create index idx_feature_flag_overrides_client on public.feature_flag_overrides(client_id);
create index idx_feature_flag_overrides_flag on public.feature_flag_overrides(flag_key);

comment on table public.feature_flag_overrides is
  'Per-organisation feature-flag overrides. One row grants (enabled=true) or denies (enabled=false) a flag to a single client, overriding the registry default. Used to pre-release a beta feature to specific customers.';

-- 3) Seed the first flag: Directories & Categorisations (in development).
insert into public.feature_flags (key, description, default_enabled, internal_enabled)
values (
  'directories',
  'Directories & Categorisations (in development). Off for customers; on for admins and @layercake-cx.biz users; grantable per-customer.',
  false,
  true
);

-- ------------------------------------------------------------
-- RLS: only platform admins touch the flag tables directly.
-- Regular users never read these tables from the client — they call
-- the security-definer RPC get_my_feature_flags() instead, which
-- resolves flags for the current user without exposing the registry.
-- ------------------------------------------------------------

alter table public.feature_flags enable row level security;
alter table public.feature_flag_overrides enable row level security;

create policy "feature_flags_admin_all"
  on public.feature_flags for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "feature_flag_overrides_admin_all"
  on public.feature_flag_overrides for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Data API grants (RLS still governs; these just let PostgREST reach the tables)
grant select, insert, update, delete on table public.feature_flags to authenticated, service_role;
grant select, insert, update, delete on table public.feature_flag_overrides to authenticated, service_role;

-- 4) Resolver RPC — returns { "<flag_key>": boolean, ... } for the current user.
create or replace function public.get_my_feature_flags()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with ctx as (
    select
      public.is_admin() as is_admin,
      lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2)) as email_domain,
      public.current_user_client_id() as client_id
  )
  select coalesce(
    jsonb_object_agg(
      f.key,
      case
        when ctx.is_admin then true
        when f.internal_enabled and ctx.email_domain = 'layercake-cx.biz' then true
        when ov.enabled is not null then ov.enabled
        else f.default_enabled
      end
    ),
    '{}'::jsonb
  )
  from public.feature_flags f
  cross join ctx
  left join public.feature_flag_overrides ov
    on ov.flag_key = f.key
   and ov.client_id = ctx.client_id;
$$;

comment on function public.get_my_feature_flags() is
  'Resolves all feature flags for the calling user. Precedence: admin > internal (@layercake-cx.biz + internal_enabled) > per-org override > default_enabled. Security-definer so callers never read the flag tables directly.';

grant execute on function public.get_my_feature_flags() to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'feature_flags') then
    raise exception 'VERIFY FAILED: feature_flags was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'feature_flag_overrides') then
    raise exception 'VERIFY FAILED: feature_flag_overrides was not created';
  end if;
  if not exists (select 1 from public.feature_flags where key = 'directories') then
    raise exception 'VERIFY FAILED: directories flag was not seeded';
  end if;
  if not exists (select 1 from information_schema.routines
      where routine_schema = 'public' and routine_name = 'get_my_feature_flags') then
    raise exception 'VERIFY FAILED: get_my_feature_flags() was not created';
  end if;
  raise notice 'VERIFY PASSED: feature-flag layer created';
end $$;

-- Row counts — clients/maps/contacts must be UNCHANGED from pre-migration.
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'contacts',  count(*) from public.contacts
order by tbl;

-- New tables: feature_flags = 1 (seeded), overrides = 0
select
  'feature_flags'          as tbl, count(*) as rows from public.feature_flags          union all
  select 'feature_flag_overrides', count(*) from public.feature_flag_overrides
order by tbl;

-- RLS enabled on the new tables (and core tables unaffected)
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('clients','contacts','profiles','feature_flags','feature_flag_overrides')
order by tablename;
-- All rows must show rowsecurity = true

-- Orphan check (new) — must return 0
select count(*) as orphaned_overrides
  from public.feature_flag_overrides o
  where not exists (select 1 from public.clients c where c.id = o.client_id)
     or not exists (select 1 from public.feature_flags f where f.key = o.flag_key);
-- Must return 0
