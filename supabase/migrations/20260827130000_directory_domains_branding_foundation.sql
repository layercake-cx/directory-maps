-- ============================================================
-- Migration: 20260827130000_directory_domains_branding_foundation
-- Description: Phase 4a of the Directories build-out (DIR-E3 — Branding &
--              Custom Domain, data layer only).
--
--              1) directories.theme_json — branding blob, same flat-jsonb
--                 shape/convention as maps.theme_json. No editor UI yet
--                 (a later phase) — this is just the column.
--
--              2) client_domains made entity-polymorphic. It was built
--                 (20260824120000) with map_id not null — one domain, one
--                 map. Generalizing rather than building a parallel
--                 directory_domain_mappings table (which is what
--                 docs/DIRECTORIES.md §4.6 originally specced, before this
--                 table existed — that doc predates 2026-08-24 and is
--                 stale on this point, already flagged in this session's
--                 plan). map_id becomes nullable; a new nullable
--                 directory_id is added; a check constraint requires
--                 exactly one of the two set. No existing row is affected
--                 (every current row already has map_id set, directory_id
--                 will be null, satisfying the new constraint trivially).
--
--              3) resolve_custom_domain(hostname) regenerated with a new
--                 return shape: (entity_type, client_slug, entity_slug,
--                 status) instead of the old (client_slug, map_slug,
--                 status). Postgres can't CREATE OR REPLACE a function
--                 across a return-type change, so this drops and recreates
--                 it — same name, same security-definer/anon-grant
--                 contract, so no caller needs to look it up again, but
--                 middleware.js's use of the old column names must be
--                 updated in the same deploy (this migration does not
--                 change the actual routing decisions — the map branch is
--                 unaffected either way, since the new entity_slug carries
--                 the same value the old map_slug did for map-backed
--                 domains).
--
--              Directory custom domains gate on the `directories` feature
--              flag only (no separate commercial entitlement exists for
--              this entity yet — same resolution already made for
--              generate_directory_site's directories-flag check, as
--              opposed to reusing features.maps.custom_domain, which is a
--              maps-specific paid entitlement this table's existing
--              gating already depends on for map domains). That gating
--              lives in the manage_client_domain Edge Function (a later
--              phase, not this migration).
-- Affected tables: directories (1 new column), client_domains (map_id
--                   nullable, 1 new column, 1 new check constraint)
-- Affected functions: resolve_custom_domain (dropped and recreated with a
--                      new return shape)
-- Rollback: _20260827130000_directory_domains_branding_foundation.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-27
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off, and NOT before
-- middleware.js's corresponding update is deployed alongside it (the old
-- resolve_custom_domain return shape stops existing the moment this runs —
-- deploying this without the middleware.js update in the same release
-- would break custom-domain routing for every live map customer).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'client_domains') then
    raise exception 'ABORT: table public.client_domains does not exist';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'theme_json') then
    raise exception 'ABORT: directories.theme_json already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_domains' and column_name = 'directory_id') then
    raise exception 'ABORT: client_domains.directory_id already exists — migration may have already run';
  end if;
  -- Confirm every existing client_domains row currently has map_id set —
  -- the whole point of the check constraint we're about to add.
  if exists (select 1 from public.client_domains where map_id is null) then
    raise exception 'ABORT: found a client_domains row with a null map_id already — investigate before proceeding';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'directories' as tbl, count(*) as rows from public.directories       union all
  select 'client_domains', count(*) from public.client_domains
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) directories.theme_json — same convention as maps.theme_json.
alter table public.directories
  add column theme_json jsonb null;

comment on column public.directories.theme_json is
  'Branding: brand colours, logo, layout preferences (build-scope §5.1/docs/DIRECTORIES.md §4.1). Same flat-jsonb-blob convention as maps.theme_json. No editor UI yet.';

-- 2) client_domains: map_id -> nullable, add directory_id, add exclusive-or check.
alter table public.client_domains
  alter column map_id drop not null;

alter table public.client_domains
  add column directory_id text null references public.directories(id) on delete cascade;

alter table public.client_domains
  add constraint client_domains_one_entity check (
    (case when map_id is not null then 1 else 0 end)
    + (case when directory_id is not null then 1 else 0 end) = 1
  );

create index idx_client_domains_directory on public.client_domains(directory_id);

comment on column public.client_domains.map_id is 'The map this domain publishes, when entity is a map (exclusive with directory_id — see client_domains_one_entity).';
comment on column public.client_domains.directory_id is 'The directory this domain publishes, when entity is a directory (exclusive with map_id — see client_domains_one_entity).';
comment on constraint client_domains_one_entity on public.client_domains is 'Exactly one of map_id/directory_id must be set — a domain belongs to exactly one entity.';

-- 3) resolve_custom_domain: new return shape (entity_type, client_slug,
--    entity_slug, status). Drop first — CREATE OR REPLACE cannot change a
--    function's return type.
drop function if exists public.resolve_custom_domain(text);

create function public.resolve_custom_domain(p_hostname text)
returns table(entity_type text, client_slug text, entity_slug text, status text)
language sql
security definer
stable
set search_path = public
as $$
  select 'map'::text, c.slug, m.slug, cd.status
  from public.client_domains cd
  join public.clients c on c.id = cd.client_id
  join public.maps m on m.id = cd.map_id
  where cd.map_id is not null
    and lower(cd.hostname) = lower(p_hostname)
  union all
  select 'directory'::text, c.slug, d.slug, cd.status
  from public.client_domains cd
  join public.clients c on c.id = cd.client_id
  join public.directories d on d.id = cd.directory_id
  where cd.directory_id is not null
    and lower(cd.hostname) = lower(p_hostname)
  limit 1;
$$;

comment on function public.resolve_custom_domain(text) is
  'Resolves a hostname to the client + (map or directory) it publishes, for Vercel Edge Middleware host-based routing. entity_type discriminates which. Returns status regardless of value (pending/verifying/active/failed) so the caller can distinguish "not registered" from "registered but not live yet". Security definer — exposes only entity_type/slugs/status, never other clients/maps/directories columns, so it is safe to grant to anon. Generalizes the original map-only resolver (20260824130000) — same name/grants/security-definer contract, callers only need to update which columns they read from the result.';

revoke all on function public.resolve_custom_domain(text) from public;
grant execute on function public.resolve_custom_domain(text) to anon, authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'theme_json') then
    raise exception 'VERIFY FAILED: directories.theme_json was not created';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_domains' and column_name = 'directory_id') then
    raise exception 'VERIFY FAILED: client_domains.directory_id was not created';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_domains' and column_name = 'map_id' and is_nullable = 'NO') then
    raise exception 'VERIFY FAILED: client_domains.map_id is still NOT NULL';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_domains_one_entity') then
    raise exception 'VERIFY FAILED: client_domains_one_entity constraint was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'resolve_custom_domain') then
    raise exception 'VERIFY FAILED: resolve_custom_domain() was not created';
  end if;
  -- Every pre-existing client_domains row must still satisfy the new
  -- constraint (map_id set, directory_id null) — re-check explicitly
  -- rather than trusting the constraint alone caught it at ALTER time.
  if exists (select 1 from public.client_domains where map_id is null and directory_id is null) then
    raise exception 'VERIFY FAILED: a client_domains row has neither map_id nor directory_id set';
  end if;
  if exists (select 1 from public.resolve_custom_domain('__nonexistent_hostname__.invalid')) then
    raise exception 'VERIFY FAILED: resolver returned a row for a hostname that should not exist';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Row counts — directories/client_domains counts must be unchanged (additive only)
select
  'directories' as tbl, count(*) as rows from public.directories       union all
  select 'client_domains', count(*) from public.client_domains
order by tbl;

-- Confirm no existing (map-backed) domain lost its map_id
select count(*) as domains_missing_map_id from public.client_domains where map_id is null and directory_id is null;
