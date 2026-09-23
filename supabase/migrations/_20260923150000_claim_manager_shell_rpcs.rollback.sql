-- ============================================================
-- Rollback: 20260923150000_claim_manager_shell_rpcs
-- Reverses: drops every RPC added by the forward migration.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'can_access_claim') then
    raise exception 'ABORT: nothing to roll back -- can_access_claim() does not exist';
  end if;

  if exists (select 1 from public.claim_users where role = 'editor' and removed_at is null) then
    raise exception
      'ABORT: editor claim_users rows already exist (created via claim_invite_user). '
      'Rolling back removes the only RPCs that can manage them. '
      'To override, delete this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.claim_remove_user(uuid, uuid);
drop function if exists public.claim_invite_user(uuid, text, text, text);
drop function if exists public.get_claim_users(uuid);
drop function if exists public.get_claim_team_members(uuid);
drop function if exists public.get_claimed_listing(uuid);
drop function if exists public.is_claim_owner(uuid);
drop function if exists public.can_access_claim(uuid);


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_proc where proname = 'can_access_claim') then
    raise exception 'ROLLBACK VERIFY FAILED: can_access_claim() still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'claim_invite_user') then
    raise exception 'ROLLBACK VERIFY FAILED: claim_invite_user() still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
