-- ============================================================
-- Rollback: 20260923130000_create_claims_schema
-- Reverses: drops directory_entries.current_claim_id/content_managed_by/
--           content_last_edited_by_claim_user_id/content_last_edited_at,
--           then directory_entry_team_members, claim_users, claim_payments,
--           claims (and its trigger), directory_claim_settings, and the
--           derive_claim_directory_id() function.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'claims') then
    raise exception 'ABORT: nothing to roll back — public.claims does not exist';
  end if;

  if exists (select 1 from public.claims limit 1) then
    raise exception
      'ABORT: public.claims has live data. Back it up (pg_dump -t public.claims, '
      'plus claim_payments/claim_users/directory_entry_team_members) before rolling back. '
      'To override, delete this check and re-run.';
  end if;

  if exists (
    select 1 from public.directory_entries
    where current_claim_id is not null or content_managed_by <> 'platform'
    limit 1
  ) then
    raise exception
      'ABORT: directory_entries has claim-related data (current_claim_id set or '
      'content_managed_by <> platform). Back it up before rolling back. '
      'To override, delete this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

alter table public.directory_entries
  drop column if exists current_claim_id,
  drop column if exists content_managed_by,
  drop column if exists content_last_edited_by_claim_user_id,
  drop column if exists content_last_edited_at;

drop table if exists public.directory_entry_team_members;
drop table if exists public.claim_users;
drop table if exists public.claim_payments;
drop table if exists public.claims; -- also drops trg_derive_claim_directory_id
drop table if exists public.directory_claim_settings;

drop function if exists public.derive_claim_directory_id();


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'claims') then
    raise exception 'ROLLBACK VERIFY FAILED: public.claims still exists';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_claim_settings') then
    raise exception 'ROLLBACK VERIFY FAILED: public.directory_claim_settings still exists';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_entry_team_members') then
    raise exception 'ROLLBACK VERIFY FAILED: public.directory_entry_team_members still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'current_claim_id'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directory_entries.current_claim_id still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'derive_claim_directory_id') then
    raise exception 'ROLLBACK VERIFY FAILED: derive_claim_directory_id() still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — directories/directory_entries must be unchanged
select
  'directories'   as tbl, count(*) as rows from public.directories        union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
