-- ============================================================
-- Rollback: 20260922093000_directory_enquiry
-- Reverses: directories.enquiry_email and the two enquiry event types
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'directories'
      and column_name = 'enquiry_email'
  ) then
    raise exception 'ABORT: column enquiry_email does not exist — nothing to roll back';
  end if;

  if exists (select 1 from public.directories where enquiry_email is not null limit 1) then
    raise exception 'ABORT: enquiry_email has live data — back it up before rolling back. To override, delete this check and re-run.';
  end if;

  if exists (
    select 1 from public.map_engagement_events
    where event_type in ('listing_enquiry_open', 'listing_enquiry_sent')
    limit 1
  ) then
    raise exception 'ABORT: enquiry engagement rows exist — delete or archive them before rolling back the event-type constraint.';
  end if;
end $$;

-- THE ROLLBACK
alter table public.directories drop column if exists enquiry_email;

comment on table public.directory_contact_submissions is
  'Visitor contact form submissions from published directories (build-scope §5.10 enquiry). Peer of map_contact_submissions. The enquiry form UI and email-sending Edge Function are separate, later work — this is the table + RLS only.';

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
    'listing_upgrade_complete'
  )
);

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'directories'
      and column_name = 'enquiry_email'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: column enquiry_email still exists';
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%listing_enquiry_open%'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: listing_enquiry_open is still allowed';
  end if;

  raise notice 'ROLLBACK VERIFY PASSED: directory enquiry email and events removed';
end $$;
