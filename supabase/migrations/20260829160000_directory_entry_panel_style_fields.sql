-- ============================================================
-- Migration: 20260829160000_directory_entry_panel_style_fields
-- Description: Adds panel_image_url and panel_background_color to
--              directory_entries, for the entry editor's Panel Style tab
--              (Phase 5). Lets an entry override the homepage card's logo
--              box image and background, e.g. a white logo needing a dark
--              background. Both nullable; falls back to logo_url and the
--              directory's own theme surface-alt color when unset.
-- Affected tables: directory_entries
-- Rollback: _20260829160000_directory_entry_panel_style_fields.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-29
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste "THE MIGRATION" section below>
--   ROLLBACK;
--
-- If no error appears, the dry run passed. Then apply for real.
-- ============================================================

-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directory_entries'
  ) then
    raise exception 'ABORT: table public.directory_entries does not exist';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'panel_image_url'
  ) then
    raise exception 'ABORT: column panel_image_url already exists — migration may have already run';
  end if;
end $$;

-- CAPTURE PRE-STATE — inspect before continuing
select count(*) as total_directory_entries from public.directory_entries;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.directory_entries
  add column if not exists panel_image_url text null,
  add column if not exists panel_background_color text null;

comment on column public.directory_entries.panel_image_url is 'Overrides the homepage card panel image; falls back to logo_url when null.';
comment on column public.directory_entries.panel_background_color is 'CSS colour for the homepage card panel background; falls back to the directory theme''s surface-alt colour when null.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'panel_background_color'
  ) then
    raise exception 'VERIFY FAILED: column panel_background_color was not created';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries'
      and column_name in ('panel_image_url','panel_background_color')
      and is_nullable = 'NO'
  ) then
    raise exception 'VERIFY FAILED: one of the new columns is NOT NULL, expected both nullable';
  end if;

  raise notice 'VERIFY PASSED: both columns exist and are nullable';
end $$;

-- Confirm row count is unchanged (no accidental data loss)
select count(*) as total_directory_entries_after from public.directory_entries;

-- ------------------------------------------------------------
-- INTEGRITY VERIFICATION CHECKLIST (run before AND after, on any environment)
-- ------------------------------------------------------------
-- select count(*) as total_directory_entries from public.directory_entries;
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'directory_entries';
-- -- Expected: rowsecurity = true
-- select count(*) as orphaned_entries from public.directory_entries e
--   where not exists (select 1 from public.directories d where d.id = e.directory_id);
-- -- Expected: 0
