-- ============================================================
-- Migration: 20260906140000_remove_ai_search_enrichment_schema
-- Description: Removes the map-level "AI search enrichment" / "Intent-Based
--              AI Search" feature's database schema in full (docs/FEATURES.md
--              §4.4d) — superseded by directory-level AI content generation
--              (§4.4g, 20260906120000/20260906130000). This feature was
--              always admin-only/beta-flagged (`ai_search`) and never
--              released to customers.
--
--              This migration is the four original rollback files for that
--              feature, concatenated in the order their own headers
--              specify (each retains its own pre-check/rollback/
--              verification blocks, unmodified):
--                1) _20260822120000_gate_ai_search_entitlement.rollback.sql
--                2) _20260821140000_seed_ai_search_feature_flag.rollback.sql
--                3) _20260821130000_ai_search_enrichment_worker_cron.rollback.sql
--                4) _20260821120000_create_ai_search_enrichment.rollback.sql
--              Those four files are UNCHANGED and remain in this directory
--              as the historical record of exactly what this migration
--              does — this file exists only because this CLI version
--              (2.75.0) has no way to execute an underscore-prefixed
--              rollback file directly against a remote project (see
--              docs/DATABASE_MIGRATIONS.md's documented tooling gap);
--              `supabase db push` only picks up normally-named migration
--              files, so this is that same SQL under a pushable name.
--
-- Data-loss warning: permanently deletes any enrichment jobs, research
-- results, and per-client ai_search overrides already recorded. Each
-- section below aborts on its own if real data would be lost — read any
-- ABORT message before removing a guard.
-- Affected tables: features/plan_features (rows deleted), feature_flags
--                  (row deleted), listings (trigger function reverted to
--                  no-op — trigger and function are then dropped by the
--                  final section anyway), maps (column dropped); drops
--                  listing_enrichment_jobs, listing_research; drops cron
--                  job process-listing-enrichment-dispatch and its claim RPC.
-- Rollback: _20260906140000_remove_ai_search_enrichment_schema.rollback.sql
--           (re-creates the schema — the original four forward migrations,
--           concatenated the same way).
-- Author: Claude Code
-- Date: 2026-09-06
-- ============================================================


-- ============================================================
-- 1) _20260822120000_gate_ai_search_entitlement.rollback.sql
-- Reverses: restores enqueue_listing_enrichment_job() to its prior form
--           (prompt-only gate, no entitlement check), drops
--           resolve_ai_search_entitlement(), and deletes the maps.ai_search
--           features row (cascades to its plan_features/client_overrides
--           rows via the existing FK on delete cascade).
-- ============================================================

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'ai_search') then
    raise exception 'ABORT: nothing to roll back — features.maps.ai_search does not exist';
  end if;

  if exists (
    select 1 from public.client_overrides ov
    join public.features f on f.id = ov.feature_id
    where f.product_key = 'maps' and f.key = 'ai_search'
    limit 1
  ) then
    raise exception
      'ABORT: per-client overrides exist for maps.ai_search. '
      'Record which clients were granted which overrides before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;

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

drop function if exists public.resolve_ai_search_entitlement(text);

delete from public.features where product_key = 'maps' and key = 'ai_search';

do $$
begin
  if exists (select 1 from public.features where product_key = 'maps' and key = 'ai_search') then
    raise exception 'ROLLBACK VERIFY FAILED: features.maps.ai_search still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'resolve_ai_search_entitlement') then
    raise exception 'ROLLBACK VERIFY FAILED: resolve_ai_search_entitlement still exists';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_enqueue_listing_enrichment_job') then
    raise exception 'ROLLBACK VERIFY FAILED: trg_enqueue_listing_enrichment_job is missing (should still exist, just reverted)';
  end if;
  raise notice 'STEP 1/4 VERIFY PASSED: ai_search entitlement removed';
end $$;


-- ============================================================
-- 2) _20260821140000_seed_ai_search_feature_flag.rollback.sql
-- Reverses: deletes the 'ai_search' feature_flags row (cascades to any
--           feature_flag_overrides rows via the existing FK on delete cascade).
-- ============================================================

do $$
begin
  if not exists (select 1 from public.feature_flags where key = 'ai_search') then
    raise exception 'ABORT: nothing to roll back — feature_flags.ai_search does not exist';
  end if;
end $$;

delete from public.feature_flags where key = 'ai_search';

do $$
begin
  if exists (select 1 from public.feature_flags where key = 'ai_search') then
    raise exception 'ROLLBACK VERIFY FAILED: feature_flags.ai_search still exists';
  end if;
  raise notice 'STEP 2/4 VERIFY PASSED: ai_search feature flag removed';
end $$;


-- ============================================================
-- 3) _20260821130000_ai_search_enrichment_worker_cron.rollback.sql
-- Reverses: unschedules the dispatch cron job and drops the claim RPC.
--
-- Safe to roll back at any time — any jobs already 'processing' when this
-- runs will simply sit unclaimed (not lost; still queryable/re-claimable
-- until step 4 below drops the table).
-- ============================================================

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'process-listing-enrichment-dispatch') then
    raise exception 'ABORT: nothing to roll back — process-listing-enrichment-dispatch cron job does not exist';
  end if;
end $$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'process-listing-enrichment-dispatch';

drop function if exists public.claim_pending_listing_enrichment_jobs(integer);

do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-listing-enrichment-dispatch') then
    raise exception 'ROLLBACK VERIFY FAILED: process-listing-enrichment-dispatch cron job still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'claim_pending_listing_enrichment_jobs') then
    raise exception 'ROLLBACK VERIFY FAILED: claim_pending_listing_enrichment_jobs still exists';
  end if;
  raise notice 'STEP 3/4 VERIFY PASSED: worker cron + claim RPC removed';
end $$;


-- ============================================================
-- 4) _20260821120000_create_ai_search_enrichment.rollback.sql
-- Reverses: drops the trg_enqueue_listing_enrichment_job trigger + function,
--           drops listing_research and listing_enrichment_jobs (including
--           their data), and drops maps.ai_search_enrichment_prompt.
--
-- Data-loss warning: this permanently deletes any enrichment jobs and
-- research results already generated.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'ai_search_enrichment_prompt'
  ) then
    raise exception 'ABORT: nothing to roll back — maps.ai_search_enrichment_prompt does not exist';
  end if;

end $$;

-- Data-loss override (explicit user sign-off, 2026-09-06): listing_research
-- has real rows on this project (13, confirmed via scratch inspection this
-- session). Rather than aborting, back them up into a plain table first —
-- non-destructive, recoverable — then proceed with the drop as authorized.
do $$
begin
  if exists (select 1 from public.listing_research limit 1) then
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_research_backup_20260906') then
      create table public.listing_research_backup_20260906 as select * from public.listing_research;
      comment on table public.listing_research_backup_20260906 is
        'One-time backup of listing_research taken immediately before 20260906140000_remove_ai_search_enrichment_schema dropped the live table. Not read by any application code — safe to archive/export and drop once no longer needed.';
    end if;
    raise notice 'Backed up % listing_research row(s) to listing_research_backup_20260906 before dropping the live table.', (select count(*) from public.listing_research);
  end if;
end $$;

drop trigger if exists trg_enqueue_listing_enrichment_job on public.listings;
drop function if exists public.enqueue_listing_enrichment_job();

drop table if exists public.listing_research;
drop table if exists public.listing_enrichment_jobs;

alter table public.maps
  drop column if exists ai_search_enrichment_prompt;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'ai_search_enrichment_prompt'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: maps.ai_search_enrichment_prompt still exists';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_enrichment_jobs') then
    raise exception 'ROLLBACK VERIFY FAILED: listing_enrichment_jobs still exists';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_research') then
    raise exception 'ROLLBACK VERIFY FAILED: listing_research still exists';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_enqueue_listing_enrichment_job') then
    raise exception 'ROLLBACK VERIFY FAILED: trg_enqueue_listing_enrichment_job still exists';
  end if;
  raise notice 'STEP 4/4 VERIFY PASSED: ai_search_enrichment_prompt + listing_enrichment_jobs + listing_research + trigger removed';
  raise notice 'VERIFY PASSED: map-level AI search enrichment schema fully removed';
end $$;

-- Row counts — core tables must be unchanged
select
  'clients'  as tbl, count(*) as rows from public.clients  union all
  select 'maps',      count(*) from public.maps            union all
  select 'listings',  count(*) from public.listings
order by tbl;
