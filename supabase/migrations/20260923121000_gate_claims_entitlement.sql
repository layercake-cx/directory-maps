-- ============================================================
-- Migration: 20260923121000_gate_claims_entitlement
-- Description: Makes Claimed Directory Listings a real commercial
--              entitlement (Professional plan [key: 'premium'] and above),
--              on top of the 'claims' beta feature flag just registered
--              (20260923120000_seed_claims_feature_flag.sql) — same
--              two-layer precedent as custom_domain/directory_pages: the
--              flag decides whether the feature *can be configured at all*
--              during rollout; this entitlement decides whether a licensed
--              client actually gets to turn claiming on for a directory.
--
--              Catalog: features.maps.claims (boolean) — product_key is
--              'maps' because that is the only row in public.products
--              today (same constraint custom_domain/ai_search sit under).
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
--              Resolver: resolve_claims_entitlement(p_client_id) — same
--              precedence/shape as resolve_custom_domain_entitlement() /
--              resolve_ai_search_entitlement(). Not gated by is_admin(),
--              since the self-service public claim flow (a later phase of
--              this epic) needs to check it from a service-role Edge
--              Function context with no authenticated user session (a
--              claimant is anonymous until they verify).
--
--              Client-authenticated contexts (the admin Claims settings
--              tab) use the existing generic get_my_entitlements() /
--              get_client_entitlements() RPCs — no bespoke code needed
--              there, same as every other catalog feature.
--
--              No enforcement trigger in this migration — there is nothing
--              to enforce yet (no claims table exists until the next phase
--              of this epic). Catalog + resolver only.
-- Affected tables: features, plan_features (rows added)
-- Rollback: _20260923121000_gate_claims_entitlement.rollback.sql
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'features') then
    raise exception 'ABORT: table public.features does not exist';
  end if;
  if exists (select 1 from public.features where product_key = 'maps' and key = 'claims') then
    raise exception 'ABORT: features.maps.claims already exists — migration may have already run';
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
  'maps', 'claims', 'Claimed Directory Listings',
  'Whether a client can enable claiming for a directory, letting represented organisations verify and manage their own directory entry.',
  'boolean', 'hard', 'hard_block_new', false, false
);

-- 2) Per-plan defaults
insert into public.plan_features (plan_key, feature_id, bool_value)
select 'standard', f.id, false from public.features f
  where f.product_key = 'maps' and f.key = 'claims';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'premium', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'claims';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'unlimited', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'claims';
-- No 'founder' row: plans.is_founder_tier already resolves Founder clients
-- to enabled without one.

-- 3) Resolver — same precedence as resolve_custom_domain_entitlement()/
-- resolve_ai_search_entitlement(). Callable from service-role contexts.
create or replace function public.resolve_claims_entitlement(p_client_id text)
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
  where f.product_key = 'maps' and f.key = 'claims';
$$;

comment on function public.resolve_claims_entitlement(text) is
  'Resolves the maps.claims boolean entitlement for an explicit client_id: kill_switch > client_overrides > Founder tier > plan_features > catalog default. Used by the self-service public claim flow (Edge Functions with no authenticated user session); the admin Claims settings tab uses get_my_entitlements()/get_client_entitlements() instead, same as every other catalog feature.';

revoke all on function public.resolve_claims_entitlement(text) from public, authenticated, anon;
grant execute on function public.resolve_claims_entitlement(text) to service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'claims') then
    raise exception 'VERIFY FAILED: features.maps.claims was not created';
  end if;
  if (
    select count(*) from public.plan_features pf
    join public.features f on f.id = pf.feature_id
    where f.product_key = 'maps' and f.key = 'claims'
  ) <> 3 then
    raise exception 'VERIFY FAILED: expected 3 plan_features rows (standard/premium/unlimited) for claims';
  end if;
  if not exists (select 1 from pg_proc where proname = 'resolve_claims_entitlement') then
    raise exception 'VERIFY FAILED: resolve_claims_entitlement() was not created';
  end if;
  if public.resolve_claims_entitlement('__nonexistent_client__') is distinct from false then
    raise exception 'VERIFY FAILED: resolver did not fail safe (false) for an unknown client_id';
  end if;
  raise notice 'VERIFY PASSED: claims entitlement + resolver created';
end $$;

select 'clients' as tbl, count(*) as rows from public.clients;

select count(*) as orphaned_plan_features
  from public.plan_features pf
  join public.features f on f.id = pf.feature_id
  where f.product_key = 'maps' and f.key = 'claims'
    and not exists (select 1 from public.plans p where p.key = pf.plan_key);
