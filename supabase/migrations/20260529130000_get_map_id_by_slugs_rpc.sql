-- RPC: resolve a published map's ID from its human-readable slugs.
--
-- Runs as SECURITY DEFINER so the anon role can join clients + maps
-- without needing a broad anon SELECT policy on the clients table.
-- Only returns the map id — no other client data is exposed.

create or replace function public.get_map_id_by_slugs(
  p_client_slug text,
  p_map_slug    text
)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select m.id
  from   public.maps    m
  join   public.clients c on c.id = m.client_id
  where  c.slug = p_client_slug
  and    m.slug = p_map_slug
  limit  1;
$$;

grant execute on function public.get_map_id_by_slugs(text, text) to anon, authenticated;
