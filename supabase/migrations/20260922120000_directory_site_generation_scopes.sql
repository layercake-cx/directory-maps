-- ============================================================
-- Migration: 20260922120000_directory_site_generation_scopes
-- Description: Records what the last public-page generation wrote, and
--              bumps an entry's updated_at when its extras change, so a
--              later publish can rewrite only the pages that changed.
-- Affected tables: directories, directory_entries (via trigger),
--                  entry_evidence_items, entry_media_assets,
--                  entry_accreditations, product_tiles, prominent_links,
--                  entry_category_terms
-- Rollback: _20260922120000_directory_site_generation_scopes.rollback.sql
-- Author: Cursor agent
-- Date: 2026-09-22
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directories'
  ) then
    raise exception 'ABORT: table public.directories does not exist';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'directories'
      and column_name = 'site_generation_manifest'
  ) then
    raise exception 'ABORT: column site_generation_manifest already exists — migration may have already run';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'entry_evidence_items'
  ) then
    raise exception 'ABORT: table public.entry_evidence_items does not exist';
  end if;
end $$;

-- CAPTURE PRE-STATE
select
  (select count(*) from public.directories) as directories,
  (select count(*) from public.directory_entries) as directory_entries;


-- ============================================================
-- THE MIGRATION
-- ============================================================

alter table public.directories
  add column site_generation_manifest jsonb null;

comment on column public.directories.site_generation_manifest is
  'Hashes and per-entry timestamps from the last successful public-page generation. Null until the first scoped publish. Derived — safe to discard; the next full publish rebuilds it.';

-- Child-row edits (evidence, media, tags, …) do not otherwise change
-- directory_entries.updated_at, so a scoped publish would miss them.
create or replace function public.touch_directory_entry_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id text;
  old_id text;
begin
  if tg_op = 'DELETE' then
    new_id := null;
    old_id := old.entry_id;
  else
    new_id := new.entry_id;
    if tg_op = 'UPDATE' then
      old_id := old.entry_id;
    else
      old_id := null;
    end if;
  end if;

  if new_id is not null then
    update public.directory_entries
      set updated_at = now()
      where id = new_id;
  end if;

  if old_id is not null and old_id is distinct from new_id then
    update public.directory_entries
      set updated_at = now()
      where id = old_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.touch_directory_entry_updated_at() is
  'AFTER INSERT/UPDATE/DELETE on entry extras. Sets directory_entries.updated_at so scoped publishing sees the entry as dirty. security definer so the timestamp lands even when the actor can edit the child row but the entry update would otherwise be a separate RLS check.';

revoke all on function public.touch_directory_entry_updated_at() from public, anon, authenticated;

drop trigger if exists trg_touch_entry_evidence_items on public.entry_evidence_items;
create trigger trg_touch_entry_evidence_items
  after insert or update or delete on public.entry_evidence_items
  for each row execute function public.touch_directory_entry_updated_at();

drop trigger if exists trg_touch_entry_media_assets on public.entry_media_assets;
create trigger trg_touch_entry_media_assets
  after insert or update or delete on public.entry_media_assets
  for each row execute function public.touch_directory_entry_updated_at();

drop trigger if exists trg_touch_entry_accreditations on public.entry_accreditations;
create trigger trg_touch_entry_accreditations
  after insert or update or delete on public.entry_accreditations
  for each row execute function public.touch_directory_entry_updated_at();

drop trigger if exists trg_touch_product_tiles on public.product_tiles;
create trigger trg_touch_product_tiles
  after insert or update or delete on public.product_tiles
  for each row execute function public.touch_directory_entry_updated_at();

drop trigger if exists trg_touch_prominent_links on public.prominent_links;
create trigger trg_touch_prominent_links
  after insert or update or delete on public.prominent_links
  for each row execute function public.touch_directory_entry_updated_at();

drop trigger if exists trg_touch_entry_category_terms on public.entry_category_terms;
create trigger trg_touch_entry_category_terms
  after insert or update or delete on public.entry_category_terms
  for each row execute function public.touch_directory_entry_updated_at();


-- ============================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'directories'
      and column_name = 'site_generation_manifest'
  ) then
    raise exception 'VERIFY FAILED: directories.site_generation_manifest was not created';
  end if;

  if exists (select 1 from public.directories where site_generation_manifest is not null) then
    raise exception 'VERIFY FAILED: site_generation_manifest should be null for every row immediately after this additive migration';
  end if;

  if not exists (
    select 1 from pg_proc
    where proname = 'touch_directory_entry_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'VERIFY FAILED: touch_directory_entry_updated_at was not created';
  end if;

  raise notice 'VERIFY PASSED: site generation manifest column and entry touch triggers created';
end $$;

select
  (select count(*) from public.directories) as directories,
  (select count(*) from public.directory_entries) as directory_entries;
-- Expected: both counts unchanged
