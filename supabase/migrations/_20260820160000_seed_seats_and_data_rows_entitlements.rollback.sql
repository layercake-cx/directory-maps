-- ============================================================
-- Rollback: 20260820160000_seed_seats_and_data_rows_entitlements
-- Reverses: drops the enforce_seats_limit()/enforce_data_rows_limit()
--           triggers + functions, then deletes the maps.seats and
--           maps.data_rows features rows (cascades to their plan_features/
--           client_overrides rows via the existing FK on delete cascade).
--
-- Note: once rolled back, team-seat and data-row creation is uncapped again
-- (fails open when the catalog row is missing) — safe, just without the
-- limits. No existing contacts/listings rows are touched either way.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.features where product_key = 'maps' and key in ('seats', 'data_rows')
  ) then
    raise exception 'ABORT: nothing to roll back — features.maps.seats/data_rows do not exist';
  end if;

  -- Data-loss guard — abort if any override exists for either feature,
  -- since dropping the catalog row cascades and silently revokes it.
  if exists (
    select 1 from public.client_overrides ov
    join public.features f on f.id = ov.feature_id
    where f.product_key = 'maps' and f.key in ('seats', 'data_rows')
    limit 1
  ) then
    raise exception
      'ABORT: per-client overrides exist for maps.seats or maps.data_rows. '
      'Record which clients were granted which overrides before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop trigger if exists trg_enforce_seats_limit on public.contacts;
drop function if exists public.enforce_seats_limit();

drop trigger if exists trg_enforce_data_rows_limit on public.listings;
drop function if exists public.enforce_data_rows_limit();

delete from public.features where product_key = 'maps' and key in ('seats', 'data_rows');


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.features where product_key = 'maps' and key in ('seats', 'data_rows')
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: a maps.seats/data_rows features row still exists';
  end if;
  if exists (select 1 from pg_trigger where tgname in ('trg_enforce_seats_limit', 'trg_enforce_data_rows_limit')) then
    raise exception 'ROLLBACK VERIFY FAILED: one of the enforcement triggers still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — core tables must be unchanged
select
  'clients'  as tbl, count(*) as rows from public.clients  union all
  select 'contacts', count(*) from public.contacts         union all
  select 'listings', count(*) from public.listings
order by tbl;
