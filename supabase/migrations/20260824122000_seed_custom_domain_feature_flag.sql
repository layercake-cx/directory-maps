-- ============================================================
-- Migration: 20260824122000_seed_custom_domain_feature_flag
-- Description: Registers the 'custom_domain' beta flag (mirrors
--              'directory_pages' and 'ai_search'). Lets platform admins
--              pre-release the "Bring Your Own Domain" epic (client-
--              configured custom domains/subdomains, per-domain Google
--              Analytics, and the full interactive map at [domain]/map) on
--              a per-customer basis, ahead of the commercial entitlement.
--              Off by default for customers; on for admins and
--              @layercake-cx.biz users; grantable per-customer via
--              feature_flag_overrides.
--
--              Reminder for whoever wires the admin UI: this flag does not
--              get an admin toggle for free — AdminClientDetail.jsx needs
--              its own manually-added checkbox, exactly like the gap just
--              patched for directory_pages (see docs/DEPLOYMENTS.md,
--              2026-08-23).
-- Affected tables: feature_flags (row added)
-- Rollback: _20260824122000_seed_custom_domain_feature_flag.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-24
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
    select 1 from public.feature_flags where key = 'custom_domain'
  ) then
    raise exception 'ABORT: feature_flags.custom_domain already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

insert into public.feature_flags (key, description, default_enabled, internal_enabled)
values (
  'custom_domain',
  'Bring Your Own Domain: client-configured custom domain/subdomain publishing, with per-domain Google Analytics and the full interactive map at [domain]/map (in development). Off for customers; on for admins and @layercake-cx.biz users; grantable per-customer.',
  false,
  true
);


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.feature_flags where key = 'custom_domain'
  ) then
    raise exception 'VERIFY FAILED: feature_flags.custom_domain was not created';
  end if;
  raise notice 'VERIFY PASSED: custom_domain feature flag registered';
end $$;
