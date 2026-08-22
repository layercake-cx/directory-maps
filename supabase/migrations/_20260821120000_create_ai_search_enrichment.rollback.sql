-- ============================================================
-- Rollback: 20260821120000_create_ai_search_enrichment
-- Reverses: drops the trg_enqueue_listing_enrichment_job trigger + function,
--           drops listing_research and listing_enrichment_jobs (including
--           their data), and drops maps.ai_search_enrichment_prompt.
--
-- Data-loss warning: this permanently deletes any enrichment jobs and
-- research results already generated. If any map has real enrichment data,
-- back it up (see safety check below) before rolling back.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps'
      and column_name = 'ai_search_enrichment_prompt'
  ) then
    raise exception 'ABORT: nothing to roll back — maps.ai_search_enrichment_prompt does not exist';
  end if;

  -- Data-loss guard — abort if any real research results exist, since
  -- dropping the table destroys them with no recovery path.
  if exists (select 1 from public.listing_research limit 1) then
    raise exception
      'ABORT: listing_research has rows. Export/back up its contents before '
      'rolling back — this rollback drops the table and its data. '
      'To proceed anyway, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop trigger if exists trg_enqueue_listing_enrichment_job on public.listings;
drop function if exists public.enqueue_listing_enrichment_job();

drop table if exists public.listing_research;
drop table if exists public.listing_enrichment_jobs;

alter table public.maps
  drop column if exists ai_search_enrichment_prompt;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps'
      and column_name = 'ai_search_enrichment_prompt'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: maps.ai_search_enrichment_prompt still exists';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listing_enrichment_jobs'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: listing_enrichment_jobs still exists';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listing_research'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: listing_research still exists';
  end if;
  if exists (
    select 1 from pg_trigger where tgname = 'trg_enqueue_listing_enrichment_job'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: trg_enqueue_listing_enrichment_job still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — core tables must be unchanged
select
  'maps'     as tbl, count(*) as rows from public.maps     union all
  select 'listings', count(*) from public.listings
order by tbl;
