-- ============================================================
-- Rollback: 20260927120000_claim_ownership_transfer_rpcs
-- Reverses: drops transfer_claim_ownership()/complete_pending_ownership_
--           transfer(), then claim_users.owner_transfer_pending.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'transfer_claim_ownership') then
    raise exception 'ABORT: nothing to roll back -- transfer_claim_ownership() does not exist';
  end if;

  if exists (select 1 from public.claim_users where owner_transfer_pending is true) then
    raise exception
      'ABORT: a pending ownership transfer already exists. Rolling back removes the only '
      'RPC that can complete it, leaving that invited person permanently unable to accept. '
      'Resolve or cancel it first. To override, delete this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.complete_pending_ownership_transfer(uuid);
drop function if exists public.transfer_claim_ownership(uuid, text, text);

alter table public.claim_users drop column if exists owner_transfer_pending;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_proc where proname = 'transfer_claim_ownership') then
    raise exception 'ROLLBACK VERIFY FAILED: transfer_claim_ownership() still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'claim_users' and column_name = 'owner_transfer_pending'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: claim_users.owner_transfer_pending still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
