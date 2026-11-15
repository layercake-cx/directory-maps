-- ============================================================
-- Migration: 20261031120000_ask_ai_events
-- Description: Adds the Ask AI visitor events to the engagement event
--              check: ask_ai_open, ask_ai_message_sent, ask_ai_picks_applied,
--              ask_ai_picks_cleared, ask_ai_feedback, ask_ai_rate_limited.
--              Fired by the Ask AI sidebar on published directory sites.
-- Affected tables: map_engagement_events (check constraint only)
-- Rollback: _20261031120000_ask_ai_events.rollback.sql
-- Author: Claude Code
-- Date: 2026-10-31
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
      and pg_get_constraintdef(oid) like '%ask_ai_open%'
  ) then
    raise exception 'ABORT: ask_ai_open is already allowed — migration may have already run';
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
    'platform_footer_click',
    'ask_ai_open',
    'ask_ai_message_sent',
    'ask_ai_picks_applied',
    'ask_ai_picks_cleared',
    'ask_ai_feedback',
    'ask_ai_rate_limited'
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
      and pg_get_constraintdef(oid) like '%ask_ai_open%'
      and pg_get_constraintdef(oid) like '%platform_footer_click%'
  ) then
    raise exception 'VERIFY FAILED: ask_ai events missing from map_engagement_event_type';
  end if;
  raise notice 'VERIFY PASSED: ask_ai events allowed';
end $$;

select count(*) as map_engagement_events_rows from public.map_engagement_events;
