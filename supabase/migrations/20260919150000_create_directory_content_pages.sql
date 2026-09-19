-- ============================================================
-- Migration: 20260919150000_create_directory_content_pages
-- Description: Feature 6 of the Directory Searchability & AI Metadata plan
--              (docs/DEPLOYMENTS.md, 2026-09-19) — editor-built content
--              pages (an "About" page, "How to join", a sector guide)
--              alongside a directory's entry listings, organised into a
--              nav hierarchy via parent_page_id.
--
--              Adds one new table:
--                - directory_content_pages — id is `text` (client-generated
--                  crypto.randomUUID(), matching directory_entries'
--                  convention, not directory_groups' `uuid default
--                  gen_random_uuid()` one — pages are entry-like editable
--                  records, not simple lookup rows).
--                - parent_page_id is nav-hierarchy only, not URL nesting:
--                  published pages get a flat slug under the directory's
--                  own basePath (`${basePath}/${slug}.html`), same as
--                  entries, so no changes to middleware.js's routing are
--                  needed — deliberately, to avoid touching code that
--                  serves live traffic for maps and directories alike. On
--                  parent delete, children are promoted to top-level
--                  (`on delete set null`) rather than cascade-deleted —
--                  losing a page's nav position is a much smaller mistake
--                  to make than silently deleting a whole subtree of
--                  content an editor wrote.
--                - unique(directory_id, slug): a page's slug must be
--                  unique among this directory's OTHER pages. It does NOT
--                  by itself prevent colliding with an existing entry's
--                  slug (a separate table with its own uniqueness
--                  constraint) — that cross-table check is enforced in
--                  application code (src/lib/contentPages.js) when a page
--                  is created or its slug is changed, the same way
--                  directory_entries' own slug uniqueness is enforced by a
--                  DB constraint scoped to just that table. A collision is
--                  rare in practice (entries are typically bulk-imported
--                  first, pages added by hand afterward) and
--                  generate_directory_site's own upload step additionally
--                  refuses to overwrite a path an entry already claimed,
--                  as a last-resort guard.
-- Affected tables: new table directory_content_pages
-- Rollback: _20260919150000_create_directory_content_pages.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-19
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_content_pages') then
    raise exception 'ABORT: public.directory_content_pages already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select 'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
-- Save this output. Must be UNCHANGED after (additive only).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create table public.directory_content_pages (
  id               text primary key,
  directory_id     text not null references public.directories(id) on delete cascade,
  parent_page_id   text null references public.directory_content_pages(id) on delete set null,
  title            text not null,
  slug             text not null,
  position         integer not null default 0,
  body_html        text not null default '',
  meta_title       text null,
  meta_description text null,
  noindex          boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index directory_content_pages_directory_slug_key
  on public.directory_content_pages (directory_id, slug);

create index idx_directory_content_pages_directory_id on public.directory_content_pages(directory_id);
create index idx_directory_content_pages_parent_id on public.directory_content_pages(parent_page_id);

comment on table public.directory_content_pages is
  'Editor-built content pages alongside a directory''s entries (Directory Searchability & AI Metadata plan, Feature 6) — an "About" page, "How to join", a sector guide. parent_page_id drives the admin nav-tree UI and the published site''s page-to-page navigation only; published URLs are flat (same basePath as entries), not nested paths.';
comment on column public.directory_content_pages.parent_page_id is
  'Nav-hierarchy grouping only, not URL structure. Set null (page promoted to top-level) when its parent is deleted, rather than cascading the delete.';
comment on column public.directory_content_pages.position is
  'Sort order among sibling pages (same parent_page_id) in the admin nav-tree UI and the published site''s page navigation.';

-- ------------------------------------------------------------
-- RLS — mirrors directory_entries' own admin_all + own_client pattern
-- exactly (20260714120000_create_directories.sql). Manage-permission
-- (owner/manager vs member) is enforced in the UI layer, not RLS, same as
-- every other directory-scoped table.
-- ------------------------------------------------------------

alter table public.directory_content_pages enable row level security;

create policy "directory_content_pages_admin_all"
  on public.directory_content_pages for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "directory_content_pages_own_client"
  on public.directory_content_pages for all
  to authenticated
  using (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  )
  with check (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  );

grant select, insert, update, delete on table public.directory_content_pages to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_content_pages') then
    raise exception 'VERIFY FAILED: directory_content_pages was not created';
  end if;
  raise notice 'VERIFY PASSED: directory_content_pages created';
end $$;

-- Row counts — must be UNCHANGED (additive only)
select 'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;

-- RLS enabled
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'directory_content_pages';
-- Must show rowsecurity = true

-- Orphan check — must return 0
select count(*) as orphaned_pages
  from public.directory_content_pages p
  where not exists (select 1 from public.directories d where d.id = p.directory_id);
