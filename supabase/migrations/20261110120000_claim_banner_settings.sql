-- ============================================================
-- Migration: 20261110120000_claim_banner_settings
-- Description: Per-directory content and colours for the inline "Claim this
--              listing" banner on unclaimed listing pages, stored on
--              directory_claim_settings (edited in Claims > Settings). Also
--              allows two new visitor events: claim_banner_view and
--              claim_banner_secondary_click. (The primary button reuses
--              listing_cta_click with cta_type 'claim'.)
-- Affected tables: directory_claim_settings, map_engagement_events
-- Rollback: _20261110120000_claim_banner_settings.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-10
-- ============================================================
--
-- DRY-RUN BLOCK (run this first, it makes NO persistent changes):
--   BEGIN;
--   <paste THE MIGRATION body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run -> STAGING (beqejxneehilplrtpntn) -> verification ->
-- PRODUCTION (gxixwdjfmegxcxfeflro) only after explicit sign-off.
--
-- Forbidden operations: none. Additive columns with defaults (existing rows
-- get the defaults without anyone saving the form) and a widened check.
-- ============================================================

-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directory_claim_settings'
  ) then
    raise exception 'ABORT: table public.directory_claim_settings does not exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_claim_settings' and column_name = 'banner_heading'
  ) then
    raise exception 'ABORT: banner_heading already exists, migration may have already run';
  end if;
end $$;

select count(*) as directory_claim_settings_rows from public.directory_claim_settings;
select count(*) as map_engagement_events_rows from public.map_engagement_events;
-- Save both counts. They must be UNCHANGED after (additive only).

-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.directory_claim_settings
  add column banner_heading text not null default 'Is this your organisation?'
    check (char_length(banner_heading) between 1 and 80),
  add column banner_body text not null
    default 'This listing hasn''t been claimed. Claim it for free to update {{org_name}}''s details, description and logo.'
    check (char_length(banner_body) between 1 and 240),
  add column banner_button_label text not null default 'Claim this listing'
    check (char_length(banner_button_label) between 1 and 30),
  add column banner_secondary_label text null default 'How claiming works'
    check (banner_secondary_label is null or char_length(banner_secondary_label) <= 30),
  add column banner_secondary_url text null
    check (banner_secondary_url is null or (char_length(banner_secondary_url) <= 500
      and (banner_secondary_url like 'https://%' or banner_secondary_url like '/%'))),
  add column banner_accent_colour text not null default '#3F4C8A'
    check (banner_accent_colour ~ '^#[0-9A-Fa-f]{6}$'),
  add column banner_button_text_colour text not null default '#FFFFFF'
    check (banner_button_text_colour ~ '^#[0-9A-Fa-f]{6}$'),
  add column banner_background_colour text not null default '#ECEEFA'
    check (banner_background_colour ~ '^#[0-9A-Fa-f]{6}$'),
  add column banner_border_colour text not null default '#CFD4EA'
    check (banner_border_colour ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.directory_claim_settings.banner_body is
  'Banner body text. Placeholders {{org_name}} resolve per listing at publish time (HTML-escaped).';

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
    'claim_banner_secondary_click'
  )
);

-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_claim_settings' and column_name = 'banner_border_colour'
  ) then
    raise exception 'VERIFY FAILED: banner columns missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%claim_banner_view%'
      and pg_get_constraintdef(oid) like '%ask_ai_open%'
  ) then
    raise exception 'VERIFY FAILED: claim banner events missing from map_engagement_event_type';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select count(*) as directory_claim_settings_rows from public.directory_claim_settings;
select count(*) as map_engagement_events_rows from public.map_engagement_events;
