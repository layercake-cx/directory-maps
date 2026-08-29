-- ============================================================
-- Migration: 20260829150000_directory_entry_seo_social_ai_fields
-- Description: Adds Open Graph / Twitter card / canonical URL / keywords /
--              AI-summary fields to directory_entries, for the entry
--              editor's Search & Metadata tab (Phase 4). All nullable,
--              additive only. Complements the existing meta_title/
--              meta_description/noindex/structured_data_type/
--              sitemap_priority columns (20260827120000).
-- Affected tables: directory_entries
-- Rollback: _20260829150000_directory_entry_seo_social_ai_fields.rollback.sql
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
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'og_title'
  ) then
    raise exception 'ABORT: column og_title already exists — migration may have already run';
  end if;
end $$;

-- CAPTURE PRE-STATE — inspect before continuing
select count(*) as total_directory_entries from public.directory_entries;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.directory_entries
  add column if not exists og_title text null,
  add column if not exists og_description text null,
  add column if not exists og_image_url text null,
  add column if not exists twitter_card_type text null,
  add column if not exists canonical_url text null,
  add column if not exists keywords text null,
  add column if not exists ai_summary text null;

alter table public.directory_entries
  add constraint directory_entries_twitter_card_type_check
  check (twitter_card_type is null or twitter_card_type in ('summary', 'summary_large_image'));

comment on column public.directory_entries.og_title is 'Open Graph title override; falls back to meta_title/name when null.';
comment on column public.directory_entries.og_description is 'Open Graph description override; falls back to meta_description when null.';
comment on column public.directory_entries.og_image_url is 'Open Graph share image; falls back to logo_url when null.';
comment on column public.directory_entries.twitter_card_type is 'Twitter card type (summary or summary_large_image); null = no explicit card.';
comment on column public.directory_entries.canonical_url is 'Canonical URL override for this entry page; null = use the generated entry page URL.';
comment on column public.directory_entries.keywords is 'Freeform, comma-separated meta keywords / search-relevant terms.';
comment on column public.directory_entries.ai_summary is 'Plain-language summary intended for AI/LLM consumption, distinct from the human-facing meta_description.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'ai_summary'
  ) then
    raise exception 'VERIFY FAILED: column ai_summary was not created';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries'
      and column_name in ('og_title','og_description','og_image_url','twitter_card_type','canonical_url','keywords','ai_summary')
      and is_nullable = 'NO'
  ) then
    raise exception 'VERIFY FAILED: one of the new columns is NOT NULL, expected all nullable';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'directory_entries_twitter_card_type_check'
  ) then
    raise exception 'VERIFY FAILED: twitter_card_type check constraint missing';
  end if;

  raise notice 'VERIFY PASSED: all seven columns exist, nullable, twitter_card_type check in place';
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
