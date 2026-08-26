-- ============================================================
-- Rollback: 20260826121000_create_directory_media_storage_bucket
-- Reverses: creation of the "directory-media" storage bucket and its
--           storage.objects RLS policies.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'directory-media') then
    raise exception 'ABORT: nothing to roll back — bucket "directory-media" does not exist';
  end if;

  -- Data-loss guard: if any objects were uploaded since this migration ran,
  -- dropping the bucket deletes them permanently.
  if exists (select 1 from storage.objects where bucket_id = 'directory-media' limit 1) then
    raise exception
      'ABORT: directory-media bucket has objects in it. Back up (supabase storage cp) before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop policy if exists "directory-media public read" on storage.objects;
drop policy if exists "directory-media authenticated write" on storage.objects;
drop policy if exists "directory-media authenticated update" on storage.objects;
drop policy if exists "directory-media authenticated delete" on storage.objects;

delete from storage.buckets where id = 'directory-media';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from storage.buckets where id = 'directory-media') then
    raise exception 'ROLLBACK VERIFY FAILED: directory-media bucket still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
