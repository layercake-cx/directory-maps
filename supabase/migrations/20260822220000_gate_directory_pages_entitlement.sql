-- ============================================================
-- Migration: 20260822220000_gate_directory_pages_entitlement
-- Description: Makes Directory Pages (Epic 3 — crawlable per-listing and
--              directory landing pages) a real commercial entitlement
--              (Professional plan [key: 'premium'] and above), separate
--              from the 'ai_search' entitlement — this is its own
--              capability, not bundled under AI search, even though the
--              richest version of its content reuses ai_search's
--              listing_research data where available.
--
--              Catalog: features.maps.directory_pages (boolean). Plan
--              defaults: standard -> false, premium -> true, unlimited ->
--              true. Founder needs no row (pseudo-tier shortcut already
--              resolves to enabled).
--
--              Per-client override: no new code needed — client_overrides
--              + the existing generic EntitlementsPanel.jsx admin UI
--              already support granting/denying any catalog feature the
--              moment its row exists.
--
--              Resolver: resolve_directory_pages_entitlement(p_client_id)
--              — same precedence/shape as resolve_ai_search_entitlement(),
--              scoped to this feature. Not gated by is_admin() (unlike
--              get_client_entitlements()), since it will be called from
--              service-role contexts (the future static-page-generation
--              Edge Function / Vercel Edge Function) with no authenticated
--              user session.
--
--              No enforcement trigger yet in this migration — there is no
--              "insert" style event to gate here (unlike ai_search's
--              enrichment trigger). Enforcement happens where the static
--              pages actually get generated/served, added in a later PR
--              once that pipeline exists; this migration is catalog +
--              resolver only.
-- Affected tables: features, plan_features (rows added)
-- Rollback: _20260822220000_gate_directory_pages_entitlement.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-22
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
  if exists (select 1 from public.features where product_key = 'maps' and key = 'directory_pages') then
    raise exception 'ABORT: features.maps.directory_pages already exists — migration may have already run';
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
  'maps', 'directory_pages', 'Directory Pages',
  'Whether a client''s maps get crawlable per-listing + directory landing pages for search/LLM discoverability.',
  'boolean', 'hard', 'hard_block_new', false, false
);

-- 2) Per-plan defaults
insert into public.plan_features (plan_key, feature_id, bool_value)
select 'standard', f.id, false from public.features f
  where f.product_key = 'maps' and f.key = 'directory_pages';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'premium', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'directory_pages';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'unlimited', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'directory_pages';
-- No 'founder' row: plans.is_founder_tier already resolves Founder clients
-- to enabled without one.

-- 3) Resolver — same precedence as resolve_ai_search_entitlement(), scoped
-- to this feature. Callable from service-role contexts.
create or replace function public.resolve_directory_pages_entitlement(p_client_id text)
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
  where f.product_key = 'maps' and f.key = 'directory_pages';
$$;

comment on function public.resolve_directory_pages_entitlement(text) is
  'Resolves the maps.directory_pages boolean entitlement for an explicit client_id: kill_switch > client_overrides > Founder tier > plan_features > catalog default. Used by the (future) static directory/listing page generation pipeline, which runs without an authenticated user session.';

revoke all on function public.resolve_directory_pages_entitlement(text) from public, authenticated, anon;
grant execute on function public.resolve_directory_pages_entitlement(text) to service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'directory_pages') then
    raise exception 'VERIFY FAILED: features.maps.directory_pages was not created';
  end if;
  if (
    select count(*) from public.plan_features pf
    join public.features f on f.id = pf.feature_id
    where f.product_key = 'maps' and f.key = 'directory_pages'
  ) <> 3 then
    raise exception 'VERIFY FAILED: expected 3 plan_features rows (standard/premium/unlimited) for directory_pages';
  end if;
  if not exists (select 1 from pg_proc where proname = 'resolve_directory_pages_entitlement') then
    raise exception 'VERIFY FAILED: resolve_directory_pages_entitlement() was not created';
  end if;
  if public.resolve_directory_pages_entitlement('__nonexistent_client__') is distinct from false then
    raise exception 'VERIFY FAILED: resolver did not fail safe (false) for an unknown client_id';
  end if;
  raise notice 'VERIFY PASSED: directory_pages entitlement + resolver created';
end $$;

select 'clients' as tbl, count(*) as rows from public.clients;

select count(*) as orphaned_plan_features
  from public.plan_features pf
  join public.features f on f.id = pf.feature_id
  where f.product_key = 'maps' and f.key = 'directory_pages'
    and not exists (select 1 from public.plans p where p.key = pf.plan_key);
