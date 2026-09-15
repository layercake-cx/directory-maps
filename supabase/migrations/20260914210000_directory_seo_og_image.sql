-- ============================================================
-- Migration: 20260914210000_directory_seo_og_image
-- Description: Directory Settings tab — General settings (title, already
--              `directories.name`, no schema change needed) + SEO settings.
--              seo_defaults_json (meta_title_template, meta_description,
--              default_noindex) already existed as data-layer-only columns
--              from 20260827120000 but were never surfaced in the UI or
--              consumed by generate_directory_site — this migration only
--              adds the one genuinely missing piece, a directory-level
--              social/SEO share image, so the Settings UI has everywhere it
--              needs to write. generate_directory_site/builders.ts/
--              middleware.js changes to actually consume seo_defaults_json
--              and this new column (title/description/noindex/og:image on
--              the landing page, plus a new per-directory robots.txt) are a
--              separate, non-DB part of this same change.
-- Affected tables: directories (1 new column)
-- Rollback: _20260914210000_directory_seo_og_image.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-14
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
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
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'seo_og_image_url') then
    raise exception 'ABORT: directories.seo_og_image_url already exists — migration may have already run';
  end if;
end $$;

-- Row count — inspect before proceeding
select 'directories' as tbl, count(*) as rows from public.directories;
-- Save this output. You will compare it to the post-migration count.


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.directories
  add column seo_og_image_url text null;

comment on column public.directories.seo_og_image_url is
  'Directory-level default social share image (og:image/twitter:image) for the directory landing page, and a fallback for entries without their own directory_entries.og_image_url (docs/DIRECTORIES.md §4.1). Null = no image.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'seo_og_image_url') then
    raise exception 'VERIFY FAILED: directories.seo_og_image_url was not created';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Row count — must be unchanged (additive only)
select 'directories' as tbl, count(*) as rows from public.directories;
