-- ============================================================
-- Migration: 20260906120000_create_directory_ai_content_generation
-- Description: Schema for directory-level AI content generation — the
--              directory-entry successor to the removed map-level "AI
--              search enrichment" feature (see
--              _20260821120000_create_ai_search_enrichment.rollback.sql
--              and docs/FEATURES.md §4.4d). Same core idea (admin prompt
--              -> Claude writes something per-row), reshaped: one prompt
--              per directory (directories.ai_content_prompt), and the
--              output writes straight into the entry's real page content
--              (directory_entries.notes_html) instead of a separate
--              research blob.
--
--              Adds:
--                - directories.ai_content_prompt (text, nullable) — admin
--                  prompt. Null/blank = feature off for that directory, no
--                  jobs are ever enqueued.
--                - directories.ai_content_generation_status/_started_at/
--                  _generated_at/_error/_total/_processed — persistent
--                  status for a directory-wide bulk regenerate run, same
--                  shape as the existing site_generation_* columns added
--                  by 20260828120000_directory_site_generation_status.sql
--                  for the (unrelated) publish-site pipeline.
--                - directory_entries.ai_content_generated_at — set
--                  whenever AI last wrote the current notes_html; cleared
--                  on a manual save so it's a true "still AI, never
--                  hand-edited" signal.
--                - entry_content_jobs — async work queue, mirrors
--                  listing_enrichment_jobs. An AFTER INSERT trigger on
--                  directory_entries (enqueue_entry_content_job()) enqueues
--                  an 'auto' job only when the new entry's notes_html is
--                  empty AND its directory has a non-blank
--                  ai_content_prompt — this is the token-saving rule: never
--                  auto-run over content that already exists. A directory-
--                  wide "regenerate all" enqueues 'bulk' jobs instead (via
--                  enqueue_directory_entry_content_jobs(), added in the
--                  follow-up worker-cron migration) — those DO target every
--                  entry, including ones with existing content, since that
--                  bulk action is an explicit, type-to-confirm admin
--                  request, not a silent background job. A single-entry
--                  manual "Generate with AI" click bypasses this queue
--                  entirely (synchronous Edge Function call) since a human
--                  is waiting on just that one entry.
--                - directory_entry_versions — general-purpose body-content
--                  history. Every save to notes_html (manual or AI, single
--                  or bulk) gets a row here, written by application code
--                  right after the write succeeds (mirrors the existing
--                  recordEvent-style "app records its own audit trail"
--                  convention, not a DB trigger) — this is NOT scoped to
--                  just AI writes, so a bulk regenerate is always
--                  recoverable.
--
--              RLS: entry_content_jobs mirrors listing_enrichment_jobs
--              (admin-only — read/written by service-role Edge Functions,
--              not queried directly from the client). directory_entry_versions
--              is different: the client portal's own version-history UI
--              reads it directly, so it gets the same admin+own-client
--              pattern as directory_entries itself, not admin-only.
-- Affected tables: directories (7 new columns), directory_entries (1 new
--                  column, 1 new trigger); new tables entry_content_jobs,
--                  directory_entry_versions
-- Rollback: _20260906120000_create_directory_ai_content_generation.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-06
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_entries') then
    raise exception 'ABORT: table public.directory_entries does not exist';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'ai_content_prompt') then
    raise exception 'ABORT: directories.ai_content_prompt already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_content_jobs') then
    raise exception 'ABORT: public.entry_content_jobs already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_entry_versions') then
    raise exception 'ABORT: public.directory_entry_versions already exists — migration may have already run';
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

-- 1) Per-directory content-generation prompt + bulk-run status
alter table public.directories
  add column ai_content_prompt text null,
  add column ai_content_generation_status text null check (ai_content_generation_status is null or ai_content_generation_status in ('running', 'succeeded', 'failed')),
  add column ai_content_generation_started_at timestamptz null,
  add column ai_content_generated_at timestamptz null,
  add column ai_content_generation_error text null,
  add column ai_content_generation_total integer null,
  add column ai_content_generation_processed integer null;

comment on column public.directories.ai_content_prompt is
  'Admin-authored free text describing the page content Claude should write per entry. Null/blank = this directory has not opted into AI content generation; no jobs are enqueued for its entries.';
comment on column public.directories.ai_content_generation_status is
  'Status of the most recent directory-wide "regenerate all" bulk run. Null = never run. Set by process_entry_content_jobs (service role) as its queue for this directory drains, not by any client RPC.';
comment on column public.directories.ai_content_generation_total is
  'Number of entries queued in the most recent bulk run, for a processed/total progress readout while ai_content_generation_status = ''running''.';

-- 2) Per-entry "was this AI-written" marker
alter table public.directory_entries
  add column ai_content_generated_at timestamptz null;

comment on column public.directory_entries.ai_content_generated_at is
  'When AI last wrote this entry''s current notes_html. Cleared on a manual save (see updateDirectoryEntry) so it stays a true "still AI, never hand-edited since" signal — not a generation history (see directory_entry_versions for that).';

-- 3) Async work queue for auto/bulk content generation (mirrors listing_enrichment_jobs)
create table public.entry_content_jobs (
  id            uuid primary key default gen_random_uuid(),
  entry_id      text not null references public.directory_entries(id) on delete cascade,
  directory_id  text not null references public.directories(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'processing', 'completed', 'failed')),
  requested_by  text not null check (requested_by in ('auto', 'bulk')),
  attempt_count integer not null default 0,
  error         text null,
  created_at    timestamptz not null default now(),
  started_at    timestamptz null,
  completed_at  timestamptz null
);

create index idx_entry_content_jobs_status on public.entry_content_jobs(status);
create index idx_entry_content_jobs_entry_id on public.entry_content_jobs(entry_id);
create index idx_entry_content_jobs_directory_id on public.entry_content_jobs(directory_id);
-- Prevents a duplicate job being queued for an entry that already has one in flight.
create unique index idx_entry_content_jobs_entry_inflight
  on public.entry_content_jobs(entry_id)
  where status in ('pending', 'processing');

comment on table public.entry_content_jobs is
  'Async work queue for directory AI content generation (auto-on-empty-insert and directory-wide bulk regenerate). A scheduled worker polls status = ''pending'' in small batches, calls Claude, and writes results to directory_entries.notes_html. A single-entry manual "Generate with AI" click bypasses this queue (synchronous Edge Function call).';

-- 4) Body-content version history (general-purpose, not AI-only)
create table public.directory_entry_versions (
  id             uuid primary key default gen_random_uuid(),
  entry_id       text not null references public.directory_entries(id) on delete cascade,
  notes_html     text null,
  source         text not null check (source in ('manual', 'ai_manual', 'ai_auto', 'ai_bulk')),
  actor_user_id  uuid null references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index idx_directory_entry_versions_entry_id on public.directory_entry_versions(entry_id, created_at desc);

comment on table public.directory_entry_versions is
  'Append-only history of directory_entries.notes_html. One row per save — manual (source=''manual'') or AI-written (''ai_manual''/''ai_auto''/''ai_bulk''). Written by application code immediately after each successful save, never by a DB trigger. "Restore" loads an old version''s content back into the editor for review; it never rewrites or deletes history.';

-- 5) Trigger: enqueue an 'auto' content job on new entry, only when the entry
-- has no content yet AND its directory has opted in.
create or replace function public.enqueue_entry_content_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.notes_html is null or btrim(new.notes_html) = '') and exists (
    select 1 from public.directories
    where id = new.directory_id and ai_content_prompt is not null and btrim(ai_content_prompt) <> ''
  ) then
    insert into public.entry_content_jobs (entry_id, directory_id, status, requested_by)
    values (new.id, new.directory_id, 'pending', 'auto');
  end if;
  return new;
end;
$$;

comment on function public.enqueue_entry_content_job() is
  'AFTER INSERT hook on public.directory_entries. Enqueues one pending entry_content_jobs row, but only when the new entry has no notes_html yet AND its directory has a non-blank ai_content_prompt — the token-saving rule. Never fires on UPDATE, so existing content is never silently regenerated. security definer so it can enqueue regardless of which role (platform admin or client-portal manager) inserted the entry.';

drop trigger if exists trg_enqueue_entry_content_job on public.directory_entries;
create trigger trg_enqueue_entry_content_job
  after insert on public.directory_entries
  for each row
  execute function public.enqueue_entry_content_job();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.entry_content_jobs enable row level security;
alter table public.directory_entry_versions enable row level security;

-- entry_content_jobs: admin-only direct access, matching listing_enrichment_jobs —
-- read/written by service-role Edge Functions, not queried directly from the client.
create policy "entry_content_jobs_admin_all"
  on public.entry_content_jobs for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

-- directory_entry_versions: same admin + own-client pattern as directory_entries
-- itself, since the client portal's version-history UI reads this directly.
create policy "directory_entry_versions_admin_all"
  on public.directory_entry_versions for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "directory_entry_versions_own_client"
  on public.directory_entry_versions for all
  to authenticated
  using (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  )
  with check (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  );

grant select, insert, update, delete on table public.entry_content_jobs to authenticated, service_role;
grant select, insert, update, delete on table public.directory_entry_versions to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'ai_content_prompt') then
    raise exception 'VERIFY FAILED: directories.ai_content_prompt was not created';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'ai_content_generated_at') then
    raise exception 'VERIFY FAILED: directory_entries.ai_content_generated_at was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_content_jobs') then
    raise exception 'VERIFY FAILED: entry_content_jobs was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_entry_versions') then
    raise exception 'VERIFY FAILED: directory_entry_versions was not created';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_enqueue_entry_content_job') then
    raise exception 'VERIFY FAILED: trg_enqueue_entry_content_job was not created';
  end if;
  raise notice 'VERIFY PASSED: directory AI content generation schema created';
end $$;

-- Row counts — must be UNCHANGED (additive only)
select
  'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;

-- RLS enabled on the new tables
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('entry_content_jobs', 'directory_entry_versions')
order by tablename;
-- Both must show rowsecurity = true

-- Orphan checks — must all return 0
select count(*) as orphaned_jobs
  from public.entry_content_jobs j
  where not exists (select 1 from public.directory_entries e where e.id = j.entry_id)
     or not exists (select 1 from public.directories d where d.id = j.directory_id);

select count(*) as orphaned_versions
  from public.directory_entry_versions v
  where not exists (select 1 from public.directory_entries e where e.id = v.entry_id);

-- Opt-in guard sanity check — confirms no job was ever enqueued for a directory without the prompt set
select count(*) as jobs_for_unconfigured_directories
  from public.entry_content_jobs j
  join public.directories d on d.id = j.directory_id
  where d.ai_content_prompt is null or btrim(d.ai_content_prompt) = '';
-- Must be 0
