-- ============================================================
-- Migration: 20260824130000_add_resolve_custom_domain_rpc
-- Description: Adds resolve_custom_domain(p_hostname), a public RPC for
--              the Vercel Edge Middleware's host-based routing (Bring Your
--              Own Domain, Phase 2). Middleware runs with no user session,
--              using the anon key.
--
--              Deliberately NOT solved by granting anon select on
--              public.clients (the pattern maps/groups/listings already
--              use) — clients has since picked up sensitive columns
--              (plan_key, email_domain_status, email_dns_records) that
--              those tables never had, so blanket anon exposure would leak
--              them. This RPC is security definer and returns only
--              client_slug, map_slug, and the domain's status — nothing
--              else, regardless of what columns clients/maps gain later.
--
--              Returns status even when not 'active' (pending/verifying/
--              failed) so middleware can show an honest "still verifying"
--              page instead of a generic 404, without needing broader
--              read access to get there.
-- Affected: new function (no table changes)
-- Rollback: _20260824130000_add_resolve_custom_domain_rpc.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-24
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
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_domains'
  ) then
    raise exception 'ABORT: table public.client_domains does not exist — apply 20260824120000_create_client_domains.sql first';
  end if;
  if exists (select 1 from pg_proc where proname = 'resolve_custom_domain') then
    raise exception 'ABORT: function resolve_custom_domain already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create or replace function public.resolve_custom_domain(p_hostname text)
returns table(client_slug text, map_slug text, status text)
language sql
security definer
stable
set search_path = public
as $$
  select c.slug, m.slug, cd.status
  from public.client_domains cd
  join public.clients c on c.id = cd.client_id
  join public.maps m on m.id = cd.map_id
  where lower(cd.hostname) = lower(p_hostname)
  limit 1;
$$;

comment on function public.resolve_custom_domain(text) is
  'Resolves a hostname to the client/map slugs it publishes, for Vercel Edge Middleware host-based routing. Returns status regardless of value (pending/verifying/active/failed) so the caller can distinguish "not registered" from "registered but not live yet". Security definer — exposes only slugs + status, never other clients/maps columns, so it is safe to grant to anon.';

revoke all on function public.resolve_custom_domain(text) from public;
grant execute on function public.resolve_custom_domain(text) to anon, authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'resolve_custom_domain') then
    raise exception 'VERIFY FAILED: resolve_custom_domain() was not created';
  end if;
  if exists (select 1 from public.resolve_custom_domain('__nonexistent_hostname__.invalid')) then
    raise exception 'VERIFY FAILED: resolver returned a row for a hostname that should not exist';
  end if;
  raise notice 'VERIFY PASSED: resolve_custom_domain() created and returns no rows for an unknown hostname';
end $$;
