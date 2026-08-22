-- ============================================================
-- Rollback: 20260822120000_gate_ai_search_entitlement
-- Reverses: restores enqueue_listing_enrichment_job() to its prior form
--           (prompt-only gate, no entitlement check), drops
--           resolve_ai_search_entitlement(), and deletes the maps.ai_search
--           features row (cascades to its plan_features/client_overrides
--           rows via the existing FK on delete cascade).
--
-- Note: once rolled back, enrichment/search are no longer entitlement-gated
-- for anyone — only the ai_search feature flag and the per-map prompt
-- setting govern access, exactly as before this migration.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'ai_search') then
    raise exception 'ABORT: nothing to roll back — features.maps.ai_search does not exist';
  end if;

  -- Data-loss guard — abort if any per-client overrides have been set for
  -- this feature, since deleting the features row cascades and silently
  -- revokes them.
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


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

-- Restore the enqueue trigger function to its pre-entitlement form
-- (prompt-only gate — matches 20260821120000_create_ai_search_enrichment.sql).
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


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

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
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — unchanged
select
  'clients'                  as tbl, count(*) as rows from public.clients                  union all
  select 'listing_enrichment_jobs', count(*) from public.listing_enrichment_jobs
order by tbl;
