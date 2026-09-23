-- ============================================================
-- Rollback: 20260923160000_claimed_listing_editing_rpcs
-- Reverses: drops every RPC added by the forward migration.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'update_claimed_listing_contact') then
    raise exception 'ABORT: nothing to roll back -- update_claimed_listing_contact() does not exist';
  end if;

  if exists (select 1 from public.directory_entries where content_managed_by = 'claimed_org') then
    raise exception
      'ABORT: at least one directory_entries row is already claimed_org-managed. '
      'Rolling back removes the only RPCs that can maintain it going forward. '
      'To override, delete this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.remove_claim_team_member(uuid, uuid);
drop function if exists public.update_claim_team_member(uuid, uuid, text, text, text, text, boolean);
drop function if exists public.add_claim_team_member(uuid, text, text, text, text, boolean);
drop function if exists public.update_claimed_listing_body(uuid, text);
drop function if exists public.update_claimed_listing_seo(uuid, text, text);
drop function if exists public.update_claimed_listing_contact(uuid, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean);
drop function if exists public.require_active_claim_editor(uuid);


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_claimed_listing_contact') then
    raise exception 'ROLLBACK VERIFY FAILED: update_claimed_listing_contact() still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'require_active_claim_editor') then
    raise exception 'ROLLBACK VERIFY FAILED: require_active_claim_editor() still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
