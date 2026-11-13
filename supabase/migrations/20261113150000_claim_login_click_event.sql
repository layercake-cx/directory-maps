-- ============================================================
-- Migration: 20261113150000_claim_login_click_event
-- Description: Allows the visitor event claim_login_click, fired when a
--              visitor clicks the claimant "Manage your listing" / "Listing
--              owner log in" link in a published directory site's header or
--              footer. See docs/CLAIMANT_LOGIN_SPEC.md.
-- Affected tables: map_engagement_events (check constraint only)
-- Rollback: _20261113150000_claim_login_click_event.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-13
-- ============================================================
--
-- DRY-RUN BLOCK (run first, no persistent changes):
--   BEGIN;
--   <paste the migration body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run -> STAGING (beqejxneehilplrtpntn) -> verification ->
-- PRODUCTION (gxixwdjfmegxcxfeflro) only after explicit sign-off.
--
-- Forbidden operations: none. Replaces a check constraint with a superset of
-- its allowed values; no data changes.
--
-- PRE-MIGRATION INTEGRITY: select count(*) from public.map_engagement_events;
-- ============================================================

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
    'platform_footer_click',
    'ask_ai_open',
    'ask_ai_message_sent',
    'ask_ai_picks_applied',
    'ask_ai_picks_cleared',
    'ask_ai_feedback',
    'ask_ai_rate_limited',
    'claim_banner_view',
    'claim_banner_secondary_click',
    'listing_claim_request_sent',
    'claim_login_click'
  )
);

-- POST-MIGRATION VERIFICATION
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%claim_login_click%'
      and pg_get_constraintdef(oid) like '%listing_claim_request_sent%'
  ) then
    raise exception 'VERIFY FAILED: claim_login_click missing from map_engagement_event_type';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select count(*) as map_engagement_events_rows from public.map_engagement_events;
-- Expected: unchanged from the pre-migration count.
