-- ============================================================
-- Rollback: 20261031120000_ask_ai_events
-- Reverses: removes the ask_ai_* events from the engagement event check.
-- Refuses to run if ask_ai_* rows exist (remove or retype them first).
-- ============================================================

do $$
begin
  if exists (select 1 from public.map_engagement_events where event_type like 'ask_ai\_%') then
    raise exception 'ABORT: map_engagement_events has ask_ai_* rows. Remove or retype them before the check constraint can shrink.';
  end if;
end $$;

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

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%ask_ai_open%'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: ask_ai events still allowed';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
