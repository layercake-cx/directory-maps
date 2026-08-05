-- ============================================================
-- Rollback: 20260805120000_create_feature_flags
-- Reverses: drops the get_my_feature_flags() RPC and the
--           feature_flag_overrides and feature_flags tables (their RLS
--           policies are dropped automatically with the tables).
--
-- Note: dropping these tables re-hides any flagged feature for everyone
-- except admins/internal users only if the frontend still resolves flags
-- to false on RPC error (it does — it fails closed). If you roll back the
-- DB but not the frontend, get_my_feature_flags() will 404 and all flags
-- resolve to their fail-closed default (off), which is safe.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  -- 1. Confirm there is something to roll back
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'feature_flags'
  ) then
    raise exception 'ABORT: nothing to roll back — public.feature_flags does not exist';
  end if;

  -- 2. Data-loss guard — abort if any per-customer overrides have been set,
  --    since dropping the table silently revokes those grants.
  if exists (select 1 from public.feature_flag_overrides limit 1) then
    raise exception
      'ABORT: per-customer overrides exist in public.feature_flag_overrides. '
      'Record which customers were granted which flags before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.get_my_feature_flags();
drop table if exists public.feature_flag_overrides;
drop table if exists public.feature_flags;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('feature_flags', 'feature_flag_overrides')
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: a feature-flag table still exists';
  end if;
  if exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'get_my_feature_flags'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: get_my_feature_flags() still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — core tables must be unchanged
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'contacts',  count(*) from public.contacts
order by tbl;
