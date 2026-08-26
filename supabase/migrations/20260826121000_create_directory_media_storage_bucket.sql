-- ============================================================
-- Migration: 20260826121000_create_directory_media_storage_bucket
-- Description: Creates the "directory-media" Supabase Storage bucket for
--              entry_media_assets uploads (build-scope §5.6), mirroring
--              the "map-pins" bucket exactly (20260820170000). A separate
--              bucket rather than reusing map-pins because these are
--              photos (larger, JPEG/WebP/PNG only — no SVG, which is
--              specific to pin icons) rather than small pin/logo icons.
-- Affected: storage.buckets, storage.objects (RLS policies)
-- Rollback: _20260826121000_create_directory_media_storage_bucket.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-26
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste "THE MIGRATION" section below>
--   ROLLBACK;
--
-- If no error appears, the dry run passed. Then apply for real.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

-- A) Idempotency guard — confirm the bucket does NOT already exist
do $$
begin
  if exists (select 1 from storage.buckets where id = 'directory-media') then
    raise exception 'ABORT: bucket "directory-media" already exists — this migration may have already run';
  end if;
end $$;

-- B) Row count — inspect before proceeding (expect 0 objects, since the bucket doesn't exist yet)
select count(*) as existing_directory_media_objects from storage.objects where bucket_id = 'directory-media';


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- Public bucket: media assets are rendered on published/embedded entry
-- pages for anonymous visitors via getPublicUrl() once publishing exists
-- (a later phase), same reasoning as map-pins. 5MB covers a reasonably
-- sized photo upload; the app itself should cap tighter for UX, this is
-- just the hard backstop.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'directory-media',
  'directory-media',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
);

-- Public read — required for anonymous visitors on published entry pages later.
create policy "directory-media public read"
  on storage.objects for select
  using (bucket_id = 'directory-media');

-- Any authenticated user may upload/replace/remove objects in this bucket.
-- Same trust model as map-pins: the dashboard routes that call these
-- uploads are themselves gated by Postgres RLS on directories/directory_entries
-- — this policy does not additionally scope by directory ownership at the
-- storage layer (same known, documented gap as map-pins, not new here).
create policy "directory-media authenticated write"
  on storage.objects for insert
  with check (bucket_id = 'directory-media' and auth.role() = 'authenticated');

create policy "directory-media authenticated update"
  on storage.objects for update
  using (bucket_id = 'directory-media' and auth.role() = 'authenticated');

create policy "directory-media authenticated delete"
  on storage.objects for delete
  using (bucket_id = 'directory-media' and auth.role() = 'authenticated');


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'directory-media' and public = true) then
    raise exception 'VERIFY FAILED: directory-media bucket was not created as public';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'directory-media %') <> 4 then
    raise exception 'VERIFY FAILED: expected 4 directory-media policies on storage.objects';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Confirm no existing objects were affected (there should be none — the bucket was just created)
select count(*) as directory_media_objects_after from storage.objects where bucket_id = 'directory-media';
