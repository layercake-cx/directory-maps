-- ============================================================
-- Rollback: 20260920060000_directory_page_hierarchy_nav
-- Reverses: nav_label / show_in_navigation on directory_content_pages,
--           home_nav_label on directories, depth trigger, parent FK back
--           to ON DELETE SET NULL, page_id on directory_redirects (and
--           the page-path redirect trigger). Entry slug-redirect trigger
--           is restored to its pre-migration body (not SECURITY DEFINER,
--           no page_id clear).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_content_pages' and column_name = 'nav_label'
  ) then
    raise exception 'ABORT: directory_content_pages.nav_label does not exist — nothing to roll back';
  end if;
end $$;

-- Data-loss guards — nav labels / home labels / page redirects are discarded.
select id, directory_id, title, nav_label, show_in_navigation
  from public.directory_content_pages
 where nav_label is not null
 order by directory_id, position;

select id, name, home_nav_label from public.directories where home_nav_label is not null;

select id, directory_id, old_slug, page_id from public.directory_redirects where page_id is not null;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop trigger if exists trg_record_directory_content_page_redirect on public.directory_content_pages;
drop function if exists public.record_directory_content_page_redirect();
drop function if exists public.directory_content_page_path_at(text, text);

drop trigger if exists trg_directory_content_pages_enforce_depth on public.directory_content_pages;
drop function if exists public.directory_content_pages_enforce_depth();

-- Restore the entry redirect trigger to its 20260827120000 shape.
create or replace function public.record_directory_entry_slug_redirect()
returns trigger
language plpgsql
as $$
begin
  if old.slug is distinct from new.slug then
    insert into public.directory_redirects (directory_id, old_slug, entry_id)
    values (new.directory_id, old.slug, new.id)
    on conflict (directory_id, old_slug) do update set entry_id = excluded.entry_id, created_at = now();
  end if;
  return new;
end;
$$;

-- Page-target rows must go before page_id / the check constraint drop,
-- otherwise leftover page_id values fail the restored NOT NULL on entry_id.
delete from public.directory_redirects where page_id is not null;

alter table public.directory_redirects drop constraint if exists directory_redirects_target_chk;
drop index if exists idx_directory_redirects_page_id;
alter table public.directory_redirects drop column if exists page_id;
alter table public.directory_redirects alter column entry_id set not null;

alter table public.directory_content_pages
  drop constraint directory_content_pages_parent_page_id_fkey;

alter table public.directory_content_pages
  add constraint directory_content_pages_parent_page_id_fkey
  foreign key (parent_page_id) references public.directory_content_pages(id) on delete set null;

alter table public.directory_content_pages drop column if exists nav_label;
alter table public.directory_content_pages drop column if exists show_in_navigation;

alter table public.directories drop column if exists home_nav_label;

comment on table public.directory_content_pages is
  'Editor-built content pages alongside a directory''s entries (Directory Searchability & AI Metadata plan, Feature 6) — an "About" page, "How to join", a sector guide. parent_page_id drives the admin nav-tree UI and the published site''s page-to-page navigation only; published URLs are flat (same basePath as entries), not nested paths.';
comment on column public.directory_content_pages.parent_page_id is
  'Nav-hierarchy grouping only, not URL structure. Set null (page promoted to top-level) when its parent is deleted, rather than cascading the delete.';
comment on table public.directory_redirects is
  'Records an entry''s previous slug so its public URL keeps working after a rename (docs/DIRECTORIES.md §5.11). Populated automatically by trg_record_directory_entry_slug_redirect.';
comment on column public.directory_redirects.old_slug is null;
comment on column public.directory_redirects.entry_id is null;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_content_pages' and column_name = 'nav_label'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directory_content_pages.nav_label still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories' and column_name = 'home_nav_label'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directories.home_nav_label still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_redirects' and column_name = 'page_id'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directory_redirects.page_id still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select 'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_content_pages', count(*) from public.directory_content_pages union all
  select 'directory_redirects', count(*) from public.directory_redirects
order by tbl;
