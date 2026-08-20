-- ============================================================
-- Migration: 20260820130000_rename_plan_display_names
-- Description: Renames the entitlements catalog's plan display names
--              (plans.name only — plans.key is unchanged, since it's wired
--              into clients.plan_key, plan_features.plan_key, and the
--              Stripe checkout plan ids in PricingPlans.jsx/
--              create_checkout_session):
--                standard  "Standard"        -> "Basic"
--                premium   "Premium"         -> "Professional"
--                unlimited "Unlimited"       -> "Enterprise"
--                founder   "Founder Members" -> "Founding Partner"
--
--              This only affects the admin Entitlements tab's plan
--              dropdown and the admin Customers list "Plan" column (both
--              already just render plans.name via listPlans()) — no
--              frontend code changes needed.
--
--              Deliberately NOT touching PricingPlans.jsx (Stripe checkout
--              copy: "Standard/Premium/Unlimited") or Pricing.jsx
--              (marketing page: "Starter/Pro/Agency") — those are
--              customer/billing-facing and already a known, separate
--              reconciliation TODO (docs/BETA_READINESS.md #4,
--              docs/FEATURES.md). Renaming only the internal admin-facing
--              names here would otherwise add a third naming scheme on
--              top of the two that already don't match each other.
-- Affected tables: plans (name column only)
-- Rollback: _20260820130000_rename_plan_display_names.rollback.sql
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'plans') then
    raise exception 'ABORT: table public.plans does not exist';
  end if;
  if (select name from public.plans where key = 'standard') <> 'Standard' then
    raise exception 'ABORT: plans.standard.name is not "Standard" — someone may have already renamed it, check before proceeding';
  end if;
  if (select name from public.plans where key = 'premium') <> 'Premium' then
    raise exception 'ABORT: plans.premium.name is not "Premium" — someone may have already renamed it, check before proceeding';
  end if;
  if (select name from public.plans where key = 'unlimited') <> 'Unlimited' then
    raise exception 'ABORT: plans.unlimited.name is not "Unlimited" — someone may have already renamed it, check before proceeding';
  end if;
  if (select name from public.plans where key = 'founder') <> 'Founder Members' then
    raise exception 'ABORT: plans.founder.name is not "Founder Members" — someone may have already renamed it, check before proceeding';
  end if;
end $$;

-- Inspect before proceeding
select key, name from public.plans order by sort_order;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

update public.plans set name = 'Basic'            where key = 'standard';
update public.plans set name = 'Professional'      where key = 'premium';
update public.plans set name = 'Enterprise'        where key = 'unlimited';
update public.plans set name = 'Founding Partner'  where key = 'founder';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if (select name from public.plans where key = 'standard') <> 'Basic' then
    raise exception 'VERIFY FAILED: standard plan name was not updated to "Basic"';
  end if;
  if (select name from public.plans where key = 'premium') <> 'Professional' then
    raise exception 'VERIFY FAILED: premium plan name was not updated to "Professional"';
  end if;
  if (select name from public.plans where key = 'unlimited') <> 'Enterprise' then
    raise exception 'VERIFY FAILED: unlimited plan name was not updated to "Enterprise"';
  end if;
  if (select name from public.plans where key = 'founder') <> 'Founding Partner' then
    raise exception 'VERIFY FAILED: founder plan name was not updated to "Founding Partner"';
  end if;
  if (select count(*) from public.plans) <> 4 then
    raise exception 'VERIFY FAILED: expected exactly 4 plans (row count changed unexpectedly)';
  end if;
  raise notice 'VERIFY PASSED: plan display names renamed';
end $$;

select key, name from public.plans order by sort_order;
