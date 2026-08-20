-- ============================================================
-- Migration: 20260820160000_seed_seats_and_data_rows_entitlements
-- Description: Two more real entries in the Epic 1 entitlements catalog,
--              both volume type, following the same pattern as
--              20260820120000_seed_max_maps_entitlement.sql:
--
--              - features.maps.seats — team members (public.contacts rows)
--                a client can have. Basic (standard) = 1, Professional
--                (premium) / Enterprise (unlimited) = unlimited. Enforced
--                by a BEFORE INSERT trigger on public.contacts (covers
--                admin-created users, invite acceptance, and signup
--                provisioning uniformly, regardless of code path, since
--                it's a DB-level gate).
--
--              - features.maps.data_rows — public.listings rows across ALL
--                of a client's maps combined. Basic = 300, Professional /
--                Enterprise = 1,500. Enforced by a BEFORE INSERT trigger on
--                public.listings, resolving client_id via listings.map_id
--                -> maps.client_id (listings have no client_id column of
--                their own). Covers manual entry, CSV import, and Google
--                Sheets sync uniformly — same DB-level-gate reasoning.
--
--              Founder needs no plan_features row for either (pseudo-tier
--              shortcut already resolves to unlimited).
--
--              No grandfathering needed here (unlike the messaging
--              migration): these are volume caps, and on_downgrade_policy
--              defaults to 'hard_block_new' — a client already over a new
--              cap keeps their existing rows, they just can't add more.
--              Nothing is deleted or retroactively blocked.
-- Affected tables: features, plan_features (rows added); contacts, listings
--                  (new triggers)
-- Rollback: _20260820160000_seed_seats_and_data_rows_entitlements.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-20
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'contacts') then
    raise exception 'ABORT: table public.contacts does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listings') then
    raise exception 'ABORT: table public.listings does not exist';
  end if;
  if exists (select 1 from public.features where product_key = 'maps' and key in ('seats', 'data_rows')) then
    raise exception 'ABORT: features.maps.seats or features.maps.data_rows already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'clients'  as tbl, count(*) as rows from public.clients  union all
  select 'contacts', count(*) from public.contacts         union all
  select 'listings', count(*) from public.listings
order by tbl;

-- Which clients are already over the new caps? (informational only — see
-- header: nothing is retroactively enforced, existing rows are untouched)
select c.id, c.name, c.plan_key, count(distinct ct.id) as seats_used
from public.clients c
left join public.contacts ct on ct.client_id = c.id
group by c.id, c.name, c.plan_key
having count(distinct ct.id) > case when coalesce(c.plan_key, 'standard') = 'standard' then 1 else 999999 end
order by seats_used desc;

select c.id, c.name, c.plan_key, count(l.id) as rows_used
from public.clients c
left join public.maps m on m.client_id = c.id
left join public.listings l on l.map_id = m.id
group by c.id, c.name, c.plan_key
having count(l.id) > case when coalesce(c.plan_key, 'standard') = 'standard' then 300 else 1500 end
order by rows_used desc;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Catalog entries
insert into public.features (
  product_key, key, name, description, entitlement_type, enforcement,
  on_downgrade_policy, kill_switch_enabled, default_limit_value
) values
  ('maps', 'seats', 'Team seats',
   'Number of team members (contacts) a client can have.',
   'volume', 'hard', 'hard_block_new', false, 1),
  ('maps', 'data_rows', 'Data rows',
   'Number of listing rows a client can have across all of their maps.',
   'volume', 'hard', 'hard_block_new', false, 300);

-- 2) Per-plan defaults — seats
insert into public.plan_features (plan_key, feature_id, limit_value)
select 'standard', f.id, 1 from public.features f
  where f.product_key = 'maps' and f.key = 'seats';

insert into public.plan_features (plan_key, feature_id, limit_value)
select 'premium', f.id, null from public.features f
  where f.product_key = 'maps' and f.key = 'seats';

insert into public.plan_features (plan_key, feature_id, limit_value)
select 'unlimited', f.id, null from public.features f
  where f.product_key = 'maps' and f.key = 'seats';

-- 3) Per-plan defaults — data_rows
insert into public.plan_features (plan_key, feature_id, limit_value)
select 'standard', f.id, 300 from public.features f
  where f.product_key = 'maps' and f.key = 'data_rows';

insert into public.plan_features (plan_key, feature_id, limit_value)
select 'premium', f.id, 1500 from public.features f
  where f.product_key = 'maps' and f.key = 'data_rows';

insert into public.plan_features (plan_key, feature_id, limit_value)
select 'unlimited', f.id, 1500 from public.features f
  where f.product_key = 'maps' and f.key = 'data_rows';
-- No 'founder' rows for either feature: plans.is_founder_tier already
-- resolves Founder clients to unlimited.

-- 4) Enforcement trigger — seats (public.contacts)
create or replace function public.enforce_seats_limit()
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
  where f.product_key = 'maps' and f.key = 'seats';

  if v_limit is null then
    return new;
  end if;

  select count(*) into v_current_count from public.contacts where client_id = new.client_id;

  if v_current_count >= v_limit then
    raise exception 'Seat limit reached for this customer (% of % seats). Upgrade the plan or grant an override to add more team members.',
      v_current_count, v_limit;
  end if;

  return new;
end;
$$;

comment on function public.enforce_seats_limit() is
  'BEFORE INSERT gate on public.contacts enforcing the maps.seats entitlement server-side, regardless of caller (admin-created user, invite acceptance, signup provisioning). Same precedence as get_my_entitlements().';

drop trigger if exists trg_enforce_seats_limit on public.contacts;
create trigger trg_enforce_seats_limit
  before insert on public.contacts
  for each row
  execute function public.enforce_seats_limit();

-- 5) Enforcement trigger — data_rows (public.listings, via maps.client_id)
create or replace function public.enforce_data_rows_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_limit integer;
  v_current_count integer;
begin
  select client_id into v_client_id from public.maps where id = new.map_id;
  if v_client_id is null then
    return new; -- shouldn't happen given the FK, but fail open defensively
  end if;

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
  join public.clients c on c.id = v_client_id
  left join public.plans p on p.key = coalesce(c.plan_key, 'standard')
  left join public.client_overrides ov on ov.feature_id = f.id and ov.client_id = v_client_id
  left join public.plan_features pf on pf.feature_id = f.id and pf.plan_key = coalesce(c.plan_key, 'standard')
  where f.product_key = 'maps' and f.key = 'data_rows';

  if v_limit is null then
    return new;
  end if;

  select count(*) into v_current_count
    from public.listings l
    join public.maps m on m.id = l.map_id
    where m.client_id = v_client_id;

  if v_current_count >= v_limit then
    raise exception 'Data row limit reached for this customer (% of % rows across all their maps). Upgrade the plan or grant an override to add more.',
      v_current_count, v_limit;
  end if;

  return new;
end;
$$;

comment on function public.enforce_data_rows_limit() is
  'BEFORE INSERT gate on public.listings enforcing the maps.data_rows entitlement server-side, regardless of entry point (manual entry, CSV import, Google Sheets sync). Same precedence as get_my_entitlements().';

drop trigger if exists trg_enforce_data_rows_limit on public.listings;
create trigger trg_enforce_data_rows_limit
  before insert on public.listings
  for each row
  execute function public.enforce_data_rows_limit();


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'seats') then
    raise exception 'VERIFY FAILED: features.maps.seats was not created';
  end if;
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'data_rows') then
    raise exception 'VERIFY FAILED: features.maps.data_rows was not created';
  end if;
  if (
    select count(*) from public.plan_features pf join public.features f on f.id = pf.feature_id
    where f.product_key = 'maps' and f.key = 'seats'
  ) <> 3 then
    raise exception 'VERIFY FAILED: expected 3 plan_features rows for seats';
  end if;
  if (
    select count(*) from public.plan_features pf join public.features f on f.id = pf.feature_id
    where f.product_key = 'maps' and f.key = 'data_rows'
  ) <> 3 then
    raise exception 'VERIFY FAILED: expected 3 plan_features rows for data_rows';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_enforce_seats_limit') then
    raise exception 'VERIFY FAILED: trg_enforce_seats_limit was not created';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_enforce_data_rows_limit') then
    raise exception 'VERIFY FAILED: trg_enforce_data_rows_limit was not created';
  end if;
  raise notice 'VERIFY PASSED: seats + data_rows entitlements and enforcement triggers created';
end $$;

-- Row counts — clients/contacts/listings must be UNCHANGED from pre-migration.
select
  'clients'  as tbl, count(*) as rows from public.clients  union all
  select 'contacts', count(*) from public.contacts         union all
  select 'listings', count(*) from public.listings
order by tbl;

-- Orphan check — must return 0
select count(*) as orphaned_plan_features
  from public.plan_features pf
  join public.features f on f.id = pf.feature_id
  where f.product_key = 'maps' and f.key in ('seats', 'data_rows')
    and not exists (select 1 from public.plans p where p.key = pf.plan_key);
