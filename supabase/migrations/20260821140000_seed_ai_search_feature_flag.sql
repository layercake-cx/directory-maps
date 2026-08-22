-- ============================================================
-- Migration: 20260821140000_seed_ai_search_feature_flag
-- Description: Registers the 'ai_search' beta flag (mirrors the existing
--              'directories' flag seeded in 20260805120000). Lets platform
--              admins pre-release the AI search enrichment settings on a
--              per-customer basis, ahead of any commercial entitlement.
--              Off by default for customers; on for admins and
--              @layercake-cx.biz users (existing get_my_feature_flags()
--              precedence); grantable per-customer via
--              feature_flag_overrides (AdminClientDetail.jsx "Feature
--              access (beta)" section).
-- Affected tables: feature_flags (row added)
-- Rollback: _20260821140000_seed_ai_search_feature_flag.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-21
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
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
    select 1 from public.feature_flags where key = 'ai_search'
  ) then
    raise exception 'ABORT: feature_flags.ai_search already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

insert into public.feature_flags (key, description, default_enabled, internal_enabled)
values (
  'ai_search',
  'AI search enrichment (in development). Off for customers; on for admins and @layercake-cx.biz users; grantable per-customer.',
  false,
  true
);


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.feature_flags where key = 'ai_search'
  ) then
    raise exception 'VERIFY FAILED: feature_flags.ai_search was not created';
  end if;
  raise notice 'VERIFY PASSED: ai_search feature flag registered';
end $$;
