-- ============================================================
-- Rollback: 20260601110000_add_messaging_to_clients
-- Reverts: messaging_enabled / messaging_prompt columns + client_messaging_settings view
-- ============================================================

-- DRY-RUN:
--   BEGIN;
--   <paste body here>
--   ROLLBACK;

-- 1. Drop the view first (depends on the columns)
drop view if exists public.client_messaging_settings;

-- 2. Drop columns
alter table public.clients
  drop column if exists messaging_enabled,
  drop column if exists messaging_prompt;

-- Verify rollback
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'clients'
      and column_name  = 'messaging_enabled'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: messaging_enabled still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
