-- ============================================================
-- Rollback: 20260917170000_enable_rls_listing_research_backup
-- Reverses: enable row level security on listing_research_backup_20260906
-- ============================================================
--
-- Disabling RLS here re-opens the exposure this migration closed. Only run
-- this rollback if you are certain that is intended (it is not expected to
-- ever be needed in practice).

do $$
begin
  if not exists (
    select 1 from pg_class
    where relname = 'listing_research_backup_20260906'
      and relnamespace = 'public'::regnamespace
      and relrowsecurity = true
  ) then
    raise exception 'ABORT: listing_research_backup_20260906 does not have RLS enabled — nothing to roll back';
  end if;
end $$;

alter table public.listing_research_backup_20260906 disable row level security;

do $$
begin
  if exists (
    select 1 from pg_class
    where relname = 'listing_research_backup_20260906'
      and relnamespace = 'public'::regnamespace
      and relrowsecurity = true
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: RLS is still enabled on listing_research_backup_20260906';
  end if;
  raise notice 'ROLLBACK APPLIED: RLS disabled on listing_research_backup_20260906 (this re-opens the exposure — confirm this was truly intended)';
end $$;
