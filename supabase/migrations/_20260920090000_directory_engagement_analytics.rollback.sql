-- ============================================================
-- Rollback: 20260920090000_directory_engagement_analytics
-- Restores map_engagement_events to map-only (NOT NULL map_id, listings FK,
-- original event types / surface / RLS) and drops directories.analytics_json.
-- Directory-only event rows (map_id is null) are deleted so map_id can be
-- NOT NULL again. listing_id values that are not listings ids are nulled
-- before the FK is restored.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'map_engagement_events' and column_name = 'directory_id'
  ) then
    raise notice 'directory_id already absent — rollback may have already run';
  end if;
end $$;

select 'map_engagement_events' as tbl, count(*) as rows from public.map_engagement_events
union all
select 'directories', count(*) from public.directories
order by tbl;

-- Rows this feature introduced cannot satisfy the restored CHECKs / NOT NULL.
delete from public.map_engagement_events
 where map_id is null
    or surface = 'directory_site'
    or event_type in (
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
    );

update public.map_engagement_events e
   set listing_id = null
 where e.listing_id is not null
   and not exists (select 1 from public.listings l where l.id = e.listing_id);

drop policy if exists "map_engagement_anon_insert" on public.map_engagement_events;
create policy "map_engagement_anon_insert"
  on public.map_engagement_events for insert
  to anon
  with check (
    exists (
      select 1 from public.maps m
      where m.id = map_engagement_events.map_id
        and m.published_at is not null
    )
    and (
      map_engagement_events.listing_id is null
      or exists (
        select 1 from public.listings l
        where l.id = map_engagement_events.listing_id
          and l.map_id = map_engagement_events.map_id
      )
    )
  );

drop policy if exists "map_engagement_authenticated_select" on public.map_engagement_events;
create policy "map_engagement_authenticated_select"
  on public.map_engagement_events for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.maps m
      join public.contacts c on c.client_id = m.client_id and c.user_id = auth.uid()
      where m.id = map_engagement_events.map_id
        and (
          c.role in ('owner', 'manager')
          or exists (
            select 1 from public.contact_map_permissions cmp
            where cmp.contact_id = c.id and cmp.map_id = m.id
          )
        )
    )
  );

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

alter table public.map_engagement_events drop constraint if exists map_engagement_surface;
alter table public.map_engagement_events add constraint map_engagement_surface check (
  surface in ('embed', 'client_preview', 'admin_preview')
);

alter table public.map_engagement_events drop constraint if exists map_engagement_map_or_directory;
drop index if exists public.idx_map_engagement_directory_time;

alter table public.map_engagement_events drop column if exists directory_id;

alter table public.map_engagement_events
  alter column map_id set not null;

alter table public.map_engagement_events
  add constraint map_engagement_events_listing_id_fkey
  foreign key (listing_id) references public.listings(id) on delete set null;

comment on table public.map_engagement_events is
  'Public map engagement (embed): panel opens, outbound links, contact form. Inserts allowed for published maps only.';

alter table public.directories drop constraint if exists directories_analytics_json_object;
alter table public.directories drop column if exists analytics_json;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'map_engagement_events' and column_name = 'directory_id'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directory_id still present';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories' and column_name = 'analytics_json'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: analytics_json still present';
  end if;
end $$;

select 'map_engagement_events' as tbl, count(*) as rows from public.map_engagement_events
union all
select 'directories', count(*) from public.directories
order by tbl;
