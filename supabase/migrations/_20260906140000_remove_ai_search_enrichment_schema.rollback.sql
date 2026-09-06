-- ============================================================
-- Rollback: 20260906140000_remove_ai_search_enrichment_schema
-- Reverses: re-creates the map-level AI search enrichment schema — the four
--           original forward migrations, concatenated in their original
--           order (each retains its own pre-check/verification blocks,
--           unmodified):
--             1) 20260821120000_create_ai_search_enrichment.sql
--             2) 20260821130000_ai_search_enrichment_worker_cron.sql
--             3) 20260821140000_seed_ai_search_feature_flag.sql
--             4) 20260822120000_gate_ai_search_entitlement.sql
--           Those four files are UNCHANGED and remain in this directory —
--           this file exists only so "undo the removal" is a single
--           pushable migration, for the same CLI-tooling-gap reason
--           documented in 20260906140000's own header.
--
-- Note: this restores the SCHEMA only. The process_listing_enrichment and
-- search_listings_by_intent Edge Functions and their frontend UI were
-- deleted by this branch's other commits — restoring those is a separate,
-- explicit decision (git revert the relevant commits), not implied by
-- running this file.
-- ============================================================


-- ============================================================
-- 1) 20260821120000_create_ai_search_enrichment.sql
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maps') then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listings') then
    raise exception 'ABORT: table public.listings does not exist';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_admin') then
    raise exception 'ABORT: public.is_admin() does not exist — apply 20260521100000_fix_profiles_rls_recursion.sql first';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'maps' and column_name = 'ai_search_enrichment_prompt') then
    raise exception 'ABORT: maps.ai_search_enrichment_prompt already exists — this rollback may have already run';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_enrichment_jobs') then
    raise exception 'ABORT: public.listing_enrichment_jobs already exists — this rollback may have already run';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_research') then
    raise exception 'ABORT: public.listing_research already exists — this rollback may have already run';
  end if;
end $$;

alter table public.maps
  add column ai_search_enrichment_prompt text null;

comment on column public.maps.ai_search_enrichment_prompt is
  'Admin-authored free text describing the structured fields to capture per listing for AI search enrichment. Acts as both the schema definition and the LLM instruction. Null = this map has not opted into AI search enrichment; no jobs are enqueued for its listings.';

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

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'maps' and column_name = 'ai_search_enrichment_prompt') then
    raise exception 'VERIFY FAILED: maps.ai_search_enrichment_prompt was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_enrichment_jobs') then
    raise exception 'VERIFY FAILED: listing_enrichment_jobs was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_research') then
    raise exception 'VERIFY FAILED: listing_research was not created';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_enqueue_listing_enrichment_job') then
    raise exception 'VERIFY FAILED: trg_enqueue_listing_enrichment_job was not created';
  end if;
  raise notice 'STEP 1/4 VERIFY PASSED: ai_search_enrichment_prompt + listing_enrichment_jobs + listing_research + trigger re-created';
end $$;


-- ============================================================
-- 2) 20260821130000_ai_search_enrichment_worker_cron.sql
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_enrichment_jobs') then
    raise exception 'ABORT: table public.listing_enrichment_jobs does not exist';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url') then
    raise exception 'ABORT: vault secret "project_url" does not exist';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'anon_key') then
    raise exception 'ABORT: vault secret "anon_key" does not exist';
  end if;
  if exists (select 1 from pg_proc where proname = 'claim_pending_listing_enrichment_jobs') then
    raise exception 'ABORT: claim_pending_listing_enrichment_jobs already exists — this rollback may have already run';
  end if;
  if exists (select 1 from cron.job where jobname = 'process-listing-enrichment-dispatch') then
    raise exception 'ABORT: process-listing-enrichment-dispatch cron job already exists — this rollback may have already run';
  end if;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create or replace function public.claim_pending_listing_enrichment_jobs(p_batch_size integer default 5)
returns setof public.listing_enrichment_jobs
language sql
security definer
set search_path = public
as $$
  update public.listing_enrichment_jobs
  set status = 'processing', started_at = now()
  where id in (
    select id from public.listing_enrichment_jobs
    where status = 'pending'
    order by created_at
    limit greatest(p_batch_size, 0)
    for update skip locked
  )
  returning *;
$$;

comment on function public.claim_pending_listing_enrichment_jobs(integer) is
  'Atomically claims up to p_batch_size pending listing_enrichment_jobs rows (FOR UPDATE SKIP LOCKED), marking them processing. Called by the process_listing_enrichment Edge Function via the service-role client. Not exposed to authenticated/anon.';

revoke all on function public.claim_pending_listing_enrichment_jobs(integer) from public, authenticated, anon;
grant execute on function public.claim_pending_listing_enrichment_jobs(integer) to service_role;

select cron.schedule(
  'process-listing-enrichment-dispatch',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/process_listing_enrichment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'claim_pending_listing_enrichment_jobs') then
    raise exception 'VERIFY FAILED: claim_pending_listing_enrichment_jobs was not created';
  end if;
  if not exists (select 1 from cron.job where jobname = 'process-listing-enrichment-dispatch') then
    raise exception 'VERIFY FAILED: process-listing-enrichment-dispatch cron job was not created';
  end if;
  raise notice 'STEP 2/4 VERIFY PASSED: claim RPC + dispatch cron re-registered';
end $$;


-- ============================================================
-- 3) 20260821140000_seed_ai_search_feature_flag.sql
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'feature_flags') then
    raise exception 'ABORT: table public.feature_flags does not exist';
  end if;
  if exists (select 1 from public.feature_flags where key = 'ai_search') then
    raise exception 'ABORT: feature_flags.ai_search already exists — this rollback may have already run';
  end if;
end $$;

insert into public.feature_flags (key, description, default_enabled, internal_enabled)
values (
  'ai_search',
  'AI search enrichment (in development). Off for customers; on for admins and @layercake-cx.biz users; grantable per-customer.',
  false,
  true
);

do $$
begin
  if not exists (select 1 from public.feature_flags where key = 'ai_search') then
    raise exception 'VERIFY FAILED: feature_flags.ai_search was not created';
  end if;
  raise notice 'STEP 3/4 VERIFY PASSED: ai_search feature flag re-registered';
end $$;


-- ============================================================
-- 4) 20260822120000_gate_ai_search_entitlement.sql
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'features') then
    raise exception 'ABORT: table public.features does not exist';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_enqueue_listing_enrichment_job') then
    raise exception 'ABORT: trg_enqueue_listing_enrichment_job does not exist';
  end if;
  if exists (select 1 from public.features where product_key = 'maps' and key = 'ai_search') then
    raise exception 'ABORT: features.maps.ai_search already exists — this rollback may have already run';
  end if;
end $$;

insert into public.features (
  product_key, key, name, description, entitlement_type, enforcement,
  on_downgrade_policy, kill_switch_enabled, default_bool_value
) values (
  'maps', 'ai_search', 'AI Search',
  'Whether a client''s maps can use AI search enrichment + intent-based search.',
  'boolean', 'hard', 'hard_block_new', false, false
);

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'standard', f.id, false from public.features f
  where f.product_key = 'maps' and f.key = 'ai_search';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'premium', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'ai_search';

insert into public.plan_features (plan_key, feature_id, bool_value)
select 'unlimited', f.id, true from public.features f
  where f.product_key = 'maps' and f.key = 'ai_search';

create or replace function public.resolve_ai_search_entitlement(p_client_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    case
      when f.kill_switch_enabled then false
      when ov.feature_id is not null and ov.bool_value is not null then ov.bool_value
      when p.is_founder_tier then true
      when pf.feature_id is not null and pf.bool_value is not null then pf.bool_value
      else f.default_bool_value
    end,
    false
  )
  from public.features f
  left join public.clients c on c.id = p_client_id
  left join public.plans p on p.key = coalesce(c.plan_key, 'standard')
  left join public.client_overrides ov on ov.feature_id = f.id and ov.client_id = p_client_id
  left join public.plan_features pf on pf.feature_id = f.id and pf.plan_key = coalesce(c.plan_key, 'standard')
  where f.product_key = 'maps' and f.key = 'ai_search';
$$;

comment on function public.resolve_ai_search_entitlement(text) is
  'Resolves the maps.ai_search boolean entitlement for an explicit client_id: kill_switch > client_overrides > Founder tier > plan_features > catalog default. Used by the enrichment trigger and the search_listings_by_intent Edge Function (both run without an authenticated user session, so get_my_entitlements()/get_client_entitlements() do not apply here).';

revoke all on function public.resolve_ai_search_entitlement(text) from public, authenticated, anon;
grant execute on function public.resolve_ai_search_entitlement(text) to service_role;

create or replace function public.enqueue_listing_enrichment_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
begin
  select client_id into v_client_id from public.maps where id = new.map_id;

  if v_client_id is not null
     and exists (
       select 1 from public.maps
       where id = new.map_id and ai_search_enrichment_prompt is not null
     )
     and public.resolve_ai_search_entitlement(v_client_id)
  then
    insert into public.listing_enrichment_jobs (listing_id, map_id, status, trigger_source)
    values (new.id, new.map_id, 'pending', 'auto_insert');
  end if;
  return new;
end;
$$;

comment on function public.enqueue_listing_enrichment_job() is
  'AFTER INSERT hook on public.listings. Enqueues one pending listing_enrichment_jobs row, but only when the listing''s map has ai_search_enrichment_prompt set AND the map''s client has the maps.ai_search entitlement (Professional plan and above, or a per-client override) — so a non-entitled client never burns a token even if a prompt is still configured (e.g. after a downgrade). Runs once per listing, on INSERT only — never on UPDATE, so existing enrichment is never silently refreshed. security definer so it can enqueue regardless of which role (platform admin or client-portal manager) inserted the listing.';

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'ai_search') then
    raise exception 'VERIFY FAILED: features.maps.ai_search was not created';
  end if;
  if (
    select count(*) from public.plan_features pf
    join public.features f on f.id = pf.feature_id
    where f.product_key = 'maps' and f.key = 'ai_search'
  ) <> 3 then
    raise exception 'VERIFY FAILED: expected 3 plan_features rows (standard/premium/unlimited) for ai_search';
  end if;
  if not exists (select 1 from pg_proc where proname = 'resolve_ai_search_entitlement') then
    raise exception 'VERIFY FAILED: resolve_ai_search_entitlement() was not created';
  end if;
  if public.resolve_ai_search_entitlement('__nonexistent_client__') is distinct from false then
    raise exception 'VERIFY FAILED: resolver did not fail safe (false) for an unknown client_id';
  end if;
  raise notice 'STEP 4/4 VERIFY PASSED: ai_search entitlement + resolver + enrichment enforcement re-created';
  raise notice 'ROLLBACK VERIFY PASSED: map-level AI search enrichment schema fully restored';
end $$;

-- Row counts — unchanged
select
  'clients'  as tbl, count(*) as rows from public.clients  union all
  select 'maps',      count(*) from public.maps            union all
  select 'listings',  count(*) from public.listings
order by tbl;
