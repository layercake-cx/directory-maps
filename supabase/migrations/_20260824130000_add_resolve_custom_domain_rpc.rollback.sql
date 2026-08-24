-- ============================================================
-- Rollback: 20260824130000_add_resolve_custom_domain_rpc
-- Reverses: drops resolve_custom_domain(text).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'resolve_custom_domain') then
    raise exception 'ABORT: nothing to roll back — resolve_custom_domain does not exist';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.resolve_custom_domain(text);


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_proc where proname = 'resolve_custom_domain') then
    raise exception 'ROLLBACK VERIFY FAILED: resolve_custom_domain still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
