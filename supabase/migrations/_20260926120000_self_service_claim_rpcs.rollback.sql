-- ============================================================
-- Rollback: 20260926120000_self_service_claim_rpcs
-- Reverses: drops start_self_service_claim() and activate_self_service_claim().
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'start_self_service_claim') then
    raise exception 'ABORT: nothing to roll back -- start_self_service_claim() does not exist';
  end if;

  if exists (select 1 from public.claims where created_by = 'self_service') then
    raise exception
      'ABORT: self-service claims already exist. Rolling back removes the only '
      'RPCs that can create/activate them. To override, delete this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.activate_self_service_claim(uuid);
drop function if exists public.start_self_service_claim(text, text);


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_proc where proname = 'start_self_service_claim') then
    raise exception 'ROLLBACK VERIFY FAILED: start_self_service_claim() still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'activate_self_service_claim') then
    raise exception 'ROLLBACK VERIFY FAILED: activate_self_service_claim() still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
