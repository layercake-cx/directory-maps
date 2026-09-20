-- ============================================================
-- Migration: 20260919160000_create_directory_theme_presets
-- Description: Phase 5 of the Directory Theming plan (docs/DEPLOYMENTS.md,
--              2026-09-19) — org-scoped, saveable/reusable branding
--              presets. Until now DirectoryBrandingPanel.jsx's 5 presets
--              (Natural/Midnight/Coastal/Heritage/Slate) were hardcoded in
--              src/lib/directoryThemePresets.js; this adds a real table so
--              a client can save their own preset from one directory and
--              apply it to another. Applying a preset COPIES its
--              theme_json into the target directory (a snapshot, per the
--              dev spec's explicit §7 rule) — it never live-links, so
--              editing a saved preset later does not retroactively change
--              any directory that already applied it.
--
--              Scoped by client_id directly (org-level), not via a join
--              through directories — a preset belongs to the organisation,
--              not to any one directory.
-- Affected tables: new table directory_theme_presets
-- Rollback: _20260919160000_create_directory_theme_presets.rollback.sql
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clients') then
    raise exception 'ABORT: table public.clients does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_theme_presets') then
    raise exception 'ABORT: public.directory_theme_presets already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select 'clients' as tbl, count(*) as rows from public.clients union all
  select 'directories', count(*) from public.directories
order by tbl;
-- Save this output. Must be UNCHANGED after (additive only).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create table public.directory_theme_presets (
  id          text primary key,
  client_id   text not null references public.clients(id) on delete cascade,
  name        text not null,
  theme_json  jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_directory_theme_presets_client_id on public.directory_theme_presets(client_id);

comment on table public.directory_theme_presets is
  'Org-scoped, saveable/reusable directory branding presets (Directory Theming plan, Phase 5). theme_json is the same shape as directories.theme_json. Applying a preset to a directory copies theme_json as a snapshot — never live-linked (dev spec §7).';

-- ------------------------------------------------------------
-- RLS — mirrors directory_content_pages' admin_all + own_client pattern
-- (20260919150000_create_directory_content_pages.sql) but compares
-- client_id directly rather than joining through directories, since a
-- preset is org-level, not directory-level. Manage-permission (owner/
-- manager vs member) is enforced in the UI layer, same as every other
-- directory-scoped table.
-- ------------------------------------------------------------

alter table public.directory_theme_presets enable row level security;

create policy "directory_theme_presets_admin_all"
  on public.directory_theme_presets for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "directory_theme_presets_own_client"
  on public.directory_theme_presets for all
  to authenticated
  using (
    client_id = public.current_user_client_id()
  )
  with check (
    client_id = public.current_user_client_id()
  );

grant select, insert, update, delete on table public.directory_theme_presets to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_theme_presets') then
    raise exception 'VERIFY FAILED: directory_theme_presets was not created';
  end if;
  raise notice 'VERIFY PASSED: directory_theme_presets created';
end $$;

-- Row counts — must be UNCHANGED (additive only)
select 'clients' as tbl, count(*) as rows from public.clients union all
  select 'directories', count(*) from public.directories
order by tbl;

-- RLS enabled
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'directory_theme_presets';
-- Must show rowsecurity = true

-- Orphan check — must return 0
select count(*) as orphaned_presets
  from public.directory_theme_presets p
  where not exists (select 1 from public.clients c where c.id = p.client_id);
