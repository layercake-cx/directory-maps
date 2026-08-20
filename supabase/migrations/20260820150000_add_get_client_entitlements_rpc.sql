-- ============================================================
-- Migration: 20260820150000_add_get_client_entitlements_rpc
-- Description: Admin-only counterpart to get_my_entitlements() — resolves
--              entitlements for an ARBITRARY client, not just the calling
--              user's own. Needed because admin screens (e.g. the customer
--              detail "Messaging" tab) configure a client from route
--              params, not the logged-in admin's own client, so the
--              self-scoped RPC can't answer "does THIS client have the
--              messaging entitlement" for them.
--
--              This is the "second admin-side use case" flagged as a
--              follow-up in 20260820120000_seed_max_maps_entitlement.sql's
--              plan notes (AdminMapNew.jsx's skipped proactive hint was the
--              first) — now real, so a proper parameterized RPC is the
--              right DRY answer rather than a third copy of the precedence
--              logic in JS.
--
--              Same precedence/shape as get_my_entitlements(), just keyed
--              by an explicit p_client_id argument and gated by
--              public.is_admin() instead of current_user_client_id().
-- Affected tables: none (function only)
-- Rollback: _20260820150000_add_get_client_entitlements_rpc.rollback.sql
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
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'get_my_entitlements') then
    raise exception 'ABORT: get_my_entitlements() does not exist — apply 20260819120000_create_entitlements.sql first';
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'is_admin') then
    raise exception 'ABORT: public.is_admin() does not exist';
  end if;
  if exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'get_client_entitlements') then
    raise exception 'ABORT: get_client_entitlements already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create or replace function public.get_client_entitlements(p_client_id text)
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
    where c.id = p_client_id
      and public.is_admin()
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

comment on function public.get_client_entitlements(text) is
  'Admin-only counterpart to get_my_entitlements(): resolves entitlements for an arbitrary client_id (gated by public.is_admin() inside the query — non-admins get {} back, not an error). Same precedence/shape as get_my_entitlements(). Used by admin screens that configure a client from route params rather than the calling admin''s own client.';

grant execute on function public.get_client_entitlements(text) to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'get_client_entitlements') then
    raise exception 'VERIFY FAILED: get_client_entitlements() was not created';
  end if;
  raise notice 'VERIFY PASSED: get_client_entitlements() created';
end $$;

-- Row counts unaffected (function only)
select
  'clients' as tbl, count(*) as rows from public.clients union all
  select 'maps',    count(*) from public.maps
order by tbl;
