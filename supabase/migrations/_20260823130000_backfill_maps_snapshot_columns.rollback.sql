-- ============================================================
-- Rollback: 20260823130000_backfill_maps_snapshot_columns
-- Reverses: add columns snapshot_url and snapshot_generated_at to maps
--
-- CAUTION: on any environment where these columns predate this
-- migration (production, as of 2026-08-23), this drops columns that
-- already had live data before this migration ever ran. Do not run
-- this rollback on production. It is only safe on an environment where
-- this migration was the one that introduced the columns (staging, as
-- of 2026-08-23) — the live-data guard below will refuse to run if any
-- row has a value.
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maps'
      and column_name = 'snapshot_url'
  ) then
    raise exception 'ABORT: column snapshot_url does not exist — nothing to roll back';
  end if;

  if exists (select 1 from public.maps where snapshot_url is not null limit 1) then
    raise exception 'ABORT: snapshot_url has live data — confirm this environment is the one this migration added the columns to before overriding this check.';
  end if;
end $$;

-- THE ROLLBACK
alter table public.maps
  drop column if exists snapshot_url,
  drop column if exists snapshot_generated_at;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maps'
      and column_name = 'snapshot_url'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: column snapshot_url still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: snapshot_url and snapshot_generated_at removed';
end $$;
