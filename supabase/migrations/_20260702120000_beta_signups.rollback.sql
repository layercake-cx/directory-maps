-- ============================================================
-- Rollback: 20260702120000_beta_signups
-- Reverses: create table beta_signups
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'beta_signups'
  ) then
    raise exception 'ABORT: table public.beta_signups does not exist — nothing to roll back';
  end if;

  -- Safety: refuse if any rows have data (real enquiries would be lost).
  if exists (select 1 from public.beta_signups limit 1) then
    raise exception 'ABORT: beta_signups has live data — back it up before rolling back. '
      'To override, delete this check and re-run.';
  end if;
end $$;

-- THE ROLLBACK
drop table if exists public.beta_signups;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'beta_signups'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: table beta_signups still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: beta_signups table removed';
end $$;
