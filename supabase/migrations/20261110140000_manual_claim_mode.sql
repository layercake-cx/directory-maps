-- ============================================================
-- Migration: 20261110140000_manual_claim_mode
-- Description: Adds a per-directory choice of how claims are handled
--              (claim_mode: 'auto' = existing verified self-service flow,
--              'manual' = visitor sends name/email/message to a configured
--              mailbox) plus the mailbox (claim_notify_email). Every manual
--              request is also stored in claim_requests (audit trail, and a
--              record if the email send fails). Allows the visitor event
--              listing_claim_request_sent.
-- Affected tables: directory_claim_settings, claim_requests (new),
--                  map_engagement_events
-- Rollback: _20261110140000_manual_claim_mode.rollback.sql
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
-- stay 'auto'), one new table, and a widened check.
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECKS
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
    where table_schema = 'public' and table_name = 'directory_claim_settings' and column_name = 'claim_mode'
  ) then
    raise exception 'ABORT: claim_mode already exists, migration may have already run';
  end if;
  if to_regclass('public.claim_requests') is not null then
    raise exception 'ABORT: claim_requests already exists, migration may have already run';
  end if;
end $$;

select count(*) as directory_claim_settings_rows from public.directory_claim_settings;
select count(*) as map_engagement_events_rows from public.map_engagement_events;
-- Save both counts. They must be UNCHANGED after (additive only).

-- THE MIGRATION

alter table public.directory_claim_settings
  add column claim_mode text not null default 'auto'
    check (claim_mode in ('auto', 'manual')),
  add column claim_notify_email text null
    check (claim_notify_email is null or (char_length(claim_notify_email) <= 254 and claim_notify_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'));

comment on column public.directory_claim_settings.claim_mode is
  'auto = verified self-service claim (work email, domain match, magic link). manual = visitor sends name, email and message to claim_notify_email; a directory admin then creates the claim by hand.';
comment on column public.directory_claim_settings.claim_notify_email is
  'Mailbox that receives manual claim requests. Required for manual mode to accept requests (enforced by the submit_claim_request Edge Function).';

create table public.claim_requests (
  id uuid primary key default gen_random_uuid(),
  directory_id uuid not null references public.directories(id) on delete cascade,
  directory_item_id uuid not null references public.directory_entries(id) on delete cascade,
  entry_name text not null,
  requester_name text not null,
  requester_email text not null,
  message text null,
  to_email text not null,
  email_sent boolean not null default false,
  email_error text null,
  status text not null default 'new' check (status in ('new', 'handled')),
  created_at timestamptz not null default now()
);

create index idx_claim_requests_directory on public.claim_requests(directory_id, created_at desc);
create index idx_claim_requests_item_email on public.claim_requests(directory_item_id, requester_email);

comment on table public.claim_requests is
  'Manual-mode claim requests from published directory entry pages. Written only by the submit_claim_request Edge Function (service role). Read-only to directory admins and the owning organisation.';

alter table public.claim_requests enable row level security;

create policy claim_requests_select_admin on public.claim_requests
  for select using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy claim_requests_select_client on public.claim_requests
  for select using (directory_id in (select id from public.directories where client_id = public.current_user_client_id()));

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
    'listing_claim_request_sent'
  )
);

-- POST-MIGRATION VERIFICATION
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_claim_settings' and column_name = 'claim_notify_email'
  ) then
    raise exception 'VERIFY FAILED: claim settings columns missing';
  end if;
  if to_regclass('public.claim_requests') is null then
    raise exception 'VERIFY FAILED: claim_requests missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%listing_claim_request_sent%'
      and pg_get_constraintdef(oid) like '%claim_banner_view%'
  ) then
    raise exception 'VERIFY FAILED: listing_claim_request_sent missing from map_engagement_event_type';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select count(*) as directory_claim_settings_rows from public.directory_claim_settings;
select count(*) as map_engagement_events_rows from public.map_engagement_events;
-- Expected: both unchanged from the pre-migration counts.
