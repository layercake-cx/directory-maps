-- ============================================================
-- Rollback: 20260820140000_gate_messaging_entitlement
-- Reverses: restores the pre-entitlement client_messaging_settings view,
--           then deletes the maps.messaging features row (cascades to its
--           plan_features/client_overrides rows via the existing FK on
--           delete cascade — including the grandfathering overrides this
--           migration created).
--
-- Note: once rolled back, messaging goes back to being governed purely by
-- clients.messaging_enabled for everyone (no plan gating) — the same
-- behaviour as before this migration ever ran.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.features where product_key = 'maps' and key = 'messaging'
  ) then
    raise exception 'ABORT: nothing to roll back — features.maps.messaging does not exist';
  end if;

  -- Data-loss guard — abort if any override exists for this feature that
  -- ISN'T one of the grandfathering rows this migration created (i.e. an
  -- admin has since granted/restricted messaging for a specific client
  -- through the Entitlements tab — that's real, independent admin intent
  -- and shouldn't be silently discarded by rolling back the original seed).
  if exists (
    select 1 from public.client_overrides ov
    join public.features f on f.id = ov.feature_id
    where f.product_key = 'maps' and f.key = 'messaging'
      and (ov.reason is null or ov.reason not like 'grandfathered — had messaging enabled before Premium-and-above gating%')
    limit 1
  ) then
    raise exception
      'ABORT: one or more client_overrides for maps.messaging were set manually (not by this migration''s grandfathering). '
      'Record those before rolling back. To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

-- Restore the view to its pre-entitlement definition (from
-- 20260602120000_add_email_test_mode.sql), same column list/order.
create or replace view public.client_messaging_settings as
  select
    id                  as client_id,
    messaging_enabled,
    messaging_prompt,
    email_test_mode,
    email_test_recipient
  from public.clients;

grant select on public.client_messaging_settings to anon;
grant select on public.client_messaging_settings to authenticated;

delete from public.features where product_key = 'maps' and key = 'messaging';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.features where product_key = 'maps' and key = 'messaging'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: features.maps.messaging still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — clients unchanged
select 'clients' as tbl, count(*) as rows from public.clients;

-- View shape check — should be back to 5 plain columns, no entitlement join
select client_id, messaging_enabled, messaging_prompt, email_test_mode, email_test_recipient
from public.client_messaging_settings
limit 1;
