-- Add search event type (for DBs that already applied 20260514120000 without it).

alter table public.map_engagement_events drop constraint if exists map_engagement_event_type;

alter table public.map_engagement_events add constraint map_engagement_event_type check (
  event_type in (
    'session_start',
    'directory_group_expand',
    'listing_panel_open',
    'website_click',
    'email_click',
    'message_compose_open',
    'message_sent',
    'search'
  )
);
