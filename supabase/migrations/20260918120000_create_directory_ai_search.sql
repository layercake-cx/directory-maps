-- ============================================================
-- Migration: 20260918120000_create_directory_ai_search
-- Description: Schema for directory-level AI intent-driven search — the
--              directory-entry successor to the removed map-level "Ask AI"
--              search feature (see
--              _20260821120000_create_ai_search_enrichment.rollback.sql and
--              docs/FEATURES.md §4.4d). Reinstates the same core idea (a
--              visitor's free-text query resolved by Claude, with every
--              returned id validated server-side against the real corpus
--              before it can surface anything), reshaped for directories:
--              one admin-authored prompt per directory (mirrors
--              directories.ai_content_prompt from
--              20260906120000_create_directory_ai_content_generation.sql),
--              plus a separate opt-in for letting Claude use a web-search
--              tool for outside context.
--
--              Adds:
--                - directories.ai_search_prompt (text, nullable) — admin
--                  search instructions. Null/blank = feature off for that
--                  directory; the published site's search box falls back to
--                  plain keyword matching and the directory_ai_search Edge
--                  Function never calls Claude for it.
--                - directories.ai_search_web_enabled (boolean, default
--                  false) — per-directory opt-in letting directory_ai_search
--                  attach Anthropic's server-side web-search tool. Meaningless
--                  while ai_search_prompt is blank.
--                - directory_ai_search_requests — a minimal request log used
--                  only to rate-limit the public directory_ai_search Edge
--                  Function per directory (count rows in the last minute).
--                  Not an analytics/engagement table — see AGENTS.md's
--                  "Directory AI search" event category for the admin-facing
--                  config-change events this feature fires instead.
--
--              RLS: directories already has working RLS via ai_content_prompt
--              for the two new directories columns — no policy change
--              needed there. directory_ai_search_requests is service-role
--              only (written and read exclusively by directory_ai_search,
--              which is itself a public/anonymous Edge Function — no
--              authenticated client ever reads or writes this table
--              directly), so RLS is enabled with no policies at all, the
--              same "deny by default, service role bypasses RLS anyway"
--              posture as other worker-only tables.
-- Affected tables: directories (2 new columns); new table
--                  directory_ai_search_requests
-- Rollback: _20260918120000_create_directory_ai_search.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-18
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
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'ai_search_prompt') then
    raise exception 'ABORT: directories.ai_search_prompt already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_ai_search_requests') then
    raise exception 'ABORT: public.directory_ai_search_requests already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
-- Save this output. directories/directory_entries row counts must be UNCHANGED after (additive only).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Per-directory search prompt + web-search opt-in
alter table public.directories
  add column ai_search_prompt text null,
  add column ai_search_web_enabled boolean not null default false;

comment on column public.directories.ai_search_prompt is
  'Admin-authored directory-specific instructions for the AI-driven visitor search box (directory_ai_search Edge Function). Null/blank = this directory has not opted into AI search; the published site''s search box silently stays on plain keyword substring matching.';
comment on column public.directories.ai_search_web_enabled is
  'Per-directory opt-in (default false) letting directory_ai_search attach Anthropic''s server-side web-search tool so Claude can pull outside context into its reasoning. Directory entries remain the sole source of what can ever be returned — this only affects reasoning, never adds candidate entries. Meaningless while ai_search_prompt is blank.';

-- 2) Minimal request log, used only to rate-limit the public Edge Function
create table public.directory_ai_search_requests (
  id           uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  occurred_at  timestamptz not null default now()
);

create index idx_directory_ai_search_requests_directory_time
  on public.directory_ai_search_requests(directory_id, occurred_at);

comment on table public.directory_ai_search_requests is
  'One row per real Claude call made by directory_ai_search (not per keystroke — only calls that actually reached Anthropic). Used solely to rate-limit that public, unauthenticated Edge Function per directory (count rows in the last minute); not an analytics/engagement table. No scheduled cleanup yet — row volume stays small at the rate-limit threshold this feature ships with; add a cron sweep if that changes.';

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.directory_ai_search_requests enable row level security;
-- No policies: this table is written and read exclusively by
-- directory_ai_search via the service-role client, which bypasses RLS.
-- No authenticated client (admin or client-portal) ever queries it directly.

grant select, insert on table public.directory_ai_search_requests to service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'ai_search_prompt') then
    raise exception 'VERIFY FAILED: directories.ai_search_prompt was not created';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'ai_search_web_enabled') then
    raise exception 'VERIFY FAILED: directories.ai_search_web_enabled was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_ai_search_requests') then
    raise exception 'VERIFY FAILED: directory_ai_search_requests was not created';
  end if;
  raise notice 'VERIFY PASSED: directory AI search schema created';
end $$;

-- Row counts — must be UNCHANGED (additive only)
select
  'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;

-- RLS enabled on the new table
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'directory_ai_search_requests';
-- Must show rowsecurity = true

-- Orphan check — must return 0
select count(*) as orphaned_requests
  from public.directory_ai_search_requests r
  where not exists (select 1 from public.directories d where d.id = r.directory_id);

-- Opt-in guard sanity check — every directory currently has web search off by default
select count(*) as directories_with_web_enabled_but_no_prompt
  from public.directories
  where ai_search_web_enabled = true and (ai_search_prompt is null or btrim(ai_search_prompt) = '');
-- Expected 0 immediately after migration (no directory has configured anything yet)
