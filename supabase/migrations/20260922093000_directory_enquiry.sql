-- ============================================================
-- Migration: 20260922093000_directory_enquiry
-- Description: Stores the directory contact inbox for Make an Enquiry,
--              and allows the two public engagement events that button
--              records (drawer open, and a successful send).
-- Affected tables: directories, map_engagement_events,
--                  directory_contact_submissions (comment only)
-- Rollback: _20260922093000_directory_enquiry.rollback.sql
-- Author: Cursor agent
-- Date: 2026-09-22
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directories'
  ) then
    raise exception 'ABORT: table public.directories does not exist';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'directories'
      and column_name = 'enquiry_email'
  ) then
    raise exception 'ABORT: column enquiry_email already exists — migration may have already run';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
  ) then
    raise exception 'ABORT: map_engagement_event_type constraint is missing';
  end if;
end $$;

-- CAPTURE PRE-STATE
select
  (select count(*) from public.directories) as directories,
  (select count(*) from public.map_engagement_events) as map_engagement_events,
  (select count(*) from public.directory_contact_submissions) as directory_contact_submissions;


-- ============================================================
-- THE MIGRATION
-- ============================================================

alter table public.directories
  add column enquiry_email text null;

comment on column public.directories.enquiry_email is
  'Inbox for Make an Enquiry on published entry pages. Blank hides the button. Delivery still uses the organisation messaging settings (enable, test mode, from address, subject).';

comment on table public.directory_contact_submissions is
  'Visitor enquiry submissions from published directories. Written by send_contact_message when a visitor uses Make an Enquiry. Peer of map_contact_submissions.';

-- Superset of 20260920090000_directory_engagement_analytics.sql, plus the
-- two enquiry events. Existing rows stay valid because nothing is removed.
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
    'listing_enquiry_sent'
  )
);


-- ============================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'directories'
      and column_name = 'enquiry_email'
      and is_nullable = 'YES'
  ) then
    raise exception 'VERIFY FAILED: directories.enquiry_email was not created as nullable text';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%listing_enquiry_open%'
      and pg_get_constraintdef(oid) like '%listing_enquiry_sent%'
  ) then
    raise exception 'VERIFY FAILED: enquiry event types are missing from map_engagement_event_type';
  end if;

  raise notice 'VERIFY PASSED: directory enquiry email and engagement events';
end $$;

select
  (select count(*) from public.directories) as directories,
  (select count(*) from public.map_engagement_events) as map_engagement_events,
  (select count(*) from public.directory_contact_submissions) as directory_contact_submissions;
-- Expected: all three counts unchanged
