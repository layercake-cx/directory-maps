-- ============================================================
-- Rollback: 20260923140000_claims_lifecycle_rpcs
-- Reverses: drops all RPCs added by the forward migration, then
--           claim_users.name.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'create_manual_claim') then
    raise exception 'ABORT: nothing to roll back -- create_manual_claim() does not exist';
  end if;

  if exists (select 1 from public.claims where created_by = 'admin') then
    raise exception
      'ABORT: admin-created claims already exist. Rolling back removes the only '
      'RPCs that can manage them (activate/suspend/revoke). Back up public.claims, '
      'public.claim_users, and public.claim_payments before rolling back. '
      'To override, delete this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.get_my_claim_context();
drop function if exists public.link_claim_user_by_email();
drop function if exists public.admin_set_claim_payment_status(uuid, text, text, integer, text);
drop function if exists public.admin_revoke_claim(uuid, text);
drop function if exists public.admin_reactivate_claim(uuid);
drop function if exists public.admin_suspend_claim(uuid);
drop function if exists public.admin_activate_claim(uuid);
drop function if exists public.create_manual_claim(text, text, text, text, text);
drop function if exists public.is_generic_email_domain(text);
drop function if exists public.derive_domain_from_url(text);
drop function if exists public.can_manage_client(text);

alter table public.claim_users drop column if exists name;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_proc where proname = 'create_manual_claim') then
    raise exception 'ROLLBACK VERIFY FAILED: create_manual_claim() still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'can_manage_client') then
    raise exception 'ROLLBACK VERIFY FAILED: can_manage_client() still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'claim_users' and column_name = 'name'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: claim_users.name still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
