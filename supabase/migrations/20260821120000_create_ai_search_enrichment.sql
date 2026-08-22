-- ============================================================
-- Migration: 20260821120000_create_ai_search_enrichment
-- Description: Foundational schema for Epic 2 (Intent-Based AI Search).
--              This migration only builds the enrichment pipeline that the
--              search feature will read from — it does not add the search
--              RPC/edge function itself (separate follow-up work).
--
--              Adds:
--                - maps.ai_search_enrichment_prompt (text, nullable) — a
--                  per-map admin setting: free text describing the
--                  structured fields to capture about each listing (acts as
--                  both the schema definition and the LLM instruction).
--                  A null value means the map has not opted into AI search
--                  enrichment at all.
--                - listing_enrichment_jobs — an async work queue. An
--                  AFTER INSERT trigger on public.listings
--                  (enqueue_listing_enrichment_job()) inserts one 'pending'
--                  row per new listing, but ONLY when that listing's map has
--                  ai_search_enrichment_prompt set — maps that haven't
--                  configured AI search never enqueue work, so no tokens are
--                  burned for them. A scheduled worker (pg_cron + edge
--                  function, built separately) will poll pending rows in
--                  small batches, call Claude Haiku 4.5, and write results to
--                  listing_research. Batching here is deliberate: without it,
--                  a bulk CSV import of hundreds of rows would fire hundreds
--                  of simultaneous LLM calls instead of a throttled queue.
--                - listing_research — one row per listing (unique on
--                  listing_id), holding the structured JSON result produced
--                  by the map's enrichment prompt.
--
--              By design, enrichment only ever runs once per listing
--              automatically (the trigger only fires on INSERT, never
--              UPDATE). A re-run is always an explicit admin action that
--              inserts a fresh job row with trigger_source = 'admin_manual'
--              — never a silent background refresh.
--
--              RLS: both new tables are admin-only for direct access
--              (mirrors feature_flags/feature_flag_overrides) — the search
--              feature reads listing_research via a service-role edge
--              function, not directly from the client, so no client-facing
--              policy is needed yet. The trigger function is
--              security definer so it can enqueue a job regardless of which
--              role (platform admin or client-portal manager) inserted the
--              listing.
-- Affected tables: maps (new column); listings (new trigger); new tables
--                  listing_enrichment_jobs, listing_research
-- Rollback: _20260821120000_create_ai_search_enrichment.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-21
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- After the dry run, a good manual smoke test (still inside the same
-- transaction, before the ROLLBACK) is:
--   update public.maps set ai_search_enrichment_prompt = 'Capture: category, price range, accessibility notes.'
--     where id = '<a real map id>';
--   insert into public.listings (id, map_id, name)
--     values ('dry-run-test-listing', '<that same map id>', 'Dry run test listing');
--   select * from public.listing_enrichment_jobs where listing_id = 'dry-run-test-listing';
-- Confirm exactly one 'pending' row with trigger_source = 'auto_insert' was
-- created. Then also confirm a listing on a map WITHOUT the prompt set
-- creates no job row at all. Then ROLLBACK.
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- Run these BEFORE applying. Stop if any assertion fails.
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'maps'
  ) then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listings'
  ) then
    raise exception 'ABORT: table public.listings does not exist';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'is_admin'
  ) then
    raise exception 'ABORT: public.is_admin() does not exist — apply 20260521100000_fix_profiles_rls_recursion.sql first';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'maps'     as tbl, count(*) as rows from public.maps     union all
  select 'listings', count(*) from public.listings
order by tbl;
-- Save this output. You will compare it to the post-migration counts.

-- Idempotency guard — none of this should already exist
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps'
      and column_name = 'ai_search_enrichment_prompt'
  ) then
    raise exception 'ABORT: maps.ai_search_enrichment_prompt already exists — migration may have already run';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listing_enrichment_jobs'
  ) then
    raise exception 'ABORT: public.listing_enrichment_jobs already exists — migration may have already run';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listing_research'
  ) then
    raise exception 'ABORT: public.listing_research already exists — migration may have already run';
  end if;
  if exists (
    select 1 from pg_trigger where tgname = 'trg_enqueue_listing_enrichment_job'
  ) then
    raise exception 'ABORT: trg_enqueue_listing_enrichment_job already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Per-map enrichment setting
alter table public.maps
  add column ai_search_enrichment_prompt text null;

comment on column public.maps.ai_search_enrichment_prompt is
  'Admin-authored free text describing the structured fields to capture per listing for AI search enrichment. Acts as both the schema definition and the LLM instruction. Null = this map has not opted into AI search enrichment; no jobs are enqueued for its listings.';

-- 2) Enrichment job queue
create table public.listing_enrichment_jobs (
  id             uuid primary key default gen_random_uuid(),
  listing_id     text not null references public.listings(id) on delete cascade,
  map_id         text not null references public.maps(id) on delete cascade,
  status         text not null default 'pending'
                   check (status in ('pending', 'processing', 'completed', 'failed')),
  trigger_source text not null default 'auto_insert'
                   check (trigger_source in ('auto_insert', 'admin_manual')),
  attempt_count  integer not null default 0,
  error          text null,
  created_at     timestamptz not null default now(),
  started_at     timestamptz null,
  completed_at   timestamptz null
);

create index idx_listing_enrichment_jobs_status on public.listing_enrichment_jobs(status);
create index idx_listing_enrichment_jobs_listing_id on public.listing_enrichment_jobs(listing_id);
create index idx_listing_enrichment_jobs_map_id on public.listing_enrichment_jobs(map_id);

comment on table public.listing_enrichment_jobs is
  'Async work queue for AI search enrichment. One row per enrichment attempt. A scheduled worker polls status = ''pending'' in small batches (throttles bulk imports), calls the LLM, and writes results to listing_research.';

-- 3) Enrichment results (one row per listing)
create table public.listing_research (
  id           uuid primary key default gen_random_uuid(),
  listing_id   text not null unique references public.listings(id) on delete cascade,
  map_id       text not null references public.maps(id) on delete cascade,
  job_id       uuid null references public.listing_enrichment_jobs(id) on delete set null,
  data         jsonb not null default '{}'::jsonb,
  model        text null,
  generated_at timestamptz not null default now()
);

create index idx_listing_research_map_id on public.listing_research(map_id);

comment on table public.listing_research is
  'Structured enrichment output per listing, shaped by that listing''s map.ai_search_enrichment_prompt. Read by the AI search edge function (service role) — never queried directly from the client.';

-- 4) Trigger: enqueue enrichment job on new listing, only for maps that have opted in.
create or replace function public.enqueue_listing_enrichment_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.maps
    where id = new.map_id and ai_search_enrichment_prompt is not null
  ) then
    insert into public.listing_enrichment_jobs (listing_id, map_id, status, trigger_source)
    values (new.id, new.map_id, 'pending', 'auto_insert');
  end if;
  return new;
end;
$$;

comment on function public.enqueue_listing_enrichment_job() is
  'AFTER INSERT hook on public.listings. Enqueues one pending listing_enrichment_jobs row, but only when the listing''s map has ai_search_enrichment_prompt set. Runs once per listing, on INSERT only — never on UPDATE, so existing enrichment is never silently refreshed. security definer so it can enqueue regardless of which role (platform admin or client-portal manager) inserted the listing.';

drop trigger if exists trg_enqueue_listing_enrichment_job on public.listings;
create trigger trg_enqueue_listing_enrichment_job
  after insert on public.listings
  for each row
  execute function public.enqueue_listing_enrichment_job();

-- ------------------------------------------------------------
-- RLS: admin-only direct access, matching feature_flags.
-- The search feature reads listing_research through a service-role edge
-- function, so no client-facing policy is needed at this stage.
-- ------------------------------------------------------------

alter table public.listing_enrichment_jobs enable row level security;
alter table public.listing_research enable row level security;

create policy "listing_enrichment_jobs_admin_all"
  on public.listing_enrichment_jobs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "listing_research_admin_all"
  on public.listing_research for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.listing_enrichment_jobs to authenticated, service_role;
grant select, insert, update, delete on table public.listing_research to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps'
      and column_name = 'ai_search_enrichment_prompt'
  ) then
    raise exception 'VERIFY FAILED: maps.ai_search_enrichment_prompt was not created';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listing_enrichment_jobs'
  ) then
    raise exception 'VERIFY FAILED: listing_enrichment_jobs was not created';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listing_research'
  ) then
    raise exception 'VERIFY FAILED: listing_research was not created';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_enqueue_listing_enrichment_job'
  ) then
    raise exception 'VERIFY FAILED: trg_enqueue_listing_enrichment_job was not created';
  end if;
  raise notice 'VERIFY PASSED: ai_search_enrichment_prompt + listing_enrichment_jobs + listing_research + trigger created';
end $$;

-- Row counts — maps/listings must be UNCHANGED from pre-migration (unless you ran the dry-run smoke test on staging, in which case +1 listing is expected — clean it up before comparing).
select
  'maps'     as tbl, count(*) as rows from public.maps     union all
  select 'listings', count(*) from public.listings
order by tbl;

-- RLS enabled on the new tables
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('listing_enrichment_jobs', 'listing_research')
order by tablename;
-- Both must show rowsecurity = true

-- Orphan checks — must all return 0
select count(*) as orphaned_jobs
  from public.listing_enrichment_jobs j
  where not exists (select 1 from public.listings l where l.id = j.listing_id)
     or not exists (select 1 from public.maps m where m.id = j.map_id);

select count(*) as orphaned_research
  from public.listing_research r
  where not exists (select 1 from public.listings l where l.id = r.listing_id)
     or not exists (select 1 from public.maps m where m.id = r.map_id);

-- Opt-in guard sanity check — confirms no job was ever enqueued for a map without the prompt set
select count(*) as jobs_for_unconfigured_maps
  from public.listing_enrichment_jobs j
  join public.maps m on m.id = j.map_id
  where m.ai_search_enrichment_prompt is null;
-- Must be 0
