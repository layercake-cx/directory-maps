-- ============================================================
-- Rollback: 20260820150000_add_get_client_entitlements_rpc
-- Reverses: drops get_client_entitlements(text). No data was created by
-- the forward migration, so this is a plain drop with no data-loss guard
-- needed.
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'get_client_entitlements') then
    raise exception 'ABORT: nothing to roll back — get_client_entitlements() does not exist';
  end if;
end $$;

drop function if exists public.get_client_entitlements(text);

do $$
begin
  if exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'get_client_entitlements') then
    raise exception 'ROLLBACK VERIFY FAILED: get_client_entitlements() still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
