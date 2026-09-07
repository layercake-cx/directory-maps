-- ============================================================
-- Rollback: 20260907120000_categorisations_applies_to_nullable
-- Reverses: dropping the NOT NULL constraint on
--           categorisations.applies_to
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to'
  ) then
    raise exception 'ABORT: column public.categorisations.applies_to does not exist';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to'
      and is_nullable = 'NO'
  ) then
    raise exception 'ABORT: categorisations.applies_to is already NOT NULL — nothing to roll back';
  end if;

  -- Safety: refuse if any row would violate the constraint being re-added
  if exists (select 1 from public.categorisations where applies_to is null limit 1) then
    raise exception 'ABORT: categorisations.applies_to has NULL rows (created after the forward migration). '
      'Backfill a value (e.g. ''both'') for those rows before re-adding NOT NULL, or this rollback will fail.';
  end if;
end $$;

-- THE ROLLBACK
alter table public.categorisations
  alter column applies_to set not null;

comment on column public.categorisations.applies_to is
  'Tags whether this categorisation applies to whole directories, individual entries, or both.';

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to'
      and is_nullable = 'YES'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: categorisations.applies_to is still nullable';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: categorisations.applies_to is NOT NULL again';
end $$;
