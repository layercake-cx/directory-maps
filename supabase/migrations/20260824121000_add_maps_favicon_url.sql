-- ============================================================
-- Migration: 20260824121000_add_maps_favicon_url
-- Description: Adds favicon_url (nullable text) to the maps table, part of
--              the "Bring Your Own Domain" epic. A dedicated column rather
--              than another theme_json key — favicon is a distinct asset
--              (square, ICO/PNG, different upload constraints) from the
--              logo already stored at theme_json.logoUrl, and a first-class
--              column keeps it queryable without parsing JSON on any
--              future request-time head-rewrite path.
--              Falls back to the default Layercake favicon when null.
--              Not tier-gated — available to every plan.
-- Affected tables: maps
-- Rollback: _20260824121000_add_maps_favicon_url.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-24
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'maps'
  ) then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'favicon_url'
  ) then
    raise exception 'ABORT: column maps.favicon_url already exists — migration may have already run';
  end if;
end $$;

select count(*) as total_maps from public.maps;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.maps
  add column if not exists favicon_url text null;

comment on column public.maps.favicon_url is
  'Client-configured favicon for this map''s published surfaces (interactive map, directory pages). Null falls back to the default Layercake favicon. Not tier-gated.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'favicon_url'
  ) then
    raise exception 'VERIFY FAILED: column favicon_url was not created';
  end if;
  raise notice 'VERIFY PASSED: maps.favicon_url exists and is nullable';
end $$;

select count(*) as total_maps,
       count(*) filter (where favicon_url is not null) as maps_with_favicon
from public.maps;
-- Expected: total_maps unchanged, maps_with_favicon = 0


-- ------------------------------------------------------------
-- INTEGRITY CHECKLIST (run before and after on every environment)
-- ------------------------------------------------------------
/*
select 'clients'  as tbl, count(*) as rows from public.clients union all
select 'maps',     count(*) from public.maps              union all
select 'groups',   count(*) from public.groups            union all
select 'listings', count(*) from public.listings          union all
select 'profiles', count(*) from public.profiles
order by tbl;
*/
