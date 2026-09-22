-- ============================================================
-- Rollback: 20260922103000_directory_location_search
-- Reverses: drops location_search_enabled, the place geocode cache, the
--           resolve rate-limit log, and removes directory_distance_filter
--           from the engagement event check.
-- Refuses to run if a directory has the switch on, if the cache or request
-- log has rows, or if a distance-filter event has been recorded.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'directories'
      and column_name = 'location_search_enabled'
  ) then
    raise exception 'ABORT: nothing to roll back — directories.location_search_enabled does not exist';
  end if;
  if exists (select 1 from public.directories where location_search_enabled = true) then
    raise exception 'ABORT: at least one directory has location search on. Turn it off and republish before rolling back.';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'place_geocode_cache')
     and exists (select 1 from public.place_geocode_cache) then
    raise exception 'ABORT: place_geocode_cache has rows. Export them first if they must be kept.';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_place_resolve_requests')
     and exists (select 1 from public.directory_place_resolve_requests) then
    raise exception 'ABORT: directory_place_resolve_requests has rows. Export them first if they must be kept.';
  end if;
  if exists (select 1 from public.map_engagement_events where event_type = 'directory_distance_filter') then
    raise exception 'ABORT: map_engagement_events has directory_distance_filter rows. Those rows must be removed or retyped before the check constraint can shrink.';
  end if;
end $$;

drop table if exists public.directory_place_resolve_requests;
drop table if exists public.place_geocode_cache;

alter table public.directories drop column if exists location_search_enabled;

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

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories' and column_name = 'location_search_enabled'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: location_search_enabled still exists';
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%directory_distance_filter%'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directory_distance_filter is still allowed';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: directory location search removed';
end $$;
