-- ============================================================
-- Migration: 20260919120000_directory_entry_seo_metadata_ai_flag
-- Description: Phase 3 of the Directory Searchability & AI Metadata plan
--              (docs/DEPLOYMENTS.md, 2026-09-19) — non-destructive AI
--              backfill of entry SEO metadata on every build
--              (generate_directory_site). This one column answers the
--              product doc's own open question ("should AI-generated fields
--              carry a visible flag?") for the backfill path specifically:
--              set only when generate_directory_site itself fills a
--              previously-empty field, left null for anything an editor
--              wrote (directly, or via the Phase 2 "Generate with AI"
--              button, which is an explicit editor action followed by their
--              own Save click — a different provenance to an unattended
--              on-build fill). Purely additive; no existing column changes.
-- Affected tables: directory_entries (1 new column)
-- Rollback: _20260919120000_directory_entry_seo_metadata_ai_flag.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-19
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_entries') then
    raise exception 'ABORT: table public.directory_entries does not exist';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'seo_metadata_ai_generated_at') then
    raise exception 'ABORT: directory_entries.seo_metadata_ai_generated_at already exists — migration may have already run';
  end if;
end $$;

-- Row count — inspect before proceeding
select 'directory_entries' as tbl, count(*) as rows from public.directory_entries;
-- Save this output. You will compare it to the post-migration count.


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.directory_entries
  add column seo_metadata_ai_generated_at timestamptz null;

comment on column public.directory_entries.seo_metadata_ai_generated_at is
  'Set only by generate_directory_site''s on-build SEO metadata backfill (Directory Searchability & AI Metadata plan, Phase 3) when it fills a previously-empty meta_title/meta_description/keywords/og_title/og_description/ai_summary field. Null for anything an editor wrote directly or via the "Generate with AI" button + Save. Not touched by any other write path.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'seo_metadata_ai_generated_at') then
    raise exception 'VERIFY FAILED: directory_entries.seo_metadata_ai_generated_at was not created';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Row count — must be unchanged (additive only)
select 'directory_entries' as tbl, count(*) as rows from public.directory_entries;
