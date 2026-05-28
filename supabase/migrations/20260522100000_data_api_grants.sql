-- Explicit Data API grants for public schema objects.
--
-- Supabase is removing automatic grants on new public tables (new projects May 30,
-- existing projects Oct 30, 2026). RLS remains the authorization layer; these grants
-- only allow PostgREST / supabase-js to reach the relation.
--
-- Add matching grants when you create new tables or expose new RPCs via the Data API.

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on table public.clients to anon, authenticated, service_role;
grant select, insert, update, delete on table public.maps to anon, authenticated, service_role;
grant select, insert, update, delete on table public.groups to anon, authenticated, service_role;
grant select, insert, update, delete on table public.listings to anon, authenticated, service_role;
grant select, insert, update, delete on table public.profiles to anon, authenticated, service_role;
grant select, insert, update, delete on table public.contacts to anon, authenticated, service_role;
grant select, insert, update, delete on table public.map_data_sources to anon, authenticated, service_role;
grant select, insert, update, delete on table public.invitations to anon, authenticated, service_role;
grant select, insert, update, delete on table public.contact_map_permissions to anon, authenticated, service_role;
grant select, insert, update, delete on table public.error_logs to anon, authenticated, service_role;
grant select, insert, update, delete on table public.map_publications to anon, authenticated, service_role;
grant select, insert, update, delete on table public.map_engagement_events to anon, authenticated, service_role;
grant select, insert, update, delete on table public.map_contact_submissions to anon, authenticated, service_role;

-- Embed reads listings via this view (RLS on public.listings still applies to the view).
grant select on table public.public_listings to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sequences (uuid / serial defaults)
-- ---------------------------------------------------------------------------

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPCs callable via supabase.rpc()
-- ---------------------------------------------------------------------------

grant execute on function public.is_client_slug_available(text) to anon, authenticated;
grant execute on function public.current_user_client_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.publish_map(text, jsonb, text) to authenticated;
grant execute on function public.rollback_map_to(text, uuid) to authenticated;
grant execute on function public.list_map_publications(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Default privileges for future migrations (tables + sequences only)
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
