-- ============================================================
-- Rollback for: 20260804140000_delete_map_rpc
-- Drops the delete_map RPC. Reverting this only removes the server-side
-- permission-checked delete path; it does NOT restore any deleted maps.
-- ============================================================

drop function if exists public.delete_map(text);

-- Verify removal
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_map'
  ) then
    raise exception 'ROLLBACK FAILED: public.delete_map still exists';
  end if;
  raise notice 'ROLLBACK PASSED: public.delete_map removed';
end $$;
