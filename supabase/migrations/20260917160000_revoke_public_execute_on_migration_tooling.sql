-- ============================================================
-- Migration: 20260917160000_revoke_public_execute_on_migration_tooling
-- Description: SECURITY FIX. Postgres grants EXECUTE to PUBLIC by default
--              on every newly created function unless explicitly revoked.
--              The two migration-tooling migrations shipped earlier today
--              (20260917140000_group_migration_tooling,
--              20260917150000_filter_option_split_tooling) documented
--              these functions as "not granted to authenticated" but never
--              actually issued a REVOKE — so PUBLIC (which every anon and
--              authenticated connection is a member of) could execute
--              them. Confirmed directly: an unauthenticated anon-key POST
--              to /rest/v1/rpc/dry_run_group_migration on staging reached
--              the function body (returned its own "Map ... does not
--              exist" error, not a permission-denied error), proving it
--              is currently callable by anyone — and since these are all
--              `security definer` (bypassing RLS) with no caller-identity
--              check inside them, the same is true of the destructive
--              ones: migrate_map_groups_to_category and
--              split_composite_filter_option/
--              split_all_composite_options_for_field could currently be
--              invoked by any anon or authenticated client against ANY
--              map, not just by a privileged connection as intended.
--              This migration revokes EXECUTE from PUBLIC on all eight
--              functions (nothing is granted back to any role — only a
--              superuser/service-role connection can invoke them from
--              here on, which is the originally intended, documented
--              behaviour). This has not reached production yet (neither
--              tooling migration has been applied there) — this fix
--              ships in the same batch, before any of them do.
-- Affected: function grants only (no table data, no function bodies)
-- Rollback: _20260917160000_revoke_public_execute_on_migration_tooling.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-17
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- immediately -> production only needs this once the tooling migrations
-- themselves are applied there (apply together, never the tooling without
-- this fix).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'migrate_map_groups_to_category') then
    raise exception 'ABORT: migrate_map_groups_to_category does not exist — apply 20260917140000_group_migration_tooling.sql first';
  end if;
  if not exists (select 1 from pg_proc where proname = 'split_composite_filter_option') then
    raise exception 'ABORT: split_composite_filter_option does not exist — apply 20260917150000_filter_option_split_tooling.sql first';
  end if;
end $$;

-- Confirm the gap before fixing it (informational — inspect the output).
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'dry_run_group_migration', 'migrate_map_groups_to_category', 'verify_group_migration',
    'dry_run_split_composite_options', 'split_composite_filter_option',
    'split_all_composite_options_for_field', 'verify_field_has_no_composite_options',
    '_slugify_option_value'
  )
order by routine_name, grantee;
-- Expect to see PUBLIC (or postgres/supabase roles) listed as grantee with EXECUTE
-- before this migration runs — that is the gap this migration closes.


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- Supabase's schema-level default privileges grant EXECUTE to anon and
-- authenticated explicitly at function-creation time (in addition to the
-- Postgres default PUBLIC grant) — revoke from all three explicitly.
revoke execute on function public.dry_run_group_migration(text) from public, anon, authenticated;
revoke execute on function public.migrate_map_groups_to_category(text) from public, anon, authenticated;
revoke execute on function public.verify_group_migration(text) from public, anon, authenticated;
revoke execute on function public.dry_run_split_composite_options(uuid, text) from public, anon, authenticated;
revoke execute on function public.split_composite_filter_option(uuid, text) from public, anon, authenticated;
revoke execute on function public.split_all_composite_options_for_field(uuid, text) from public, anon, authenticated;
revoke execute on function public.verify_field_has_no_composite_options(uuid, text) from public, anon, authenticated;
revoke execute on function public._slugify_option_value(uuid, text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
declare
  v_leftover integer;
begin
  select count(*) into v_leftover
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name in (
      'dry_run_group_migration', 'migrate_map_groups_to_category', 'verify_group_migration',
      'dry_run_split_composite_options', 'split_composite_filter_option',
      'split_all_composite_options_for_field', 'verify_field_has_no_composite_options',
      '_slugify_option_value'
    )
    and grantee in ('PUBLIC', 'anon', 'authenticated');

  if v_leftover > 0 then
    raise exception 'VERIFY FAILED: % grant(s) to PUBLIC/anon/authenticated still remain on migration-tooling functions', v_leftover;
  end if;

  raise notice 'VERIFY PASSED: PUBLIC/anon/authenticated execute revoked on all migration-tooling functions';
end $$;

-- Confirm no app-facing role can execute these anymore.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'dry_run_group_migration', 'migrate_map_groups_to_category', 'verify_group_migration',
    'dry_run_split_composite_options', 'split_composite_filter_option',
    'split_all_composite_options_for_field', 'verify_field_has_no_composite_options',
    '_slugify_option_value'
  )
  and grantee in ('PUBLIC', 'anon', 'authenticated');
-- Expected: 0 rows
