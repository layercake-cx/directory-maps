-- ============================================================
-- Rollback: 20260820120000_seed_max_maps_entitlement
-- Reverses: drops the enforce_max_maps_limit() trigger + function, then
--           deletes the maps.max_maps features row (cascades to its
--           plan_features/client_overrides/usage_counters rows via the
--           existing FK on delete cascade).
--
-- Note: once rolled back, map creation is no longer capped for anyone —
-- get_my_entitlements() and the (now-removed) trigger both fail open when
-- the catalog row is missing, so this is safe to roll back without breaking
-- map creation, just without the limit.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.features where product_key = 'maps' and key = 'max_maps'
  ) then
    raise exception 'ABORT: nothing to roll back — features.maps.max_maps does not exist';
  end if;

  -- Data-loss guard — abort if any per-client overrides have been set for
  -- this feature, since deleting the features row cascades and silently
  -- revokes them.
  if exists (
    select 1 from public.client_overrides ov
    join public.features f on f.id = ov.feature_id
    where f.product_key = 'maps' and f.key = 'max_maps'
    limit 1
  ) then
    raise exception
      'ABORT: per-client overrides exist for maps.max_maps. '
      'Record which clients were granted which overrides before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop trigger if exists trg_enforce_max_maps_limit on public.maps;
drop function if exists public.enforce_max_maps_limit();

delete from public.features where product_key = 'maps' and key = 'max_maps';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.features where product_key = 'maps' and key = 'max_maps'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: features.maps.max_maps still exists';
  end if;
  if exists (
    select 1 from pg_trigger where tgname = 'trg_enforce_max_maps_limit'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: trg_enforce_max_maps_limit still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — core tables must be unchanged
select
  'clients' as tbl, count(*) as rows from public.clients union all
  select 'maps',    count(*) from public.maps
order by tbl;
