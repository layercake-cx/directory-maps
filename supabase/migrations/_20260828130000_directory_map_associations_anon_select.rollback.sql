-- ============================================================
-- Rollback: 20260828130000_directory_map_associations_anon_select
-- Reverses: the anon-select policy + grant on directory_map_associations.
-- WARNING: rolling this back breaks the public embed for every
-- directory-sourced map (EmbedMap.jsx's anon client can no longer see the
-- association, so it silently falls back to the map's own, likely-empty
-- listings) — the exact production bug this migration fixed. Only roll
-- back if directory-sourced maps are being intentionally disabled.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
declare
  n bigint;
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'directory_map_associations' and policyname = 'directory_map_associations_anon_select') then
    raise notice 'directory_map_associations_anon_select already absent — nothing to roll back';
    return;
  end if;

  select count(*) into n from public.directory_map_associations;
  if n > 0 then
    raise notice 'Rolling back with % live map<->directory association(s) — their public embeds will stop showing pins entirely until this is reapplied or they are detached.', n;
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop policy if exists "directory_map_associations_anon_select" on public.directory_map_associations;
revoke select on table public.directory_map_associations from anon;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'directory_map_associations' and policyname = 'directory_map_associations_anon_select') then
    raise exception 'ROLLBACK VERIFY FAILED: directory_map_associations_anon_select policy still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select 'directory_map_associations' as tbl, count(*) as rows from public.directory_map_associations;
