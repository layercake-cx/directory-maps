-- ============================================================
-- Migration: 20260923120000_seed_claims_feature_flag
-- Description: Registers the 'claims' beta flag (mirrors 'custom_domain'
--              and 'directory_pages'). Lets platform admins pre-release the
--              "Claimed Directory Listings" epic (organisations claiming,
--              verifying and managing their own directory entry) on a
--              per-customer basis, ahead of the commercial entitlement and
--              ahead of any UI existing to configure it.
--              Off by default for customers; on for admins and
--              @layercake-cx.biz users; grantable per-customer via
--              feature_flag_overrides.
--
--              Reminder for whoever wires the admin UI: this flag does not
--              get an admin toggle for free — AdminClientDetail.jsx needs
--              its own manually-added checkbox, exactly like the gap
--              patched for directory_pages/custom_domain
--              (see docs/DEPLOYMENTS.md, 2026-08-23 and 2026-08-24).
-- Affected tables: feature_flags (row added)
-- Rollback: _20260923120000_seed_claims_feature_flag.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-23
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
    select 1 from public.feature_flags where key = 'claims'
  ) then
    raise exception 'ABORT: feature_flags.claims already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

insert into public.feature_flags (key, description, default_enabled, internal_enabled)
values (
  'claims',
  'Claimed Directory Listings: lets an organisation represented in a directory claim, verify, and manage its own directory entry (contact details, SEO, body content, team members) without becoming a directory administrator (in development). Off for customers; on for admins and @layercake-cx.biz users; grantable per-customer.',
  false,
  true
);


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.feature_flags where key = 'claims'
  ) then
    raise exception 'VERIFY FAILED: feature_flags.claims was not created';
  end if;
  raise notice 'VERIFY PASSED: claims feature flag registered';
end $$;
