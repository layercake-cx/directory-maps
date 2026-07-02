-- ============================================================
-- Rollback: 20260702130000_beta_signups_status
-- Reverses: add column status to beta_signups + beta_signups_admin_update policy
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'beta_signups'
      and column_name = 'status'
  ) then
    raise exception 'ABORT: column status does not exist — nothing to roll back';
  end if;

  -- Safety: refuse if any lead has been moved off the default status
  -- (an admin has done real triage work that would be lost).
  if exists (
    select 1 from public.beta_signups where status <> 'To be actioned' limit 1
  ) then
    raise exception 'ABORT: beta_signups has leads with a non-default status — back up before rolling back. '
      'To override, delete this check and re-run.';
  end if;
end $$;

-- THE ROLLBACK
drop policy if exists "beta_signups_admin_update" on public.beta_signups;
alter table public.beta_signups drop column if exists status;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'beta_signups'
      and column_name = 'status'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: column status still exists';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beta_signups'
      and policyname = 'beta_signups_admin_update'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: policy beta_signups_admin_update still exists';
  end if;

  raise notice 'ROLLBACK VERIFY PASSED: status column and admin update policy removed';
end $$;
