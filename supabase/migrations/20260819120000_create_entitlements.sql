-- ============================================================
-- Migration: 20260819120000_create_entitlements
-- Description: Commercial/tier entitlements layer (Epic 1: "Entitlements &
--              Feature Flags 2.0"). Separate axis from the existing
--              release-gating feature_flags system (20260805120000) —
--              that stays untouched. This layer answers "is this client
--              commercially allowed to use X", not "is X built yet".
--
--              Six new tables:
--                - products        (one row per Layercake product; seeded
--                                   with 'maps' only — the entitlement
--                                   schema is cross-product from day one so
--                                   later products don't need a re-model)
--                - plans           (tiers: standard/premium/unlimited,
--                                   matching the existing Stripe plan-id
--                                   strings in PricingPlans.jsx, plus the
--                                   'founder' pseudo-tier)
--                - features        (the entitlement catalog: one row per
--                                   gated capability, its type, its
--                                   downgrade policy, and a global kill
--                                   switch)
--                - plan_features   (tier defaults — what each plan grants
--                                   for each feature)
--                - client_overrides (per-client grants/restrictions that
--                                   win over the plan default)
--                - usage_counters  (metered-feature usage; ships empty —
--                                   no increment wiring in this migration)
--
--              Plus clients.plan_key (defaults every existing client to
--              'standard'; Founder Members are flagged manually — there is
--              no existing signal to auto-detect them from).
--
--              Resolution precedence, centralised in the security-definer
--              RPC public.get_my_entitlements():
--                1. features.kill_switch_enabled = true  -> force off
--                   (emergency/cost-control override — HIGHER precedence
--                   than an override or Founder, unlike get_my_feature_flags()'s
--                   default_enabled, because entitlements can gate billable/
--                   metered capability that may need an immediate, blanket
--                   shutoff)
--                2. client_overrides row for (client, feature)  -> its value
--                3. plans.is_founder_tier (client's plan)       -> max value,
--                   without needing a plan_features row per feature — this
--                   is what makes Founder a pseudo-tier rather than an
--                   override layered on another tier
--                4. plan_features row for the client's plan     -> tier default
--                5. features.default_*                          -> fallback
--
--              Deliberately no admin/internal auto-bypass (unlike
--              get_my_feature_flags()) — entitlements should reflect what a
--              client actually has, including when an admin is viewing it.
--
--              Out of scope for this pass (see plan doc): real Stripe
--              reconciliation, overage billing math, usage-counter
--              increment wiring, on_downgrade_policy enforcement, client
--              self-serve UI, a kill-switch admin UI (DB-only for now).
-- Affected tables: products, plans, features, plan_features,
--                  client_overrides, usage_counters (all new); clients
--                  (new plan_key column)
-- Rollback: _20260819120000_create_entitlements.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-19
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- Because get_my_entitlements() is the most complex object in this
-- migration, seed one client_overrides row per entitlement_type (boolean,
-- volume, metered, time_boxed) inside the dry-run transaction and call the
-- RPC before rolling back, to sanity-check the precedence logic.
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- Run these BEFORE applying. Stop if any assertion fails.
-- ------------------------------------------------------------

-- A) Confirm the objects we reference exist
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clients'
  ) then
    raise exception 'ABORT: table public.clients does not exist';
  end if;
  if not exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'is_admin'
  ) then
    raise exception 'ABORT: function public.is_admin() does not exist';
  end if;
  if not exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'current_user_client_id'
  ) then
    raise exception 'ABORT: function public.current_user_client_id() does not exist';
  end if;
end $$;

-- B) Row counts — inspect before proceeding
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'contacts',  count(*) from public.contacts
order by tbl;
-- Save this output. You will compare it to the post-migration counts.

-- C) Idempotency guard — the new tables/column must NOT already exist
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('products', 'plans', 'features', 'plan_features', 'client_overrides', 'usage_counters')
  ) then
    raise exception 'ABORT: an entitlements table already exists — migration may have already run';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'plan_key'
  ) then
    raise exception 'ABORT: public.clients.plan_key already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Enums
create type public.entitlement_type as enum ('boolean', 'volume', 'metered', 'time_boxed');
create type public.entitlement_enforcement as enum ('hard', 'soft');
create type public.entitlement_downgrade_policy as enum (
  'hard_block_new', 'archive_excess', 'read_only_excess', 'grandfather'
);

-- 2) Products — one row per Layercake product.
create table public.products (
  key         text primary key,
  name        text not null,
  description text null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.products is
  'Layercake products entitlements can be scoped to. Seeded with "maps" only today; the schema is cross-product so later products slot in without a re-model.';

insert into public.products (key, name, description)
values ('maps', 'Layercake Maps', 'Directory and map publishing product');

-- 3) Plans — commercial tiers, including the Founder pseudo-tier.
create table public.plans (
  key             text primary key,
  name            text not null,
  is_founder_tier boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.plans is
  'Commercial tiers. is_founder_tier=true (currently only "founder") makes get_my_entitlements() resolve every feature to its maximally-permissive value for that client without needing a plan_features row per feature — Founder is a pseudo-tier, not an override layered on another plan.';

insert into public.plans (key, name, is_founder_tier, sort_order) values
  ('standard',  'Standard',  false, 10),
  ('premium',   'Premium',   false, 20),
  ('unlimited', 'Unlimited', false, 30),
  ('founder',   'Founder Members', true, 0);

-- 4) Features — the entitlement catalog.
create table public.features (
  id                          uuid primary key default gen_random_uuid(),
  product_key                 text not null references public.products(key) on delete cascade,
  key                          text not null,
  name                         text not null,
  description                  text null,
  entitlement_type             public.entitlement_type not null,
  enforcement                  public.entitlement_enforcement not null default 'hard',
  on_downgrade_policy          public.entitlement_downgrade_policy not null default 'hard_block_new',
  kill_switch_enabled          boolean not null default false,
  default_bool_value           boolean null,
  default_limit_value          integer null,
  default_included_allowance   integer null,
  default_period               text null,
  default_params               jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_key, key)
);
create index idx_features_product on public.features(product_key);

comment on table public.features is
  'Entitlement catalog: one row per gated commercial capability. kill_switch_enabled is a platform-wide emergency force-off, checked before any override/plan/Founder resolution in get_my_entitlements() — DB-only in v1, no admin UI.';

-- 5) Plan features — tier defaults.
create table public.plan_features (
  id                        uuid primary key default gen_random_uuid(),
  plan_key                   text not null references public.plans(key) on delete cascade,
  feature_id                 uuid not null references public.features(id) on delete cascade,
  bool_value                 boolean null,
  limit_value                integer null,
  included_allowance         integer null,
  overage_unit_price_cents   integer null,
  period                     text null,
  starts_at                  timestamptz null,
  expires_at                 timestamptz null,
  params                     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_key, feature_id)
);
create index idx_plan_features_plan on public.plan_features(plan_key);
create index idx_plan_features_feature on public.plan_features(feature_id);

comment on table public.plan_features is
  'Per-plan defaults for each feature. Only the column(s) relevant to that feature''s entitlement_type are populated; the rest stay null and are ignored by the resolver. limit_value/included_allowance = null means unlimited for that plan.';

-- 6) Client overrides — per-client grants/restrictions.
create table public.client_overrides (
  id                        uuid primary key default gen_random_uuid(),
  client_id                  text not null references public.clients(id) on delete cascade,
  feature_id                 uuid not null references public.features(id) on delete cascade,
  bool_value                 boolean null,
  limit_value                integer null,
  included_allowance         integer null,
  overage_unit_price_cents   integer null,
  period                     text null,
  starts_at                  timestamptz null,
  expires_at                 timestamptz null,
  reason                     text null,
  created_by                 uuid null references auth.users(id) on delete set null,
  params                     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, feature_id)
);
create index idx_client_overrides_client on public.client_overrides(client_id);
create index idx_client_overrides_feature on public.client_overrides(feature_id);

comment on table public.client_overrides is
  'Per-client entitlement overrides — one row grants/restricts one feature for one client, winning over the plan default (and over Founder). expires_at supports time-boxed/trial grants.';

-- 7) Usage counters — metered-feature usage. Ships empty; no increment
--    wiring in this migration (see the header comment for scope notes).
create table public.usage_counters (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null references public.clients(id) on delete cascade,
  feature_id    uuid not null references public.features(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  used_amount   integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (client_id, feature_id, period_start)
);
create index idx_usage_counters_client_feature on public.usage_counters(client_id, feature_id, period_start desc);

comment on table public.usage_counters is
  'Metered-feature usage per client per period. Empty on creation — nothing in the app currently emits a "feature used" event; wiring an increment RPC/trigger is a follow-up epic.';

-- 8) clients.plan_key — every existing client defaults to 'standard'.
alter table public.clients
  add column if not exists plan_key text not null default 'standard' references public.plans(key);

-- MANUAL STEP — fill in the confirmed Founder Members client IDs before
-- running this on production (do not guess/auto-detect from name or slug):
-- update public.clients set plan_key = 'founder' where id in ('<client_id_1>', '<client_id_2>');


-- ------------------------------------------------------------
-- RLS: only platform admins touch the entitlement tables directly.
-- Regular users never read these tables from the client — they call the
-- security-definer RPC get_my_entitlements() instead.
-- ------------------------------------------------------------

alter table public.products enable row level security;
alter table public.plans enable row level security;
alter table public.features enable row level security;
alter table public.plan_features enable row level security;
alter table public.client_overrides enable row level security;
alter table public.usage_counters enable row level security;

create policy "products_admin_all"
  on public.products for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "plans_admin_all"
  on public.plans for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "features_admin_all"
  on public.features for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "plan_features_admin_all"
  on public.plan_features for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "client_overrides_admin_all"
  on public.client_overrides for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "usage_counters_admin_all"
  on public.usage_counters for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Data API grants (RLS still governs; these just let PostgREST reach the tables)
grant select, insert, update, delete on table public.products to authenticated, service_role;
grant select, insert, update, delete on table public.plans to authenticated, service_role;
grant select, insert, update, delete on table public.features to authenticated, service_role;
grant select, insert, update, delete on table public.plan_features to authenticated, service_role;
grant select, insert, update, delete on table public.client_overrides to authenticated, service_role;
grant select, insert, update, delete on table public.usage_counters to authenticated, service_role;

-- 9) Resolver RPC — returns { "<feature_key>": {...resolved...}, ... } for
--    the current user's client.
create or replace function public.get_my_entitlements()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with client_plan as (
    select
      c.id as client_id,
      coalesce(c.plan_key, 'standard') as plan_key,
      coalesce(p.is_founder_tier, false) as is_founder_tier
    from public.clients c
    left join public.plans p on p.key = coalesce(c.plan_key, 'standard')
    where c.id = public.current_user_client_id()
  )
  select coalesce(
    jsonb_object_agg(
      f.key,
      jsonb_build_object(
        'product', f.product_key,
        'type', f.entitlement_type,
        'enforcement', f.enforcement,
        'on_downgrade_policy', f.on_downgrade_policy,
        'source',
          case
            when f.kill_switch_enabled then 'kill_switch'
            when ov.feature_id is not null then 'override'
            when cp.is_founder_tier then 'founder'
            when pf.feature_id is not null then 'plan'
            else 'default'
          end,
        'enabled',
          case
            when f.kill_switch_enabled then false
            when ov.feature_id is not null and ov.bool_value is not null then ov.bool_value
            when cp.is_founder_tier then true
            when pf.feature_id is not null and pf.bool_value is not null then pf.bool_value
            else coalesce(f.default_bool_value, false)
          end,
        'limit',
          case
            when f.kill_switch_enabled then 0
            when ov.feature_id is not null and ov.limit_value is not null then ov.limit_value
            when cp.is_founder_tier then null
            when pf.feature_id is not null then pf.limit_value
            else f.default_limit_value
          end,
        'included_allowance',
          case
            when f.kill_switch_enabled then 0
            when ov.feature_id is not null and ov.included_allowance is not null then ov.included_allowance
            when cp.is_founder_tier then null
            when pf.feature_id is not null then pf.included_allowance
            else f.default_included_allowance
          end,
        'period',
          coalesce(
            ov.period,
            case when cp.is_founder_tier then null else pf.period end,
            f.default_period
          ),
        'starts_at', ov.starts_at,
        'expires_at',
          case
            when ov.feature_id is not null then ov.expires_at
            when cp.is_founder_tier then null
            else pf.expires_at
          end,
        'used_amount', coalesce(u.used_amount, 0)
      )
    ),
    '{}'::jsonb
  )
  from public.features f
  cross join client_plan cp
  left join public.client_overrides ov
    on ov.feature_id = f.id and ov.client_id = cp.client_id
  left join public.plan_features pf
    on pf.feature_id = f.id and pf.plan_key = cp.plan_key
  left join public.usage_counters u
    on u.client_id = cp.client_id and u.feature_id = f.id
   and u.period_start = date_trunc('month', now())::date;
$$;

comment on function public.get_my_entitlements() is
  'Resolves all entitlements for the calling user''s client. Precedence: kill_switch (force off, checked first) > client_overrides > Founder tier (plans.is_founder_tier, no per-feature row needed) > plan_features (tier default) > features.default_* (fallback). Security-definer so callers never read the catalog tables directly. Deliberately no admin/internal auto-bypass — unlike get_my_feature_flags(), an admin should see the client''s actual entitlements.';

grant execute on function public.get_my_entitlements() to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'products') then
    raise exception 'VERIFY FAILED: products was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'plans') then
    raise exception 'VERIFY FAILED: plans was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'features') then
    raise exception 'VERIFY FAILED: features was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'plan_features') then
    raise exception 'VERIFY FAILED: plan_features was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'client_overrides') then
    raise exception 'VERIFY FAILED: client_overrides was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'usage_counters') then
    raise exception 'VERIFY FAILED: usage_counters was not created';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'clients' and column_name = 'plan_key') then
    raise exception 'VERIFY FAILED: clients.plan_key was not created';
  end if;
  if not exists (select 1 from public.products where key = 'maps') then
    raise exception 'VERIFY FAILED: maps product was not seeded';
  end if;
  if (select count(*) from public.plans) <> 4 then
    raise exception 'VERIFY FAILED: expected 4 seeded plans';
  end if;
  if not exists (select 1 from information_schema.routines
      where routine_schema = 'public' and routine_name = 'get_my_entitlements') then
    raise exception 'VERIFY FAILED: get_my_entitlements() was not created';
  end if;
  raise notice 'VERIFY PASSED: entitlements layer created';
end $$;

-- Row counts — clients/maps/contacts must be UNCHANGED from pre-migration.
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'contacts',  count(*) from public.contacts
order by tbl;

-- New tables: products = 1, plans = 4, features/plan_features/client_overrides/usage_counters = 0
select
  'products'          as tbl, count(*) as rows from public.products          union all
  select 'plans',              count(*) from public.plans                    union all
  select 'features',           count(*) from public.features                 union all
  select 'plan_features',      count(*) from public.plan_features            union all
  select 'client_overrides',   count(*) from public.client_overrides         union all
  select 'usage_counters',     count(*) from public.usage_counters
order by tbl;

-- Every client must have a plan_key now
select count(*) as clients_missing_plan_key
  from public.clients where plan_key is null;
-- Must return 0

-- RLS enabled on the new tables (and core tables unaffected)
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('clients','contacts','profiles','products','plans','features','plan_features','client_overrides','usage_counters')
order by tablename;
-- All rows must show rowsecurity = true

-- Orphan checks (new) — must all return 0
select count(*) as orphaned_plan_features
  from public.plan_features pf
  where not exists (select 1 from public.plans p where p.key = pf.plan_key)
     or not exists (select 1 from public.features f where f.id = pf.feature_id);

select count(*) as orphaned_client_overrides
  from public.client_overrides o
  where not exists (select 1 from public.clients c where c.id = o.client_id)
     or not exists (select 1 from public.features f where f.id = o.feature_id);

select count(*) as orphaned_usage_counters
  from public.usage_counters u
  where not exists (select 1 from public.clients c where c.id = u.client_id)
     or not exists (select 1 from public.features f where f.id = u.feature_id);
