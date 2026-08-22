-- ============================================================
-- Migration: 20260822120000_gate_ai_search_entitlement
-- Description: Makes AI search a real commercial entitlement (Professional
--              plan [key: 'premium'] and above), on top of the existing
--              'ai_search' beta feature flag (which stays as-is for
--              controlled rollout — the flag decides whether the admin UI
--              *can be configured at all*; this entitlement decides whether
--              enrichment/search actually *run* for that client).
--
--              Catalog: features.maps.ai_search (boolean). Plan defaults:
--              standard -> false, premium -> true, unlimited -> true.
--              Founder needs no row (pseudo-tier shortcut already resolves
--              to enabled). No grandfathering — this is a brand-new
--              capability with no pre-existing free-standing toggle to
--              preserve (unlike messaging).
--
--              Per-client override: no new code needed — client_overrides
--              + the existing generic EntitlementsPanel.jsx admin UI
--              already support granting/denying any catalog feature
--              (including this one) per individual client, the moment the
--              catalog row exists.
--
--              Enforcement (server-side, not just UI-hidden, mirroring the
--              max_maps/messaging precedent):
--              1) New resolver function resolve_ai_search_entitlement(p_client_id)
--                 — same precedence as get_my_entitlements()/the messaging
--                 view, scoped to this one feature. Not gated by is_admin()
--                 (unlike get_client_entitlements()) since it's called from
--                 service-role contexts (Edge Functions, the enrichment
--                 trigger) that have no authenticated user session.
--              2) enqueue_listing_enrichment_job() (the AFTER INSERT trigger
--                 on listings) is redefined to also require the resolved
--                 entitlement before enqueueing a job — so a client without
--                 the entitlement never burns a token even if an admin left
--                 a prompt configured on one of their maps (e.g. after a
--                 downgrade).
--              3) The search_listings_by_intent Edge Function is updated in
--                 the same PR to check the same resolver before running a
--                 search — defense in depth, so the trigger isn't the only
--                 gate.
-- Affected tables: features, plan_features (rows added); listings (trigger
--                  function redefined, same trigger)
-- Rollback: _20260822120000_gate_ai_search_entitlement.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-22
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> deploy the updated search_listings_by_intent Edge Function on staging
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'features') then
    raise exception 'ABORT: table public.features does not exist';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_enqueue_listing_enrichment_job') then
    raise exception 'ABORT: trg_enqueue_listing_enrichment_job does not exist — apply 20260821120000_create_ai_search_enrichment.sql first';
  end if;
  if exists (select 1 from public.features where product_key = 'maps' and key = 'ai_search') then
    raise exception 'ABORT: features.maps.ai_search already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'clients'                  as tbl, count(*) as rows from public.clients                  union all
  select 'listing_enrichment_jobs', count(*) from public.listing_enrichment_jobs
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Catalog entry
insert into public.features (
  product_key, key, name, description, entitlement_type, enforcement,
  on_downgrade_policy, kill_switch_enabled, default_bool_value
) values (
  'maps', 'ai_search', 'AI Search',
  'Whether a client''s maps can use AI search enrichment + intent-based search.',
  'boolean', 'hard', 'hard_block_new', false, false
);

-- 2) Per-plan defaults
insert into public.plan_features (plan_key, feature_id, bool_value)
select 'standard', f.id, false from public.features f
  where f.product_key = 'maps' and f.key = 'ai_search';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'premium', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'ai_search';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'unlimited', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'ai_search';
-- No 'founder' row: plans.is_founder_tier already resolves Founder clients
-- to enabled without one.

-- 3) Resolver — same precedence as get_my_entitlements()/the messaging view,
-- scoped to this one feature. Callable from service-role contexts (no
-- is_admin()/auth.uid() dependency, unlike get_client_entitlements()).
create or replace function public.resolve_ai_search_entitlement(p_client_id text)
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
  where f.product_key = 'maps' and f.key = 'ai_search';
$$;

comment on function public.resolve_ai_search_entitlement(text) is
  'Resolves the maps.ai_search boolean entitlement for an explicit client_id: kill_switch > client_overrides > Founder tier > plan_features > catalog default. Used by the enrichment trigger and the search_listings_by_intent Edge Function (both run without an authenticated user session, so get_my_entitlements()/get_client_entitlements() do not apply here).';

revoke all on function public.resolve_ai_search_entitlement(text) from public, authenticated, anon;
grant execute on function public.resolve_ai_search_entitlement(text) to service_role;

-- 4) Enforcement: redefine the enrichment enqueue trigger to also require
-- the resolved entitlement, not just the map having a prompt configured.
create or replace function public.enqueue_listing_enrichment_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
begin
  select client_id into v_client_id from public.maps where id = new.map_id;

  if v_client_id is not null
     and exists (
       select 1 from public.maps
       where id = new.map_id and ai_search_enrichment_prompt is not null
     )
     and public.resolve_ai_search_entitlement(v_client_id)
  then
    insert into public.listing_enrichment_jobs (listing_id, map_id, status, trigger_source)
    values (new.id, new.map_id, 'pending', 'auto_insert');
  end if;
  return new;
end;
$$;

comment on function public.enqueue_listing_enrichment_job() is
  'AFTER INSERT hook on public.listings. Enqueues one pending listing_enrichment_jobs row, but only when the listing''s map has ai_search_enrichment_prompt set AND the map''s client has the maps.ai_search entitlement (Professional plan and above, or a per-client override) — so a non-entitled client never burns a token even if a prompt is still configured (e.g. after a downgrade). Runs once per listing, on INSERT only — never on UPDATE, so existing enrichment is never silently refreshed. security definer so it can enqueue regardless of which role (platform admin or client-portal manager) inserted the listing.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'ai_search') then
    raise exception 'VERIFY FAILED: features.maps.ai_search was not created';
  end if;
  if (
    select count(*) from public.plan_features pf
    join public.features f on f.id = pf.feature_id
    where f.product_key = 'maps' and f.key = 'ai_search'
  ) <> 3 then
    raise exception 'VERIFY FAILED: expected 3 plan_features rows (standard/premium/unlimited) for ai_search';
  end if;
  if not exists (select 1 from pg_proc where proname = 'resolve_ai_search_entitlement') then
    raise exception 'VERIFY FAILED: resolve_ai_search_entitlement() was not created';
  end if;
  -- Spot-check the resolver against a synthetic client_id that cannot exist —
  -- must resolve to false (catalog default), never error.
  if public.resolve_ai_search_entitlement('__nonexistent_client__') is distinct from false then
    raise exception 'VERIFY FAILED: resolver did not fail safe (false) for an unknown client_id';
  end if;
  raise notice 'VERIFY PASSED: ai_search entitlement + resolver + enrichment enforcement created';
end $$;

-- Row counts — unchanged
select
  'clients'                  as tbl, count(*) as rows from public.clients                  union all
  select 'listing_enrichment_jobs', count(*) from public.listing_enrichment_jobs
order by tbl;

-- Orphan check — must return 0
select count(*) as orphaned_plan_features
  from public.plan_features pf
  join public.features f on f.id = pf.feature_id
  where f.product_key = 'maps' and f.key = 'ai_search'
    and not exists (select 1 from public.plans p where p.key = pf.plan_key);
