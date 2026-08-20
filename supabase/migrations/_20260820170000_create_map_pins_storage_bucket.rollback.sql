-- ============================================================
-- Rollback: 20260820170000_create_map_pins_storage_bucket
-- Reverses: creation of the "map-pins" storage bucket and its
--           storage.objects RLS policies.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'map-pins') then
    raise exception 'ABORT: nothing to roll back — bucket "map-pins" does not exist';
  end if;

  -- Data-loss guard: if any objects were uploaded since this migration ran
  -- (logos, custom pin icons), dropping the bucket deletes them permanently.
  if exists (select 1 from storage.objects where bucket_id = 'map-pins' limit 1) then
    raise exception
      'ABORT: map-pins bucket has objects in it. Back up (supabase storage cp) before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop policy if exists "map-pins public read" on storage.objects;
drop policy if exists "map-pins authenticated write" on storage.objects;
drop policy if exists "map-pins authenticated update" on storage.objects;
drop policy if exists "map-pins authenticated delete" on storage.objects;

delete from storage.buckets where id = 'map-pins';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from storage.buckets where id = 'map-pins') then
    raise exception 'ROLLBACK VERIFY FAILED: map-pins bucket still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
