-- ============================================================
-- ROLLBACK: 20261005140000_ai_bulk_run_tools
-- Drops the retry and run-summary functions and restores the original
-- claim functions (no stale-job reclaim). No table data is touched.
-- ============================================================

drop function if exists public.retry_failed_entry_content_jobs(text);
drop function if exists public.retry_failed_entry_seo_metadata_jobs(text);
drop function if exists public.get_ai_bulk_run_summary(text, text);

create or replace function public.claim_pending_entry_content_jobs(p_batch_size integer default 5)
returns setof public.entry_content_jobs
language sql
security definer
set search_path = public
as $$
  update public.entry_content_jobs
  set status = 'processing', started_at = now()
  where id in (
    select id from public.entry_content_jobs
    where status = 'pending'
    order by created_at
    limit greatest(p_batch_size, 0)
    for update skip locked
  )
  returning *;
$$;

create or replace function public.claim_pending_entry_seo_metadata_jobs(p_batch_size integer default 5)
returns setof public.entry_seo_metadata_jobs
language sql
security definer
set search_path = public
as $$
  update public.entry_seo_metadata_jobs
  set status = 'processing', started_at = now()
  where id in (
    select id from public.entry_seo_metadata_jobs
    where status = 'pending'
    order by created_at
    limit greatest(p_batch_size, 0)
    for update skip locked
  )
  returning *;
$$;

revoke all on function public.claim_pending_entry_content_jobs(integer) from public, authenticated, anon;
revoke all on function public.claim_pending_entry_seo_metadata_jobs(integer) from public, authenticated, anon;
grant execute on function public.claim_pending_entry_content_jobs(integer) to service_role;
grant execute on function public.claim_pending_entry_seo_metadata_jobs(integer) to service_role;

do $$
begin
  if exists (select 1 from pg_proc where proname in ('retry_failed_entry_content_jobs', 'retry_failed_entry_seo_metadata_jobs', 'get_ai_bulk_run_summary')) then
    raise exception 'ROLLBACK FAILED: functions still present';
  end if;
  raise notice 'ROLLBACK VERIFIED';
end $$;
