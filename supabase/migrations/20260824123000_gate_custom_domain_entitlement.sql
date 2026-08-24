-- ============================================================
-- Migration: 20260824123000_gate_custom_domain_entitlement
-- Description: Makes Custom Domain (the "Bring Your Own Domain" epic —
--              client-configured custom domains/subdomains, with per-domain
--              Google Analytics) a real commercial entitlement
--              (Professional plan [key: 'premium'] and above), same
--              precedent as maps.directory_pages
--              (20260822220000_gate_directory_pages_entitlement.sql).
--
--              This entitlement gates the custom domain itself and the GA
--              config attached to it — it does NOT gate favicon config or
--              baseline SEO metadata quality (canonical URLs, OG/Twitter
--              tags, sitemap/robots). Those ship free on every tier as part
--              of what publishing a directory already means; they get no
--              entitlement row at all.
--
--              Catalog: features.maps.custom_domain (boolean) — product_key
--              is 'maps' because that is the only row in public.products
--              today (same constraint directory_pages sits under); this is
--              conceptually a directory-publishing capability, not a
--              general map feature, but there is no separate 'directory'
--              product to file it under yet.
--
--              Plan defaults: standard -> false, premium -> true,
--              unlimited -> true. Founder needs no row (pseudo-tier
--              shortcut already resolves to enabled).
--
--              Per-client override: no new code needed — client_overrides +
--              the existing generic EntitlementsPanel.jsx admin UI already
--              support granting/denying any catalog feature the moment its
--              row exists.
--
--              Resolver: resolve_custom_domain_entitlement(p_client_id) —
--              same precedence/shape as resolve_directory_pages_entitlement().
--              Not gated by is_admin(), since it will be called from
--              service-role contexts (the manage_client_domain Edge
--              Function, and later the Vercel Edge Middleware hostname
--              resolver) with no authenticated user session.
--
--              No enforcement trigger in this migration — enforcement
--              happens in the (later) manage_client_domain Edge Function
--              when a client tries to add a domain. Catalog + resolver only.
-- Affected tables: features, plan_features (rows added)
-- Rollback: _20260824123000_gate_custom_domain_entitlement.rollback.sql
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'features') then
    raise exception 'ABORT: table public.features does not exist';
  end if;
  if exists (select 1 from public.features where product_key = 'maps' and key = 'custom_domain') then
    raise exception 'ABORT: features.maps.custom_domain already exists — migration may have already run';
  end if;
end $$;

select 'clients' as tbl, count(*) as rows from public.clients;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Catalog entry
insert into public.features (
  product_key, key, name, description, entitlement_type, enforcement,
  on_downgrade_policy, kill_switch_enabled, default_bool_value
) values (
  'maps', 'custom_domain', 'Custom Domain',
  'Whether a client can configure and verify their own custom domain/subdomain to publish a directory to, including attaching a Google Analytics measurement ID to that domain.',
  'boolean', 'hard', 'hard_block_new', false, false
);

-- 2) Per-plan defaults
insert into public.plan_features (plan_key, feature_id, bool_value)
select 'standard', f.id, false from public.features f
  where f.product_key = 'maps' and f.key = 'custom_domain';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'premium', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'custom_domain';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'unlimited', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'custom_domain';
-- No 'founder' row: plans.is_founder_tier already resolves Founder clients
-- to enabled without one.

-- 3) Resolver — same precedence as resolve_directory_pages_entitlement(),
-- scoped to this feature. Callable from service-role contexts.
create or replace function public.resolve_custom_domain_entitlement(p_client_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    case
      when f.kill_switch_enabled then false
      when ov.feature_id is not null and ov.bool_value is not null then ov.bool_value
      when p.is_founder_tier then true
      when pf.feature_id is not null and pf.bool_value is not null then pf.bool_value
      else f.default_bool_value
    end,
    false
  )
  from public.features f
  left join public.clients c on c.id = p_client_id
  left join public.plans p on p.key = coalesce(c.plan_key, 'standard')
  left join public.client_overrides ov on ov.feature_id = f.id and ov.client_id = p_client_id
  left join public.plan_features pf on pf.feature_id = f.id and pf.plan_key = coalesce(c.plan_key, 'standard')
  where f.product_key = 'maps' and f.key = 'custom_domain';
$$;

comment on function public.resolve_custom_domain_entitlement(text) is
  'Resolves the maps.custom_domain boolean entitlement for an explicit client_id: kill_switch > client_overrides > Founder tier > plan_features > catalog default. Used by manage_client_domain and (later) the Vercel Edge Middleware hostname resolver, both of which run without an authenticated user session.';

revoke all on function public.resolve_custom_domain_entitlement(text) from public, authenticated, anon;
grant execute on function public.resolve_custom_domain_entitlement(text) to service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'custom_domain') then
    raise exception 'VERIFY FAILED: features.maps.custom_domain was not created';
  end if;
  if (
    select count(*) from public.plan_features pf
    join public.features f on f.id = pf.feature_id
    where f.product_key = 'maps' and f.key = 'custom_domain'
  ) <> 3 then
    raise exception 'VERIFY FAILED: expected 3 plan_features rows (standard/premium/unlimited) for custom_domain';
  end if;
  if not exists (select 1 from pg_proc where proname = 'resolve_custom_domain_entitlement') then
    raise exception 'VERIFY FAILED: resolve_custom_domain_entitlement() was not created';
  end if;
  if public.resolve_custom_domain_entitlement('__nonexistent_client__') is distinct from false then
    raise exception 'VERIFY FAILED: resolver did not fail safe (false) for an unknown client_id';
  end if;
  raise notice 'VERIFY PASSED: custom_domain entitlement + resolver created';
end $$;

select 'clients' as tbl, count(*) as rows from public.clients;

select count(*) as orphaned_plan_features
  from public.plan_features pf
  join public.features f on f.id = pf.feature_id
  where f.product_key = 'maps' and f.key = 'custom_domain'
    and not exists (select 1 from public.plans p where p.key = pf.plan_key);
