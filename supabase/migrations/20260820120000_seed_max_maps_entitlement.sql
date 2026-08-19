-- ============================================================
-- Migration: 20260820120000_seed_max_maps_entitlement
-- Description: First real entitlement in the Epic 1 catalog — a per-client
--              volume cap on the number of maps a client can create.
--
--              Seeds:
--                - features:       one 'maps.max_maps' row (entitlement_type
--                                  = 'volume', default_limit_value = 3)
--                - plan_features:  standard -> 3, premium -> unlimited,
--                                  unlimited -> unlimited. No 'founder' row
--                                  needed — the resolver/trigger's Founder-
--                                  tier shortcut (plans.is_founder_tier)
--                                  already resolves Founder clients to
--                                  unlimited without one.
--
--              Enforcement: get_my_entitlements() is self-scoped (resolves
--              the *calling* user's own client), which is fine for the
--              client-portal "new map" page but not for the admin "new map"
--              page (creates a map for an arbitrary client from route
--              params). Per Epic 1's "enforcement must be server-side, not
--              just UI-hidden" rule, this migration adds a BEFORE INSERT
--              trigger on public.maps (enforce_max_maps_limit()) that
--              re-resolves the same precedence server-side for NEW.client_id
--              and blocks the insert if the client is already at their
--              limit — regardless of which UI (or API caller) is inserting.
--
--              Precedence (same as get_my_entitlements(), scoped to this one
--              feature): kill_switch_enabled (forces limit=0) > client
--              override > Founder tier (unlimited) > plan default >
--              features.default_limit_value. A null limit at any level means
--              "unlimited" (or "not configured yet") and fails OPEN — this is
--              a commercial cap, not a security boundary, so a catalog gap
--              should not accidentally block map creation platform-wide.
-- Affected tables: features, plan_features (rows added); maps (new trigger)
-- Rollback: _20260820120000_seed_max_maps_entitlement.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-20
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- After the dry run, a good manual smoke test (still inside the same
-- transaction, before the ROLLBACK) is to pick a real standard-plan
-- client_id with 3+ existing maps and confirm:
--   insert into public.maps (id, client_id, name, slug)
--   values ('dry-run-test-map', '<a standard-plan client_id with 3+ maps>', 'Dry run test', 'dry-run-test');
-- raises "Map limit reached for this customer ...". Then ROLLBACK.
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- Run these BEFORE applying. Stop if any assertion fails.
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'features'
  ) then
    raise exception 'ABORT: table public.features does not exist — apply 20260819120000_create_entitlements.sql first';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'maps'
  ) then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if not exists (
    select 1 from public.plans where key in ('standard', 'premium', 'unlimited')
  ) then
    raise exception 'ABORT: expected plans (standard/premium/unlimited) do not exist';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'clients' as tbl, count(*) as rows from public.clients union all
  select 'maps',    count(*) from public.maps
order by tbl;
-- Save this output. You will compare it to the post-migration counts.

-- Idempotency guard — the catalog row and trigger must NOT already exist
do $$
begin
  if exists (
    select 1 from public.features where product_key = 'maps' and key = 'max_maps'
  ) then
    raise exception 'ABORT: features.maps.max_maps already exists — migration may have already run';
  end if;
  if exists (
    select 1 from pg_trigger where tgname = 'trg_enforce_max_maps_limit'
  ) then
    raise exception 'ABORT: trg_enforce_max_maps_limit already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Catalog entry
insert into public.features (
  product_key, key, name, description, entitlement_type, enforcement,
  on_downgrade_policy, kill_switch_enabled, default_limit_value
) values (
  'maps', 'max_maps', 'Maps',
  'Number of maps a client can create.',
  'volume', 'hard', 'hard_block_new', false, 3
);

-- 2) Per-plan defaults
insert into public.plan_features (plan_key, feature_id, limit_value)
select 'standard', f.id, 3 from public.features f
  where f.product_key = 'maps' and f.key = 'max_maps';

insert into public.plan_features (plan_key, feature_id, limit_value)
select 'premium', f.id, null from public.features f
  where f.product_key = 'maps' and f.key = 'max_maps';

insert into public.plan_features (plan_key, feature_id, limit_value)
select 'unlimited', f.id, null from public.features f
  where f.product_key = 'maps' and f.key = 'max_maps';
-- No 'founder' row: plans.is_founder_tier already makes the trigger below
-- (and get_my_entitlements()) resolve Founder clients to unlimited.

-- 3) Server-side enforcement trigger
create or replace function public.enforce_max_maps_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_current_count integer;
begin
  select
    case
      when f.kill_switch_enabled then 0
      when ov.feature_id is not null then ov.limit_value
      when p.is_founder_tier then null
      when pf.feature_id is not null then pf.limit_value
      else f.default_limit_value
    end
  into v_limit
  from public.features f
  join public.clients c on c.id = new.client_id
  left join public.plans p on p.key = coalesce(c.plan_key, 'standard')
  left join public.client_overrides ov on ov.feature_id = f.id and ov.client_id = new.client_id
  left join public.plan_features pf on pf.feature_id = f.id and pf.plan_key = coalesce(c.plan_key, 'standard')
  where f.product_key = 'maps' and f.key = 'max_maps';

  -- null = unlimited at whichever level resolved, OR the catalog row isn't
  -- there yet — fail open either way (commercial cap, not a security gate).
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_current_count from public.maps where client_id = new.client_id;

  if v_current_count >= v_limit then
    raise exception 'Map limit reached for this customer (% of % maps). Upgrade the plan or grant an override to add more maps.',
      v_current_count, v_limit;
  end if;

  return new;
end;
$$;

comment on function public.enforce_max_maps_limit() is
  'BEFORE INSERT gate on public.maps enforcing the maps.max_maps entitlement server-side, regardless of caller (client portal, admin console, API). Mirrors get_my_entitlements()''s precedence for this one feature: kill_switch > client_overrides > Founder tier > plan_features > features.default_limit_value.';

drop trigger if exists trg_enforce_max_maps_limit on public.maps;
create trigger trg_enforce_max_maps_limit
  before insert on public.maps
  for each row
  execute function public.enforce_max_maps_limit();


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.features where product_key = 'maps' and key = 'max_maps'
  ) then
    raise exception 'VERIFY FAILED: features.maps.max_maps was not created';
  end if;
  if (
    select count(*) from public.plan_features pf
    join public.features f on f.id = pf.feature_id
    where f.product_key = 'maps' and f.key = 'max_maps'
  ) <> 3 then
    raise exception 'VERIFY FAILED: expected 3 plan_features rows (standard/premium/unlimited) for max_maps';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_enforce_max_maps_limit'
  ) then
    raise exception 'VERIFY FAILED: trg_enforce_max_maps_limit was not created';
  end if;
  raise notice 'VERIFY PASSED: max_maps entitlement + enforcement trigger created';
end $$;

-- Row counts — clients/maps must be UNCHANGED from pre-migration.
select
  'clients' as tbl, count(*) as rows from public.clients union all
  select 'maps',    count(*) from public.maps
order by tbl;

-- Orphan check — must return 0
select count(*) as orphaned_plan_features
  from public.plan_features pf
  join public.features f on f.id = pf.feature_id
  where f.product_key = 'maps' and f.key = 'max_maps'
    and not exists (select 1 from public.plans p where p.key = pf.plan_key);
