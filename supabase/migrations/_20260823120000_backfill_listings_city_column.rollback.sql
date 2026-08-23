-- ============================================================
-- Rollback: 20260823120000_backfill_listings_city_column
-- Reverses: add column city to listings
--
-- CAUTION: on any environment where `city` predates this migration
-- (staging, as of 2026-08-23), this drops a column that already had
-- data before this migration ever ran. Do not run this rollback on
-- staging. It is only safe on an environment where this migration was
-- the one that introduced the column (production, as of 2026-08-23) —
-- the live-data guard below will refuse to run if any row has a value.
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'city'
  ) then
    raise exception 'ABORT: column city does not exist — nothing to roll back';
  end if;

  if exists (select 1 from public.listings where city is not null limit 1) then
    raise exception 'ABORT: city has live data — confirm this environment is the one this migration added the column to before overriding this check.';
  end if;
end $$;

-- THE ROLLBACK
alter table public.listings drop column if exists city;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'city'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: column city still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: city column removed';
end $$;
