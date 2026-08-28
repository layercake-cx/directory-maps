-- ============================================================
-- Migration: 20260828120000_directory_site_generation_status
-- Description: Persistent status for generate_directory_site runs, so the
--              Publish panel can show "generating…" / "last generated at
--              X" / "generation failed: Y" regardless of whether the
--              browser tab that triggered it is still open — today the only
--              feedback is an ephemeral client-side message tied to
--              DirectoryPublishPanel.jsx's own component lifetime
--              (triggerDirectorySiteRegeneration is fire-and-forget), which
--              is exactly what made a real production failure (a transient
--              Vercel Blob 503) invisible until manually investigated this
--              session.
-- Affected tables: directories (4 new columns, additive only)
-- Rollback: _20260828120000_directory_site_generation_status.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-28
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
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
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'site_generation_status') then
    raise exception 'ABORT: directories.site_generation_status already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select 'directories' as tbl, count(*) as rows from public.directories;
-- Save this output. Must be unchanged after (additive only).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.directories
  add column site_generation_status text null check (site_generation_status is null or site_generation_status in ('running', 'succeeded', 'failed')),
  add column site_generation_started_at timestamptz null,
  add column site_generated_at timestamptz null,
  add column site_generation_error text null;

comment on column public.directories.site_generation_status is
  'Status of the most recent generate_directory_site run for this directory. Null = never run. Set by the Edge Function itself (service role), not by any client RPC.';
comment on column public.directories.site_generated_at is
  'When generate_directory_site last completed successfully for this directory (i.e. when the live public site was last actually updated) — distinct from directories.published_at, which is when publish_directory (the DB-only step) last ran.';
comment on column public.directories.site_generation_error is
  'Error message from the most recent failed run, if site_generation_status = ''failed''. Cleared on the next successful run.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'site_generation_status') then
    raise exception 'VERIFY FAILED: directories.site_generation_status was not created';
  end if;
  if exists (select 1 from public.directories where site_generation_status is not null) then
    raise exception 'VERIFY FAILED: site_generation_status should be null for every row immediately after this additive migration';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Row counts — must be UNCHANGED (additive only)
select 'directories' as tbl, count(*) as rows from public.directories;
