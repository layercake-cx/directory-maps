-- ============================================================
-- Migration: 20260804140000_delete_map_rpc
-- Description: Adds a SECURITY DEFINER function `delete_map(p_map_id)` that
--              deletes a map after an explicit permission check. Platform
--              admins may delete any map; client users may delete a map only
--              if they belong to the map's organisation AND are an
--              owner/manager/primary contact OR hold `can_manage_maps`.
--              All child rows (groups, listings, publications, engagement
--              events, data sources, filter fields, etc.) are removed by the
--              existing ON DELETE CASCADE foreign keys; `admin_events.map_id`
--              is SET NULL so the audit trail is preserved.
-- Affected objects: function public.delete_map(text) (new). No table/column changes.
-- Rollback: _20260804140000_delete_map_rpc.rollback.sql
-- Author: Cursor agent
-- Date: 2026-08-04
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste the CREATE FUNCTION + REVOKE/GRANT below>
--   ROLLBACK;
--
-- If no error appears, the dry run passed. Then apply for real.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

-- A) Confirm dependencies exist (maps, contacts tables + is_admin helper)
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maps') then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'contacts') then
    raise exception 'ABORT: table public.contacts does not exist';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_admin') then
    raise exception 'ABORT: function public.is_admin() does not exist';
  end if;
end $$;

-- B) Row counts — inspect before proceeding (this migration should NOT change them)
select
  'clients'  as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps            union all
  select 'groups',    count(*) from public.groups          union all
  select 'listings',  count(*) from public.listings
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create or replace function public.delete_map(p_map_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id       text;
  v_role            text;
  v_is_primary      boolean;
  v_can_manage_maps boolean;
begin
  -- The map must exist; grab its owning organisation.
  select client_id into v_client_id
  from public.maps
  where id = p_map_id;

  if v_client_id is null then
    raise exception 'Map not found';
  end if;

  -- Platform admins may delete any map.
  if public.is_admin() then
    delete from public.maps where id = p_map_id;
    return;
  end if;

  -- Otherwise the caller must be a contact in the map's organisation…
  select role, is_primary, can_manage_maps
    into v_role, v_is_primary, v_can_manage_maps
  from public.contacts
  where user_id = auth.uid()
    and client_id = v_client_id
  order by created_at asc
  limit 1;

  if not found then
    raise exception 'Access denied';
  end if;

  -- …with map-management permission.
  if not (
    v_role in ('owner', 'manager')
    or coalesce(v_is_primary, false)
    or coalesce(v_can_manage_maps, false)
  ) then
    raise exception 'You need the Manage maps permission to delete a map';
  end if;

  delete from public.maps where id = p_map_id;
end;
$$;

-- Lock the function down: only signed-in users may call it (anon cannot).
revoke all on function public.delete_map(text) from public;
grant execute on function public.delete_map(text) to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_map'
  ) then
    raise exception 'VERIFY FAILED: function public.delete_map was not created';
  end if;
  raise notice 'VERIFY PASSED: public.delete_map(text) created';
end $$;

-- Row counts — must be UNCHANGED from the pre-migration output (this migration
-- only adds a function; it deletes no data).
select
  'clients'  as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps            union all
  select 'groups',    count(*) from public.groups          union all
  select 'listings',  count(*) from public.listings
order by tbl;
