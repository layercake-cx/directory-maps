-- ============================================================
-- Migration: 20260822210000_seed_directory_pages_feature_flag
-- Description: Registers the 'directory_pages' beta flag (mirrors
--              'ai_search' and 'directories'). Lets platform admins
--              pre-release Epic 3 (crawlable per-listing pages + directory
--              landing pages, schema.org markup, sitemap) on a per-customer
--              basis, ahead of the commercial entitlement.
--              Off by default for customers; on for admins and
--              @layercake-cx.biz users; grantable per-customer via
--              feature_flag_overrides.
-- Affected tables: feature_flags (row added)
-- Rollback: _20260822210000_seed_directory_pages_feature_flag.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-22
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'feature_flags'
  ) then
    raise exception 'ABORT: table public.feature_flags does not exist — apply 20260805120000_create_feature_flags.sql first';
  end if;
  if exists (
    select 1 from public.feature_flags where key = 'directory_pages'
  ) then
    raise exception 'ABORT: feature_flags.directory_pages already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

insert into public.feature_flags (key, description, default_enabled, internal_enabled)
values (
  'directory_pages',
  'Crawlable directory landing + per-listing pages for search/LLM discoverability (in development). Off for customers; on for admins and @layercake-cx.biz users; grantable per-customer.',
  false,
  true
);


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.feature_flags where key = 'directory_pages'
  ) then
    raise exception 'VERIFY FAILED: feature_flags.directory_pages was not created';
  end if;
  raise notice 'VERIFY PASSED: directory_pages feature flag registered';
end $$;
