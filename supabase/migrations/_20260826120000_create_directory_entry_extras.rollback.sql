-- ============================================================
-- Rollback: 20260826120000_create_directory_entry_extras
-- Reverses: drops entry_evidence_items, entry_media_assets,
--           directory_accreditation_schemes, entry_accreditations,
--           prominent_links, product_tiles (and their RLS policies,
--           dropped automatically with the tables), and removes the
--           four show_* columns from directory_entries.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  -- 1. Confirm there is something to roll back
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'entry_evidence_items'
  ) then
    raise exception 'ABORT: nothing to roll back — public.entry_evidence_items does not exist';
  end if;

  -- 2. Data-loss guard — abort if any real content has been created since the migration ran
  if exists (select 1 from public.entry_evidence_items limit 1) then
    raise exception 'ABORT: live data exists in public.entry_evidence_items. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  if exists (select 1 from public.entry_media_assets limit 1) then
    raise exception 'ABORT: live data exists in public.entry_media_assets. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  if exists (select 1 from public.directory_accreditation_schemes limit 1) then
    raise exception 'ABORT: live data exists in public.directory_accreditation_schemes. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  if exists (select 1 from public.entry_accreditations limit 1) then
    raise exception 'ABORT: live data exists in public.entry_accreditations. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  if exists (select 1 from public.prominent_links limit 1) then
    raise exception 'ABORT: live data exists in public.prominent_links. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  if exists (select 1 from public.product_tiles limit 1) then
    raise exception 'ABORT: live data exists in public.product_tiles. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  -- 3. Column-drop data-loss guard — abort if any entry has a non-default show_* value
  if exists (
    select 1 from public.directory_entries
    where show_phone is distinct from true
       or show_email is distinct from true
       or show_website is distinct from true
       or show_address is distinct from true
  ) then
    raise exception 'ABORT: a directory_entries row has a non-default show_* value. Export it before rolling back. To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop table if exists public.entry_accreditations;
drop table if exists public.directory_accreditation_schemes;
drop table if exists public.entry_media_assets;
drop table if exists public.entry_evidence_items;
drop table if exists public.prominent_links;
drop table if exists public.product_tiles;

alter table public.directory_entries
  drop column if exists show_phone,
  drop column if exists show_email,
  drop column if exists show_website,
  drop column if exists show_address;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'entry_evidence_items', 'entry_media_assets',
        'directory_accreditation_schemes', 'entry_accreditations',
        'prominent_links', 'product_tiles'
      )
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: one or more of the new tables still exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'show_phone'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directory_entries.show_phone still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — confirm no data loss beyond what was expected
select
  'directories'        as tbl, count(*) as rows from public.directories        union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
