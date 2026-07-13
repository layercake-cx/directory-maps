-- ============================================================
-- Migration: 20260713130000_map_engagement_filter_events
-- Description: Extend the map_engagement_events event-type CHECK constraint to
--              allow the directory filter events. `directory_group_filter` and
--              `directory_continent_filter` were already emitted by the embed
--              (group lozenge / continent chip toggles) but silently rejected
--              by the constraint; `directory_custom_filter` is new (configurable
--              filter fields). This adds all three.
-- Affected tables: map_engagement_events
-- Rollback: _20260713130000_map_engagement_filter_events.rollback.sql
-- Author: Cursor agent
-- Date: 2026-07-13
-- ============================================================
--
-- DRY-RUN BLOCK (run first — makes NO persistent changes):
--   BEGIN;
--   <paste THE MIGRATION body>
--   ROLLBACK;
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'map_engagement_events'
  ) then
    raise exception 'ABORT: table public.map_engagement_events does not exist';
  end if;
end $$;

-- Row count before (should be unchanged after — this is a constraint-only change)
select count(*) as engagement_rows_before from public.map_engagement_events;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

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
    'search'
  )
);


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'map_engagement_event_type'
    and conrelid = 'public.map_engagement_events'::regclass;

  if def is null then
    raise exception 'VERIFY FAILED: map_engagement_event_type constraint is missing';
  end if;
  if position('directory_custom_filter' in def) = 0
     or position('directory_group_filter' in def) = 0
     or position('directory_continent_filter' in def) = 0 then
    raise exception 'VERIFY FAILED: constraint does not include all three filter events';
  end if;
  raise notice 'VERIFY PASSED: constraint includes the filter events';
end $$;

select count(*) as engagement_rows_after from public.map_engagement_events;
-- Must equal engagement_rows_before.
