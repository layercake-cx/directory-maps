-- ============================================================
-- Migration: 20261117120000_retire_ai_platform_provider_flag
-- Description: Removes the retired `ai_platform_provider` feature flag and its
--   per-client overrides. The AI Gateway stopped reading the flag on 2026-11-17
--   (no fallback to a Layercake-held AI account), so the rows are dead config.
--   This is a DELETE of config rows: explicitly signed off by the user on 2026-11-17.
-- Affected tables: feature_flags (1 row), feature_flag_overrides (rows for that flag only)
-- Rollback: _20261117120000_retire_ai_platform_provider_flag.rollback.sql
-- Author: Claude
-- Date: 2026-11-17
-- ============================================================
--
-- DRY-RUN BLOCK (run this first -- it makes NO persistent changes):
--
--   BEGIN;
--   <paste the "MIGRATION" section below>
--   ROLLBACK;
--
-- INTEGRITY CHECKLIST (run before AND after, compare):
--
--   select count(*) as flags            from public.feature_flags;
--   select count(*) as overrides_all    from public.feature_flag_overrides;
--   select count(*) as overrides_this   from public.feature_flag_overrides where flag_key = 'ai_platform_provider';
--   select count(*) as clients          from public.clients;
--
--   Expected after: flags -1 (if the flag existed), overrides_all - overrides_this,
--   overrides_this = 0, clients unchanged. No other flag's overrides may change.
-- ============================================================

-- MIGRATION ---------------------------------------------------------------

-- Idempotent: safe if the flag is already gone. Overrides first (they reference the flag).
delete from public.feature_flag_overrides where flag_key = 'ai_platform_provider';
delete from public.feature_flags where key = 'ai_platform_provider';

do $$
begin
  if exists (select 1 from public.feature_flags where key = 'ai_platform_provider')
     or exists (select 1 from public.feature_flag_overrides where flag_key = 'ai_platform_provider') then
    raise exception 'ABORT: ai_platform_provider rows still present after delete';
  end if;
  raise notice 'VERIFY PASSED: ai_platform_provider flag and overrides removed';
end $$;
