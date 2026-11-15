-- ============================================================
-- Rollback: 20261110140000_manual_claim_mode
-- Reverses: drops claim_requests (stored manual requests are LOST, so export
-- them first if needed), removes claim_mode / claim_notify_email, and removes
-- listing_claim_request_sent from the engagement event check. Refuses to run
-- if such engagement rows exist. Directories set to 'manual' revert to the
-- automatic flow once the columns are gone and pages are republished.
-- ============================================================

do $$
begin
  if exists (select 1 from public.map_engagement_events where event_type = 'listing_claim_request_sent') then
    raise exception 'ABORT: map_engagement_events has listing_claim_request_sent rows. Remove or retype them first.';
  end if;
end $$;

drop table if exists public.claim_requests;

alter table public.directory_claim_settings
  drop column if exists claim_mode,
  drop column if exists claim_notify_email;

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

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%listing_claim_request_sent%'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: listing_claim_request_sent still allowed';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
