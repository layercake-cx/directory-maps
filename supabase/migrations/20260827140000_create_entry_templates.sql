-- ============================================================
-- Migration: 20260827140000_create_entry_templates
-- Description: DIR-E6 — Entry page layout designer (docs/DIRECTORIES.md
--              §4.4). `entry_templates` holds the drag-and-drop block order
--              a directory's entry pages render in. Directory-scoped, not
--              client-scoped, matching directory_groups/entry_evidence_items.
--
--              Multiple templates are supported (decided 2026-07-14, §4.4,
--              not deferred): exactly one row per directory has
--              is_default = true; any other row may target a specific
--              directory_group_id OR category_term_id (never both) to
--              override the default for that slice of entries. Resolution
--              order (most specific first): term match > group match >
--              default — implemented in generate_directory_site, not here.
--
--              layout_json is an ordered array of block descriptors, e.g.
--              [{"type":"logo"},{"type":"heading","field":"name"},
--               {"type":"address_map"},
--               {"type":"contact_details","fields":["phone","email","website_url"]},
--               {"type":"notes_html"},
--               {"type":"categorisation","key":"sector"}]
--              — same jsonb-blob convention as theme_json/mapStyleSettings,
--              no new persistence pattern.
--
--              No anon-select policy: unlike directory_groups/category_terms
--              (read by the client-side entry editor), this table is only
--              ever read by an authenticated Owner/Manager (the designer UI)
--              or the service-role Edge Function at publish/generation time
--              — never by an anonymous visitor directly.
-- Affected tables: entry_templates (new)
-- Rollback: _20260827140000_create_entry_templates.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-27
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_groups') then
    raise exception 'ABORT: table public.directory_groups does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'category_terms') then
    raise exception 'ABORT: table public.category_terms does not exist';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_templates') then
    raise exception 'ABORT: table public.entry_templates already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create table public.entry_templates (
  id uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  applies_to_group_id text null references public.directory_groups(id) on delete set null,
  applies_to_term_id uuid null references public.category_terms(id) on delete set null,
  layout_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entry_templates_one_target check (
    not (applies_to_group_id is not null and applies_to_term_id is not null)
  )
);

create index idx_entry_templates_directory on public.entry_templates(directory_id);

-- Exactly one default template per directory.
create unique index entry_templates_one_default_per_directory
  on public.entry_templates (directory_id)
  where is_default;

-- "Only one template can target a given term" (DIR-E6-S4) — same rule
-- extended to group targeting for the same reason (resolution needs a
-- single unambiguous match per group too).
create unique index entry_templates_unique_term_target
  on public.entry_templates (directory_id, applies_to_term_id)
  where applies_to_term_id is not null;

create unique index entry_templates_unique_group_target
  on public.entry_templates (directory_id, applies_to_group_id)
  where applies_to_group_id is not null;

comment on table public.entry_templates is
  'DIR-E6 — drag-and-drop block order for a directory''s entry pages (docs/DIRECTORIES.md §4.4). One default per directory; other rows optionally target a group or category term to override it for that slice of entries.';
comment on column public.entry_templates.layout_json is
  'Ordered array of block descriptors, e.g. [{"type":"logo"},{"type":"heading","field":"name"},...]. Rendered by generate_directory_site; absence of any entry_templates row for a directory falls back to that function''s original fixed block order (zero behaviour change for directories that have never opened the designer).';

alter table public.entry_templates enable row level security;

create policy "entry_templates_admin_all"
  on public.entry_templates for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "entry_templates_own_client"
  on public.entry_templates for all
  to authenticated
  using (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  )
  with check (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  );

grant select, insert, update, delete on table public.entry_templates to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_templates') then
    raise exception 'VERIFY FAILED: entry_templates was not created';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'entry_templates_one_default_per_directory') then
    raise exception 'VERIFY FAILED: entry_templates_one_default_per_directory index was not created';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'entry_templates_unique_term_target') then
    raise exception 'VERIFY FAILED: entry_templates_unique_term_target index was not created';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'entry_templates' and policyname = 'entry_templates_own_client'
  ) then
    raise exception 'VERIFY FAILED: entry_templates_own_client policy was not created';
  end if;
  if (select count(*) from public.entry_templates) <> 0 then
    raise exception 'VERIFY FAILED: entry_templates should be empty immediately after creation';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select 'entry_templates' as tbl, count(*) as rows from public.entry_templates;
