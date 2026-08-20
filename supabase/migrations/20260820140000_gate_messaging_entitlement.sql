-- ============================================================
-- Migration: 20260820140000_gate_messaging_entitlement
-- Description: Makes Messaging a real commercial entitlement (Professional
--              plan [key: 'premium'] and above), rather than the
--              free-standing clients.messaging_enabled on/off toggle it has
--              been until now.
--
--              Catalog: features.maps.messaging (boolean). Plan defaults:
--              standard -> false, premium -> true, unlimited -> true.
--              Founder needs no row (pseudo-tier shortcut already resolves
--              to enabled).
--
--              Grandfathering (on_downgrade_policy = 'grandfather', per
--              explicit product decision): any client NOT on premium/
--              unlimited/founder that already has messaging_enabled = true
--              today gets a client_overrides row (bool_value = true) so
--              messaging keeps working for them exactly as before. Only
--              NEW/other Standard clients are newly gated.
--
--              Enforcement (server-side, not just UI-hidden, mirroring the
--              max_maps trigger precedent):
--              1) client_messaging_settings view (from
--                 20260601110000_add_messaging_to_clients.sql, extended by
--                 20260602120000_add_email_test_mode.sql) is redefined so
--                 its messaging_enabled output column becomes
--                 clients.messaging_enabled AND <resolved messaging
--                 entitlement> (kill switch > override > Founder tier >
--                 plan default > catalog fallback). EmbedMap.jsx already
--                 reads this exact view and already gates the "Send
--                 message" button on this column, so this needs ZERO
--                 frontend changes on the public map path.
--              2) The send_contact_message Edge Function (which actually
--                 calls Resend) is updated in the same PR to also check
--                 this view before sending — defense in depth, so the view
--                 isn't the only gate on the money-shot action (sending
--                 email), in case anything ever calls the function
--                 directly. See supabase/functions/send_contact_message.
-- Affected tables: features, plan_features, client_overrides (rows added);
--                  client_messaging_settings (view redefined, same columns)
-- Rollback: _20260820140000_gate_messaging_entitlement.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-20
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- Before applying for real, run the "grandfathering preview" query below
-- and eyeball the list — this is a real, customer-visible decision, not
-- just schema.
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
  if not exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'client_messaging_settings') then
    raise exception 'ABORT: view public.client_messaging_settings does not exist';
  end if;
  if exists (select 1 from public.features where product_key = 'maps' and key = 'messaging') then
    raise exception 'ABORT: features.maps.messaging already exists — migration may have already run';
  end if;
end $$;

-- Grandfathering preview — inspect before proceeding. Every row listed here
-- will receive a client_overrides(bool_value=true) grant in this migration.
select c.id as client_id, c.name, c.plan_key, c.messaging_enabled
from public.clients c
where coalesce(c.plan_key, 'standard') not in ('premium', 'unlimited')
  and c.messaging_enabled = true
order by c.name;

-- Row counts — inspect before proceeding
select
  'clients'          as tbl, count(*) as rows from public.clients          union all
  select 'client_overrides', count(*) from public.client_overrides
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Catalog entry
insert into public.features (
  product_key, key, name, description, entitlement_type, enforcement,
  on_downgrade_policy, kill_switch_enabled, default_bool_value
) values (
  'maps', 'messaging', 'Messaging',
  'Whether a client can enable visitor-to-listing contact messaging on their maps.',
  'boolean', 'hard', 'grandfather', false, false
);

-- 2) Per-plan defaults
insert into public.plan_features (plan_key, feature_id, bool_value)
select 'standard', f.id, false from public.features f
  where f.product_key = 'maps' and f.key = 'messaging';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'premium', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'messaging';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'unlimited', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'messaging';
-- No 'founder' row: plans.is_founder_tier already resolves Founder clients
-- to enabled without one.

-- 3) Grandfather existing Standard-plan clients who already have
--    messaging_enabled = true, so they keep working exactly as before.
insert into public.client_overrides (client_id, feature_id, bool_value, reason)
select
  c.id,
  f.id,
  true,
  'grandfathered — had messaging enabled before Premium-and-above gating (2026-08-20)'
from public.clients c
cross join public.features f
where f.product_key = 'maps' and f.key = 'messaging'
  and coalesce(c.plan_key, 'standard') not in ('premium', 'unlimited')
  and c.messaging_enabled = true;

-- 4) Enforcement, part 1: bake the entitlement into the existing view.
--    Same column list/order as before — EmbedMap.jsx needs no changes.
create or replace view public.client_messaging_settings as
  select
    c.id as client_id,
    c.messaging_enabled and coalesce(
      case
        when f.kill_switch_enabled then false
        when ov.feature_id is not null then ov.bool_value
        when p.is_founder_tier then true
        when pf.feature_id is not null then pf.bool_value
        else f.default_bool_value
      end,
      false
    ) as messaging_enabled,
    c.messaging_prompt,
    c.email_test_mode,
    c.email_test_recipient
  from public.clients c
  left join public.plans p on p.key = coalesce(c.plan_key, 'standard')
  left join public.features f on f.product_key = 'maps' and f.key = 'messaging'
  left join public.client_overrides ov on ov.feature_id = f.id and ov.client_id = c.id
  left join public.plan_features pf on pf.feature_id = f.id and pf.plan_key = coalesce(c.plan_key, 'standard');

grant select on public.client_messaging_settings to anon;
grant select on public.client_messaging_settings to authenticated;

comment on view public.client_messaging_settings is
  'Public-safe messaging settings for the embed map. messaging_enabled = clients.messaging_enabled AND the resolved "messaging" entitlement (kill switch > override > Founder tier > plan default > catalog fallback) — enforcement lives here, not just in the UI.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'messaging') then
    raise exception 'VERIFY FAILED: features.maps.messaging was not created';
  end if;
  if (
    select count(*) from public.plan_features pf
    join public.features f on f.id = pf.feature_id
    where f.product_key = 'maps' and f.key = 'messaging'
  ) <> 3 then
    raise exception 'VERIFY FAILED: expected 3 plan_features rows (standard/premium/unlimited) for messaging';
  end if;
  raise notice 'VERIFY PASSED: messaging entitlement + view enforcement created';
end $$;

-- Row counts — clients must be UNCHANGED; client_overrides increases by
-- exactly the number of grandfathered clients shown in the preview above.
select
  'clients'          as tbl, count(*) as rows from public.clients          union all
  select 'client_overrides', count(*) from public.client_overrides
order by tbl;

-- Spot-check: every grandfathered client should now resolve to enabled.
select c.id, c.name, c.plan_key, cms.messaging_enabled
from public.clients c
join public.client_messaging_settings cms on cms.client_id = c.id
join public.client_overrides ov on ov.client_id = c.id
join public.features f on f.id = ov.feature_id and f.product_key = 'maps' and f.key = 'messaging'
order by c.name;
-- Every row must show messaging_enabled = true.

-- Orphan check — must return 0
select count(*) as orphaned_plan_features
  from public.plan_features pf
  join public.features f on f.id = pf.feature_id
  where f.product_key = 'maps' and f.key = 'messaging'
    and not exists (select 1 from public.plans p where p.key = pf.plan_key);
