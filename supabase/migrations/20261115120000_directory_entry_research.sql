-- ============================================================
-- Migration: 20261115120000_directory_entry_research
-- Description: Internal research notes for AI-generated listings. The AI
--              content pipeline now researches a supplier (website pages plus
--              independent sources) before writing. The structured findings,
--              including what could not be verified, are stored here for
--              admins and the client's own team. They are never published:
--              nothing in generate_directory_site reads this table, and it is
--              a separate table (not a directory_entries column) so the
--              anon-readable entry rows can never expose it.
-- Affected tables: new table public.directory_entry_research (additive only)
-- Rollback: _20261115120000_directory_entry_research.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-15
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run -> STAGING (beqejxneehilplrtpntn) -> verification ->
-- PRODUCTION (gxixwdjfmegxcxfeflro) only after explicit sign-off.
--
-- Forbidden operations: none (additive: one new table, RLS, grants).
--
-- PRE-MIGRATION INTEGRITY:
--   select count(*) from public.directory_entries;   -- record; must be unchanged after
--   select to_regclass('public.directory_entry_research');  -- must be null before
-- ============================================================

do $$
begin
  if to_regclass('public.directory_entry_research') is not null then
    raise exception 'ABORT: public.directory_entry_research already exists — migration may have already run';
  end if;
end $$;

-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create table public.directory_entry_research (
  entry_id      text primary key references public.directory_entries(id) on delete cascade,
  findings      jsonb not null,
  model         text null,
  researched_at timestamptz not null default now()
);

comment on table public.directory_entry_research is
  'Latest structured research findings behind an entry''s AI-written listing: sourced facts, distinctive details, and what could not be verified. Internal only; never published. One row per entry, replaced on each successful generation. Written by service-role Edge Functions.';

alter table public.directory_entry_research enable row level security;

create policy "directory_entry_research_admin_all"
  on public.directory_entry_research for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

-- Own-client users can read their notes; only service-role functions write them.
create policy "directory_entry_research_own_client_select"
  on public.directory_entry_research for select
  to authenticated
  using (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  );

grant select on table public.directory_entry_research to authenticated;
grant select, insert, update, delete on table public.directory_entry_research to service_role;

-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'directory_entry_research';
--   -- must show rowsecurity = true
-- select count(*) from public.directory_entries;   -- must equal the pre-migration count
-- select count(*) from public.directory_entry_research;   -- 0
