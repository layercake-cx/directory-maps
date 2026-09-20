-- ============================================================
-- Migration: 20260920060000_directory_page_hierarchy_nav
-- Description: Directory content pages become a two-level site: nav_label /
--              show_in_navigation on pages, configurable home_nav_label on
--              directories, max depth of one child level, parent delete is
--              restricted (admin must promote / reparent / delete children
--              first), and directory_redirects records content-page path
--              changes (including nested parent/child URLs) the same way it
--              already records entry slug renames.
-- Affected tables: directory_content_pages, directories, directory_redirects
-- Rollback: _20260920060000_directory_page_hierarchy_nav.rollback.sql
-- Author: Cursor Grok
-- Date: 2026-09-20
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste migration body here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_content_pages') then
    raise exception 'ABORT: table public.directory_content_pages does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_redirects') then
    raise exception 'ABORT: table public.directory_redirects does not exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_content_pages' and column_name = 'nav_label'
  ) then
    raise exception 'ABORT: directory_content_pages.nav_label already exists — migration may have already run';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories' and column_name = 'home_nav_label'
  ) then
    raise exception 'ABORT: directories.home_nav_label already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding. Must be UNCHANGED after (additive
-- columns + constraint/trigger changes; the flatten step may rewrite
-- parent_page_id on illegally deep rows but must not insert or delete).
select 'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_content_pages', count(*) from public.directory_content_pages union all
  select 'directory_redirects', count(*) from public.directory_redirects
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Flatten any existing third-or-deeper nesting before the depth trigger
--    is installed. Walk each child whose parent itself has a parent up to
--    the top-level ancestor, repeating until the tree is at most two levels
--    beneath the directory home. No rows are deleted.
do $$
declare
  n int;
begin
  loop
    update public.directory_content_pages child
       set parent_page_id = parent.parent_page_id
      from public.directory_content_pages parent
     where child.parent_page_id = parent.id
       and parent.parent_page_id is not null;
    get diagnostics n = row_count;
    exit when n = 0;
  end loop;
end $$;

alter table public.directory_content_pages
  add column nav_label text null;

alter table public.directory_content_pages
  add column show_in_navigation boolean not null default true;

comment on column public.directory_content_pages.nav_label is
  'Optional shorter label for header/footer navigation. Null/blank uses title.';
comment on column public.directory_content_pages.show_in_navigation is
  'When false, a published page stays at its URL (and may appear in breadcrumbs) but is omitted from header, mobile, and footer navigation.';
comment on column public.directory_content_pages.parent_page_id is
  'Parent in the two-level page hierarchy (null = top-level, directly under the directory home). Drives published URLs, header/footer nav, and breadcrumbs. A page with children cannot itself have a parent.';
comment on column public.directory_content_pages.position is
  'Sort order among sibling pages (same parent_page_id), maintained by the Pages tab drag-and-drop UI — not edited as a raw number.';

comment on table public.directory_content_pages is
  'Editor-built content pages alongside a directory''s entries. Hierarchy is at most two levels beneath the directory home; published URLs nest as /:parentSlug/:childSlug. parent_page_id ON DELETE RESTRICT — children must be promoted, reparented, or deleted before the parent can be removed.';

-- Parent delete: was ON DELETE SET NULL (silent promote). Restrict so the
-- admin UI can require an explicit choice.
alter table public.directory_content_pages
  drop constraint directory_content_pages_parent_page_id_fkey;

alter table public.directory_content_pages
  add constraint directory_content_pages_parent_page_id_fkey
  foreign key (parent_page_id) references public.directory_content_pages(id) on delete restrict;

create or replace function public.directory_content_pages_enforce_depth()
returns trigger
language plpgsql
as $$
declare
  parent_parent text;
begin
  if new.parent_page_id is null then
    return new;
  end if;
  if new.parent_page_id = new.id then
    raise exception 'A page cannot be its own parent';
  end if;
  select parent_page_id into parent_parent
    from public.directory_content_pages
   where id = new.parent_page_id;
  if parent_parent is not null then
    raise exception 'Pages can only nest one level beneath the directory home';
  end if;
  if exists (select 1 from public.directory_content_pages where parent_page_id = new.id) then
    raise exception 'A page with children cannot become a child page';
  end if;
  return new;
end;
$$;

comment on function public.directory_content_pages_enforce_depth() is
  'BEFORE INSERT/UPDATE: parent must be a top-level page, and a page that already has children cannot itself become a child.';

drop trigger if exists trg_directory_content_pages_enforce_depth on public.directory_content_pages;
create trigger trg_directory_content_pages_enforce_depth
  before insert or update of parent_page_id
  on public.directory_content_pages
  for each row
  execute function public.directory_content_pages_enforce_depth();


-- 2) Configurable label for the directory-home item in generated navigation.
alter table public.directories
  add column home_nav_label text null;

comment on column public.directories.home_nav_label is
  'Label for the directory landing page in header/mobile/breadcrumb/footer navigation. Null/blank defaults to Home.';


-- 3) directory_redirects also records content-page path changes. old_slug
--    is the previous path relative to the directory root (a single slug, or
--    parentSlug/childSlug). Exactly one of entry_id / page_id is set.
alter table public.directory_redirects
  alter column entry_id drop not null;

alter table public.directory_redirects
  add column page_id text null references public.directory_content_pages(id) on delete cascade;

alter table public.directory_redirects
  add constraint directory_redirects_target_chk
  check (
    (entry_id is not null and page_id is null)
    or (entry_id is null and page_id is not null)
  );

create index idx_directory_redirects_page_id on public.directory_redirects(page_id);

comment on table public.directory_redirects is
  'Records a previous public path (old_slug, relative to the directory root) so renamed entries and content pages keep working. Populated by slug/parent-change triggers; generate_directory_site writes the live mapping to redirects.json.';
comment on column public.directory_redirects.old_slug is
  'Previous path relative to the directory root — an entry or top-level page slug, or parentSlug/childSlug after nested page URLs.';
comment on column public.directory_redirects.page_id is
  'Content page this old path should resolve to. Null when the redirect is for an entry (entry_id set).';
comment on column public.directory_redirects.entry_id is
  'Entry this old path should resolve to. Null when the redirect is for a content page (page_id set).';

-- SECURITY DEFINER so an authenticated editor's page/entry update can write
-- the redirect row (authenticated has no INSERT grant on this table).
create or replace function public.directory_content_page_path_at(p_parent_id text, p_slug text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parent_slug text;
begin
  if p_parent_id is null then
    return p_slug;
  end if;
  select slug into parent_slug from public.directory_content_pages where id = p_parent_id;
  if parent_slug is null then
    return p_slug;
  end if;
  return parent_slug || '/' || p_slug;
end;
$$;

create or replace function public.record_directory_content_page_redirect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_path text;
  child record;
begin
  if old.parent_page_id is not null then
    -- Parent row is not changing in this statement; current parent slug is
    -- the slug the old URL used.
    old_path := public.directory_content_page_path_at(old.parent_page_id, old.slug);
  else
    old_path := old.slug;
  end if;

  if (old.slug is distinct from new.slug) or (old.parent_page_id is distinct from new.parent_page_id) then
    insert into public.directory_redirects (directory_id, old_slug, page_id)
    values (new.directory_id, old_path, new.id)
    on conflict (directory_id, old_slug) do update
      set page_id = excluded.page_id, entry_id = null, created_at = now();
  end if;

  -- A top-level page's slug is a prefix of every child's public path.
  if old.parent_page_id is null and (old.slug is distinct from new.slug) then
    for child in
      select id, slug from public.directory_content_pages
       where parent_page_id = new.id and directory_id = new.directory_id
    loop
      insert into public.directory_redirects (directory_id, old_slug, page_id)
      values (new.directory_id, old.slug || '/' || child.slug, child.id)
      on conflict (directory_id, old_slug) do update
        set page_id = excluded.page_id, entry_id = null, created_at = now();
    end loop;
  end if;

  return new;
end;
$$;

comment on function public.record_directory_content_page_redirect() is
  'AFTER UPDATE on directory_content_pages. Records the previous public path when slug or parent_page_id changes, and records each child''s previous nested path when a top-level parent slug changes.';

drop trigger if exists trg_record_directory_content_page_redirect on public.directory_content_pages;
create trigger trg_record_directory_content_page_redirect
  after update of slug, parent_page_id
  on public.directory_content_pages
  for each row
  execute function public.record_directory_content_page_redirect();

-- Entry trigger: also clear page_id on conflict so a reused slug cannot
-- keep pointing at a page (or vice versa). SECURITY DEFINER matches the
-- page trigger so authenticated slug edits can write the row.
create or replace function public.record_directory_entry_slug_redirect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.slug is distinct from new.slug then
    insert into public.directory_redirects (directory_id, old_slug, entry_id)
    values (new.directory_id, old.slug, new.id)
    on conflict (directory_id, old_slug) do update
      set entry_id = excluded.entry_id, page_id = null, created_at = now();
  end if;
  return new;
end;
$$;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_content_pages' and column_name = 'nav_label'
  ) then
    raise exception 'VERIFY FAILED: directory_content_pages.nav_label was not created';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_content_pages' and column_name = 'show_in_navigation'
  ) then
    raise exception 'VERIFY FAILED: directory_content_pages.show_in_navigation was not created';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories' and column_name = 'home_nav_label'
  ) then
    raise exception 'VERIFY FAILED: directories.home_nav_label was not created';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_redirects' and column_name = 'page_id'
  ) then
    raise exception 'VERIFY FAILED: directory_redirects.page_id was not created';
  end if;
  if exists (
    select 1
      from public.directory_content_pages child
      join public.directory_content_pages parent on parent.id = child.parent_page_id
     where parent.parent_page_id is not null
  ) then
    raise exception 'VERIFY FAILED: pages still nest more than two levels beneath the directory home';
  end if;
  raise notice 'VERIFY PASSED: page hierarchy nav columns, depth trigger, and page redirects are in place';
end $$;

-- Row counts — must be UNCHANGED
select 'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_content_pages', count(*) from public.directory_content_pages union all
  select 'directory_redirects', count(*) from public.directory_redirects
order by tbl;

-- RLS still enabled
select tablename, rowsecurity from pg_tables
 where schemaname = 'public'
   and tablename in ('directory_content_pages', 'directory_redirects', 'directories');
