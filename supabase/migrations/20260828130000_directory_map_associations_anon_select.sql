-- ============================================================
-- Migration: 20260828130000_directory_map_associations_anon_select
-- Description: directory_map_associations was created (20260827150000)
--              with only admin/own-client authenticated RLS policies —
--              missing an anon-select policy. EmbedMap.jsx's directory-check
--              (resolveDirectoryAssociation) uses a deliberately anon-only
--              Supabase client (see that file's own comment on why: the
--              embed must always hit PostgREST as anon, matching real-world
--              embed behaviour regardless of the viewer's login state).
--              Without this policy, that check always returns null for
--              anon, so a directory-sourced map's public embed silently
--              fell through to its own (now-empty, since the data lives in
--              the directory) listings — found live in production on the
--              real "UK Associations Sample Map" map.
--              Matches the existing (deliberately unconditional) anon
--              policy on maps/groups/listings — this is not a stricter or
--              looser posture than those, just the same one this table
--              should have had from the start.
-- Affected tables: directory_map_associations (new RLS policy + grant only)
-- Rollback: _20260828130000_directory_map_associations_anon_select.rollback.sql
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_map_associations') then
    raise exception 'ABORT: table public.directory_map_associations does not exist';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'directory_map_associations' and policyname = 'directory_map_associations_anon_select') then
    raise exception 'ABORT: directory_map_associations_anon_select already exists — migration may have already run';
  end if;
end $$;

select 'directory_map_associations' as tbl, count(*) as rows from public.directory_map_associations;
-- Save this output. Must be unchanged after (RLS/grant only, no data change).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create policy "directory_map_associations_anon_select"
  on public.directory_map_associations for select
  to anon
  using (true);

grant select on table public.directory_map_associations to anon;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'directory_map_associations' and policyname = 'directory_map_associations_anon_select') then
    raise exception 'VERIFY FAILED: directory_map_associations_anon_select policy was not created';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select 'directory_map_associations' as tbl, count(*) as rows from public.directory_map_associations;
