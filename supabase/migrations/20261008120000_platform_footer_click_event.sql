-- ============================================================
-- Migration: 20261008120000_platform_footer_click_event
-- Description: Adds platform_footer_click to the visitor engagement event
--              check. Fired when a visitor clicks the logo or the
--              "Discover Layercake Maps" button in the "Built on Layercake
--              Maps" panel in a published directory's footer.
-- Affected tables: map_engagement_events (check constraint only)
-- Rollback: _20261008120000_platform_footer_click_event.rollback.sql
-- Author: Claude Code
-- Date: 2026-10-08
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run -> STAGING (beqejxneehilplrtpntn) -> verify -> only then
-- PRODUCTION (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
  ) then
    raise exception 'ABORT: map_engagement_event_type constraint is missing';
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%platform_footer_click%'
  ) then
    raise exception 'ABORT: platform_footer_click is already allowed — migration may have already run';
  end if;
end $$;

select count(*) as map_engagement_events_rows from public.map_engagement_events;
-- Save this count. It must be UNCHANGED after (additive only).

-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.map_engagement_events drop constraint if exists map_engagement_event_type;

alter table public.map_engagement_events add constraint map_engagement_event_type check (
  event_type in (
    'session_start',
    'directory_group_expand',
    'directory_group_filter',
    'directory_continent_filter',
    'directory_custom_filter',
    'listing_panel_open',
    'website_click',
    'email_click',
    'message_compose_open',
    'message_sent',
    'search',
    'directory_view',
    'directory_search',
    'directory_filter',
    'listing_view',
    'map_marker_click',
    'listing_website_click',
    'listing_contact_click',
    'listing_cta_click',
    'listing_claim_start',
    'listing_claim_complete',
    'listing_upgrade_start',
    'listing_upgrade_complete',
    'listing_enquiry_open',
    'listing_enquiry_sent',
    'directory_distance_filter',
    'platform_footer_click'
  )
);

-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%platform_footer_click%'
      and pg_get_constraintdef(oid) like '%directory_distance_filter%'
  ) then
    raise exception 'VERIFY FAILED: platform_footer_click missing from map_engagement_event_type';
  end if;
  raise notice 'VERIFY PASSED: platform_footer_click allowed';
end $$;

select count(*) as map_engagement_events_rows from public.map_engagement_events;
