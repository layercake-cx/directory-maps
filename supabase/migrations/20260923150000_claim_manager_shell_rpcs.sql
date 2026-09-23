-- ============================================================
-- Migration: 20260923150000_claim_manager_shell_rpcs
-- Description: Phase 4 of the Claimed Directory Listings epic — the
--              claim-user-facing "Listing Manager" shell (Listing / SEO /
--              Contact details / Team / Users tabs). Everything a claim
--              user can now reach is genuinely item-scoped, enforced here
--              (not just hidden in the UI), since claim users have no
--              profiles/contacts row for ordinary RLS to key off (same
--              reasoning as link_claim_user_by_email()/get_my_claim_context()
--              from Phase 3).
--
--              Read-only for now: Listing/SEO/Contact details/Team just
--              display current values via get_claimed_listing()/
--              get_claim_team_members() -- editing those is Phase 5, which
--              reuses these exact read RPCs rather than duplicating them.
--
--              Real, not a shell: the Users tab. An owner can invite an
--              editor (claim_invite_user) and remove one (claim_remove_user);
--              any linked user can list who's on the claim (get_claim_users).
--              Ownership transfer itself stays out of scope here -- that's
--              its own phase (Phase 8) with its own accept-before-complete
--              flow, not a role you can just set through this invite RPC
--              (claim_invite_user rejects any role other than 'editor').
--
--              Two shared permission-check helpers, mirroring
--              can_manage_client()'s role from Phase 3:
--                - can_access_claim(claim_id)  -- caller is ANY linked,
--                    non-removed claim_users row (owner or editor)
--                - is_claim_owner(claim_id)    -- caller is specifically
--                    the non-removed owner
-- Affected tables: none (RPCs only; reads/writes claims, claim_users,
--                  directory_entries, directory_entry_team_members)
-- Rollback: _20260923150000_claim_manager_shell_rpcs.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-23
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'get_my_claim_context') then
    raise exception 'ABORT: get_my_claim_context() does not exist — apply 20260923140000_claims_lifecycle_rpcs.sql first';
  end if;
  if exists (select 1 from pg_proc where proname = 'can_access_claim') then
    raise exception 'ABORT: can_access_claim() already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create or replace function public.can_access_claim(p_claim_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.claim_users
    where claim_id = p_claim_id and user_id = auth.uid() and removed_at is null
  );
$$;

comment on function public.can_access_claim(uuid) is
  'True when the calling user is a non-removed owner or editor on this claim. The item-scoped equivalent of can_manage_client() -- security definer bypasses RLS, so this check is the enforcement for every claim-user-facing RPC below.';

create or replace function public.is_claim_owner(p_claim_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.claim_users
    where claim_id = p_claim_id and user_id = auth.uid() and role = 'owner' and removed_at is null
  );
$$;

comment on function public.is_claim_owner(uuid) is
  'True when the calling user is specifically the non-removed owner of this claim (not just any editor). Owner-only actions (inviting/removing editors) check this.';

revoke all on function public.can_access_claim(uuid) from public, anon;
revoke all on function public.is_claim_owner(uuid) from public, anon;
grant execute on function public.can_access_claim(uuid) to authenticated;
grant execute on function public.is_claim_owner(uuid) to authenticated;

-- ---- Read-only listing preview (Phase 5 adds the matching write RPCs) ----
create or replace function public.get_claimed_listing(p_claim_id uuid)
returns table (
  directory_item_id text, name text, website_url text, email text, phone text,
  address text, postcode text, country text, city text,
  meta_title text, meta_description text, notes_html text,
  show_phone boolean, show_email boolean, show_website boolean, show_address boolean,
  content_managed_by text, content_last_edited_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select e.id, e.name, e.website_url, e.email, e.phone, e.address, e.postcode, e.country, e.city,
    e.meta_title, e.meta_description, e.notes_html,
    e.show_phone, e.show_email, e.show_website, e.show_address,
    e.content_managed_by, e.content_last_edited_at
  from public.claims c
  join public.directory_entries e on e.id = c.directory_item_id
  where c.id = p_claim_id and public.can_access_claim(p_claim_id);
$$;

comment on function public.get_claimed_listing(uuid) is
  'Read-only entry fields for a claim the caller is linked to (empty result, not an error, if not linked). Phase 4 is display-only; Phase 5 adds update_claimed_listing_contact/seo/body RPCs that write to these same columns.';

create or replace function public.get_claim_team_members(p_claim_id uuid)
returns table (id uuid, name text, role_title text, photo_url text, bio text, sort_order integer, is_visible boolean)
language sql
security definer
stable
set search_path = public
as $$
  select tm.id, tm.name, tm.role_title, tm.photo_url, tm.bio, tm.sort_order, tm.is_visible
  from public.claims c
  join public.directory_entry_team_members tm on tm.directory_item_id = c.directory_item_id
  where c.id = p_claim_id and public.can_access_claim(p_claim_id)
  order by tm.sort_order;
$$;

comment on function public.get_claim_team_members(uuid) is
  'Read-only team member list for a claim the caller is linked to. Phase 5 adds add/update/remove RPCs for the same table.';

revoke all on function public.get_claimed_listing(uuid) from public, anon;
revoke all on function public.get_claim_team_members(uuid) from public, anon;
grant execute on function public.get_claimed_listing(uuid) to authenticated;
grant execute on function public.get_claim_team_members(uuid) to authenticated;

-- ---- Users tab: real, not a shell ----
create or replace function public.get_claim_users(p_claim_id uuid)
returns table (id uuid, name text, email text, role text, invited_at timestamptz, accepted_at timestamptz, is_me boolean)
language sql
security definer
stable
set search_path = public
as $$
  select cu.id, cu.name, cu.email, cu.role, cu.invited_at, cu.accepted_at, cu.user_id = auth.uid()
  from public.claim_users cu
  where cu.claim_id = p_claim_id
    and cu.removed_at is null
    and public.can_access_claim(p_claim_id)
  order by case cu.role when 'owner' then 0 else 1 end, cu.invited_at;
$$;

create or replace function public.claim_invite_user(
  p_claim_id uuid,
  p_email text,
  p_name text default null,
  p_role text default 'editor'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id uuid;
  v_status text;
begin
  if not public.is_claim_owner(p_claim_id) then
    raise exception 'Access denied';
  end if;

  select status into v_status from public.claims where id = p_claim_id;
  if v_status = 'revoked' then
    raise exception 'Cannot invite a user to a revoked claim';
  end if;

  if p_role <> 'editor' then
    raise exception 'Only editor invitations are supported here -- ownership transfer is a separate flow';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or v_email not like '%@%' then
    raise exception 'A valid email is required';
  end if;
  if exists (select 1 from public.claim_users where claim_id = p_claim_id and email = v_email and removed_at is null) then
    raise exception 'This email is already a user on this claim';
  end if;

  insert into public.claim_users (claim_id, email, name, role, invited_at)
  values (p_claim_id, v_email, nullif(trim(p_name), ''), 'editor', now())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.claim_remove_user(p_claim_id uuid, p_claim_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if not public.is_claim_owner(p_claim_id) then
    raise exception 'Access denied';
  end if;

  select role into v_role from public.claim_users
  where id = p_claim_user_id and claim_id = p_claim_id and removed_at is null;

  if v_role is null then
    raise exception 'User not found on this claim';
  end if;
  if v_role = 'owner' then
    raise exception 'The owner cannot be removed -- transfer ownership first';
  end if;

  update public.claim_users set removed_at = now(), updated_at = now() where id = p_claim_user_id;
end;
$$;

comment on function public.claim_invite_user(uuid, text, text, text) is
  'Owner-only: invites an editor onto their own claim. The caller''s browser still has to actually send the magic-link email (supabase.auth.signInWithOtp) -- this RPC only creates the claim_users row.';

revoke all on function public.get_claim_users(uuid) from public, anon;
revoke all on function public.claim_invite_user(uuid, text, text, text) from public, anon;
revoke all on function public.claim_remove_user(uuid, uuid) from public, anon;
grant execute on function public.get_claim_users(uuid) to authenticated;
grant execute on function public.claim_invite_user(uuid, text, text, text) to authenticated;
grant execute on function public.claim_remove_user(uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'can_access_claim') then
    raise exception 'VERIFY FAILED: can_access_claim() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_claim_owner') then
    raise exception 'VERIFY FAILED: is_claim_owner() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'get_claimed_listing') then
    raise exception 'VERIFY FAILED: get_claimed_listing() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'get_claim_team_members') then
    raise exception 'VERIFY FAILED: get_claim_team_members() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'get_claim_users') then
    raise exception 'VERIFY FAILED: get_claim_users() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'claim_invite_user') then
    raise exception 'VERIFY FAILED: claim_invite_user() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'claim_remove_user') then
    raise exception 'VERIFY FAILED: claim_remove_user() was not created';
  end if;
  -- Fail-safe check: an unlinked random claim id must resolve to no access, not an error.
  if public.can_access_claim(gen_random_uuid()) is distinct from false then
    raise exception 'VERIFY FAILED: can_access_claim() did not fail safe (false) for an unknown claim';
  end if;
  raise notice 'VERIFY PASSED: claim manager shell RPCs created';
end $$;
