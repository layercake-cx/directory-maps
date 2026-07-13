-- ============================================================
-- Rollback: 20260713130000_map_engagement_filter_events
-- Reverses: restores the map_engagement_event_type CHECK constraint to the
--           pre-filter-events list (matching 20260515120000).
-- ============================================================
--
-- NOTE: after rollback, any rows with event_type in
-- ('directory_group_filter','directory_continent_filter','directory_custom_filter')
-- would violate the restored constraint. Postgres validates existing rows when
-- adding a CHECK, so this rollback will FAIL if such rows exist. The guard below
-- reports that clearly; delete or relabel those rows first if you must roll back.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECK
-- ------------------------------------------------------------

do $$
declare
  n bigint;
begin
  select count(*) into n
  from public.map_engagement_events
  where event_type in ('directory_group_filter', 'directory_continent_filter', 'directory_custom_filter');
  if n > 0 then
    raise exception
      'ABORT: % engagement row(s) use the filter event types; restoring the old constraint would fail. Delete/relabel them before rolling back.', n;
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

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


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'map_engagement_event_type'
    and conrelid = 'public.map_engagement_events'::regclass;
  if position('directory_custom_filter' in def) > 0 then
    raise exception 'ROLLBACK VERIFY FAILED: constraint still includes directory_custom_filter';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
