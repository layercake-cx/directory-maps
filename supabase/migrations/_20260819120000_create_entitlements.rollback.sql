-- ============================================================
-- Rollback: 20260819120000_create_entitlements
-- Reverses: drops the get_my_entitlements() RPC, the six new entitlement
--           tables (their RLS policies are dropped automatically with the
--           tables), the three entitlement enums, and clients.plan_key.
--
-- Note: dropping these tables/column stops entitlement resolution for
-- everyone only if the frontend also fails closed on RPC error (it does —
-- EntitlementsProvider fails to {} the same way FeatureFlagsProvider does).
-- If you roll back the DB but not the frontend, get_my_entitlements() will
-- 404 and every entitlement resolves to its fail-closed default (off/zero),
-- which is safe but will visibly hide any entitled functionality.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  -- 1. Confirm there is something to roll back
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'products'
  ) then
    raise exception 'ABORT: nothing to roll back — public.products does not exist';
  end if;

  -- 2. Data-loss guard — abort if any per-client overrides have been set,
  --    since dropping the table silently revokes those grants.
  if exists (select 1 from public.client_overrides limit 1) then
    raise exception
      'ABORT: per-client overrides exist in public.client_overrides. '
      'Record which clients were granted which entitlements before rolling back. '
      'To override, remove this check and re-run.';
  end if;

  -- 3. Data-loss guard — abort if any client has been assigned a real plan
  --    (including Founder), since dropping the column silently loses it.
  if exists (select 1 from public.clients where plan_key <> 'standard') then
    raise exception
      'ABORT: one or more clients have plan_key <> ''standard'' (a real plan '
      'assignment, including Founder). Record these before rolling back. '
      'To override, remove this check and re-run.';
  end if;

  -- 4. Data-loss guard — abort if any usage has been recorded.
  if exists (select 1 from public.usage_counters where used_amount <> 0 limit 1) then
    raise exception
      'ABORT: public.usage_counters has non-zero usage recorded. '
      'Export it before rolling back. To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.get_my_entitlements();

drop table if exists public.usage_counters;
drop table if exists public.client_overrides;
drop table if exists public.plan_features;
drop table if exists public.features;
drop table if exists public.plans;
drop table if exists public.products;

alter table public.clients drop column if exists plan_key;

drop type if exists public.entitlement_downgrade_policy;
drop type if exists public.entitlement_enforcement;
drop type if exists public.entitlement_type;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('products', 'plans', 'features', 'plan_features', 'client_overrides', 'usage_counters')
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: an entitlements table still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'plan_key'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: clients.plan_key still exists';
  end if;
  if exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'get_my_entitlements'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: get_my_entitlements() still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — core tables must be unchanged
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'contacts',  count(*) from public.contacts
order by tbl;
