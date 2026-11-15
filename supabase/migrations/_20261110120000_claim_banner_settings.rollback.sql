-- ============================================================
-- Rollback: 20261110120000_claim_banner_settings
-- Reverses: removes the banner columns (customised banner text and colours
-- are lost, so export them first if needed) and removes the two claim banner
-- events from the engagement event check. Refuses to run if such rows exist.
-- ============================================================

do $$
begin
  if exists (select 1 from public.map_engagement_events where event_type in ('claim_banner_view', 'claim_banner_secondary_click')) then
    raise exception 'ABORT: map_engagement_events has claim_banner_* rows. Remove or retype them first.';
  end if;
end $$;

alter table public.directory_claim_settings
  drop column if exists banner_heading,
  drop column if exists banner_body,
  drop column if exists banner_button_label,
  drop column if exists banner_secondary_label,
  drop column if exists banner_secondary_url,
  drop column if exists banner_accent_colour,
  drop column if exists banner_button_text_colour,
  drop column if exists banner_background_colour,
  drop column if exists banner_border_colour;

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

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%claim_banner_view%'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: claim banner events still allowed';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
