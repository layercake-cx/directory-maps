-- ============================================================
-- Rollback: 20261003120000_messaging_profiles
-- Undoes the forward migration. The old clients.* columns and the old
-- client_messaging_settings view were never touched, so nothing needs
-- restoring there.
--
-- DESTRUCTIVE (requires explicit sign-off): drops the new per-map /
-- per-directory messaging columns and the messaging_profiles table, losing any
-- edits made to them since the forward migration. Run only if no application
-- code reading them (slice 2+) is deployed, or after reverting that code.
--
-- Dry run: wrap in BEGIN; ... ROLLBACK;
-- ============================================================

drop view if exists public.map_messaging_settings;
drop view if exists public.directory_messaging_settings;

drop trigger if exists maps_messaging_profile_same_client on public.maps;
drop trigger if exists directories_messaging_profile_same_client on public.directories;
drop function if exists public.enforce_messaging_profile_same_client();
drop function if exists public.resolve_messaging_entitlement(text);

drop index if exists public.idx_maps_messaging_profile;
drop index if exists public.idx_directories_messaging_profile;

alter table public.maps
  drop column if exists messaging_profile_id,
  drop column if exists messaging_enabled,
  drop column if exists email_test_mode,
  drop column if exists email_test_recipient,
  drop column if exists message_prompt,
  drop column if exists message_subject,
  drop column if exists message_intro;

alter table public.directories
  drop column if exists messaging_profile_id,
  drop column if exists messaging_enabled,
  drop column if exists email_test_mode,
  drop column if exists email_test_recipient,
  drop column if exists message_prompt,
  drop column if exists message_subject,
  drop column if exists message_intro;

drop table if exists public.messaging_profiles;

-- Verify: counts unchanged vs the pre-migration output.
select 'clients' as tbl, count(*) as rows from public.clients union all
select 'maps', count(*) from public.maps union all
select 'directories', count(*) from public.directories union all
select 'listings', count(*) from public.listings
order by tbl;
