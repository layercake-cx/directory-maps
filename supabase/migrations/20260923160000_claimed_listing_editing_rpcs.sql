-- ============================================================
-- Migration: 20260923160000_claimed_listing_editing_rpcs
-- Description: Phase 5 of the Claimed Directory Listings epic — a claim
--              user can now actually edit their listing, not just view it.
--              Three write RPCs mirror the three read-only Phase 4 tabs:
--                - update_claimed_listing_contact()
--                - update_claimed_listing_seo()
--                - update_claimed_listing_body()  -- caller must sanitise
--                    HTML client-side first (sanitizeNotesHtml, same as
--                    every other notes_html writer in this codebase — there
--                    is no server-side HTML sanitiser in this project to
--                    call from SQL); this RPC does not re-sanitise.
--              Plus claim-scoped team-member CRUD (any linked user, not
--              owner-only, unlike the Users tab):
--                - add_claim_team_member()
--                - update_claim_team_member()
--                - remove_claim_team_member()
--
--              All six require can_access_claim(p_claim_id) (Phase 4) AND
--              the claim's status = 'active' — a claim that's merely
--              verified/payment_pending can be viewed (Phase 4) but not
--              edited yet. Every content write also stamps provenance
--              (directory_entries.content_managed_by = 'claimed_org',
--              content_last_edited_by_claim_user_id, content_last_edited_at)
--              so a future AI enrichment job can tell claimant-managed
--              content apart from platform-researched content, per the
--              epic's non-negotiable rule. Team-member writes do not touch
--              this provenance -- it exists on directory_entries for the
--              entry's own fields, not the child team-members table.
-- Affected tables: none (RPCs only; reads/writes directory_entries,
--                  directory_entry_team_members)
-- Rollback: _20260923160000_claimed_listing_editing_rpcs.rollback.sql
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
  if not exists (select 1 from pg_proc where proname = 'can_access_claim') then
    raise exception 'ABORT: can_access_claim() does not exist — apply 20260923150000_claim_manager_shell_rpcs.sql first';
  end if;
  if exists (select 1 from pg_proc where proname = 'update_claimed_listing_contact') then
    raise exception 'ABORT: update_claimed_listing_contact() already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- Shared: resolve caller's claim_users.id + validate access/status in one
-- place, since all three content-edit RPCs need identical checks plus the
-- provenance stamp.
create or replace function public.require_active_claim_editor(p_claim_id uuid)
returns table (directory_item_id text, claim_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_directory_item_id text;
  v_status text;
  v_claim_user_id uuid;
begin
  if not public.can_access_claim(p_claim_id) then
    raise exception 'Access denied';
  end if;

  select c.directory_item_id, c.status into v_directory_item_id, v_status
  from public.claims c where c.id = p_claim_id;

  if v_status <> 'active' then
    raise exception 'Only an active claim can be edited (current status: %)', v_status;
  end if;

  select cu.id into v_claim_user_id
  from public.claim_users cu
  where cu.claim_id = p_claim_id and cu.user_id = auth.uid() and cu.removed_at is null;

  return query select v_directory_item_id, v_claim_user_id;
end;
$$;

comment on function public.require_active_claim_editor(uuid) is
  'Shared precondition for every claimed-listing write RPC: caller must be linked to an ACTIVE claim. Returns the target directory_item_id and the caller''s own claim_users.id (for provenance stamping) or raises.';

revoke all on function public.require_active_claim_editor(uuid) from public, anon;
grant execute on function public.require_active_claim_editor(uuid) to authenticated;

-- ---- Contact fields ----
create or replace function public.update_claimed_listing_contact(
  p_claim_id uuid,
  p_website_url text default null,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_postcode text default null,
  p_country text default null,
  p_city text default null,
  p_show_phone boolean default true,
  p_show_email boolean default true,
  p_show_website boolean default true,
  p_show_address boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item text;
  v_claim_user_id uuid;
begin
  select r.directory_item_id, r.claim_user_id into v_item, v_claim_user_id
  from public.require_active_claim_editor(p_claim_id) r;

  update public.directory_entries set
    website_url = nullif(trim(coalesce(p_website_url, '')), ''),
    email = nullif(trim(coalesce(p_email, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    address = nullif(trim(coalesce(p_address, '')), ''),
    postcode = nullif(trim(coalesce(p_postcode, '')), ''),
    country = nullif(trim(coalesce(p_country, '')), ''),
    city = nullif(trim(coalesce(p_city, '')), ''),
    show_phone = p_show_phone,
    show_email = p_show_email,
    show_website = p_show_website,
    show_address = p_show_address,
    content_managed_by = 'claimed_org',
    content_last_edited_by_claim_user_id = v_claim_user_id,
    content_last_edited_at = now(),
    updated_at = now()
  where id = v_item;
end;
$$;

-- ---- SEO fields ----
create or replace function public.update_claimed_listing_seo(
  p_claim_id uuid,
  p_meta_title text default null,
  p_meta_description text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item text;
  v_claim_user_id uuid;
begin
  select r.directory_item_id, r.claim_user_id into v_item, v_claim_user_id
  from public.require_active_claim_editor(p_claim_id) r;

  update public.directory_entries set
    meta_title = nullif(trim(coalesce(p_meta_title, '')), ''),
    meta_description = nullif(trim(coalesce(p_meta_description, '')), ''),
    content_managed_by = 'claimed_org',
    content_last_edited_by_claim_user_id = v_claim_user_id,
    content_last_edited_at = now(),
    updated_at = now()
  where id = v_item;
end;
$$;

-- ---- Body content (already-sanitised HTML — see migration header) ----
create or replace function public.update_claimed_listing_body(
  p_claim_id uuid,
  p_notes_html text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item text;
  v_claim_user_id uuid;
begin
  select r.directory_item_id, r.claim_user_id into v_item, v_claim_user_id
  from public.require_active_claim_editor(p_claim_id) r;

  update public.directory_entries set
    notes_html = nullif(trim(coalesce(p_notes_html, '')), ''),
    content_managed_by = 'claimed_org',
    content_last_edited_by_claim_user_id = v_claim_user_id,
    content_last_edited_at = now(),
    updated_at = now()
  where id = v_item;
end;
$$;

comment on function public.update_claimed_listing_body(uuid, text) is
  'Sets directory_entries.notes_html for the claim''s item. The caller (browser) must sanitise HTML first via sanitizeNotesHtml -- there is no server-side sanitiser to call from SQL in this project, so this RPC trusts what it is given the same way every other notes_html writer in this codebase already does.';

revoke all on function public.update_claimed_listing_contact(uuid, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.update_claimed_listing_seo(uuid, text, text) from public, anon;
revoke all on function public.update_claimed_listing_body(uuid, text) from public, anon;
grant execute on function public.update_claimed_listing_contact(uuid, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.update_claimed_listing_seo(uuid, text, text) to authenticated;
grant execute on function public.update_claimed_listing_body(uuid, text) to authenticated;

-- ---- Team members: any linked user (owner or editor), not owner-only ----
create or replace function public.add_claim_team_member(
  p_claim_id uuid,
  p_name text,
  p_role_title text default null,
  p_photo_url text default null,
  p_bio text default null,
  p_is_visible boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item text;
  v_id uuid;
  v_name text;
begin
  select r.directory_item_id into v_item from public.require_active_claim_editor(p_claim_id) r;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'Name is required';
  end if;

  insert into public.directory_entry_team_members (directory_item_id, name, role_title, photo_url, bio, is_visible)
  values (v_item, v_name, nullif(trim(coalesce(p_role_title, '')), ''), nullif(trim(coalesce(p_photo_url, '')), ''), nullif(trim(coalesce(p_bio, '')), ''), coalesce(p_is_visible, true))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_claim_team_member(
  p_claim_id uuid,
  p_team_member_id uuid,
  p_name text,
  p_role_title text default null,
  p_photo_url text default null,
  p_bio text default null,
  p_is_visible boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item text;
  v_name text;
begin
  select r.directory_item_id into v_item from public.require_active_claim_editor(p_claim_id) r;

  if not exists (select 1 from public.directory_entry_team_members where id = p_team_member_id and directory_item_id = v_item) then
    raise exception 'Team member not found on this listing';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'Name is required';
  end if;

  update public.directory_entry_team_members set
    name = v_name,
    role_title = nullif(trim(coalesce(p_role_title, '')), ''),
    photo_url = nullif(trim(coalesce(p_photo_url, '')), ''),
    bio = nullif(trim(coalesce(p_bio, '')), ''),
    is_visible = coalesce(p_is_visible, true),
    updated_at = now()
  where id = p_team_member_id;
end;
$$;

create or replace function public.remove_claim_team_member(p_claim_id uuid, p_team_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item text;
begin
  select r.directory_item_id into v_item from public.require_active_claim_editor(p_claim_id) r;

  if not exists (select 1 from public.directory_entry_team_members where id = p_team_member_id and directory_item_id = v_item) then
    raise exception 'Team member not found on this listing';
  end if;

  delete from public.directory_entry_team_members where id = p_team_member_id;
end;
$$;

revoke all on function public.add_claim_team_member(uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.update_claim_team_member(uuid, uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.remove_claim_team_member(uuid, uuid) from public, anon;
grant execute on function public.add_claim_team_member(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.update_claim_team_member(uuid, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.remove_claim_team_member(uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'require_active_claim_editor') then
    raise exception 'VERIFY FAILED: require_active_claim_editor() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'update_claimed_listing_contact') then
    raise exception 'VERIFY FAILED: update_claimed_listing_contact() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'update_claimed_listing_seo') then
    raise exception 'VERIFY FAILED: update_claimed_listing_seo() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'update_claimed_listing_body') then
    raise exception 'VERIFY FAILED: update_claimed_listing_body() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'add_claim_team_member') then
    raise exception 'VERIFY FAILED: add_claim_team_member() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'update_claim_team_member') then
    raise exception 'VERIFY FAILED: update_claim_team_member() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'remove_claim_team_member') then
    raise exception 'VERIFY FAILED: remove_claim_team_member() was not created';
  end if;
  raise notice 'VERIFY PASSED: claimed listing editing RPCs created';
end $$;
