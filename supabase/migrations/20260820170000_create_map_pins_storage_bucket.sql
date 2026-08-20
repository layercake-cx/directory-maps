-- ============================================================
-- Migration: 20260820170000_create_map_pins_storage_bucket
-- Description: Creates the "map-pins" Supabase Storage bucket. The app
--              already calls supabase.storage.from("map-pins") for two
--              existing upload flows (Search panel logo upload, and the
--              custom pin icon upload just wired up) in both
--              AdminMapDashboard.jsx and ClientMapDashboard.jsx — but
--              the bucket itself was never created on either the test
--              project (beqejxneehilplrtpntn) or production
--              (gxixwdjfmegxcxfeflro). Confirmed via a read-only
--              GET /storage/v1/bucket/map-pins on both projects: both
--              return 404 "Bucket not found". This means logo upload
--              has been broken in production all along, not just the
--              new custom-icon feature.
-- Affected: storage.buckets, storage.objects (RLS policies)
-- Rollback: 20260820170000_create_map_pins_storage_bucket.rollback.sql
-- Author: Claude (agent)
-- Date: 2026-08-20
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
  if exists (select 1 from storage.buckets where id = 'map-pins') then
    raise exception 'ABORT: bucket "map-pins" already exists — this migration may have already run';
  end if;
end $$;

-- B) Row count — inspect before proceeding (expect 0 objects under map-pins, since the bucket doesn't exist yet)
select count(*) as existing_map_pins_objects from storage.objects where bucket_id = 'map-pins';


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- Public bucket: pin icons and logos are rendered on published/embedded
-- maps for anonymous visitors via getPublicUrl(), so object reads must
-- be unauthenticated. 500KB covers the largest current use (logo
-- upload, app-level-capped at 500KB); pin icon uploads are separately
-- capped at 200KB by the app itself.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'map-pins',
  'map-pins',
  true,
  512000,
  array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']
);

-- Public read — required for anonymous visitors on published embeds.
create policy "map-pins public read"
  on storage.objects for select
  using (bucket_id = 'map-pins');

-- Any authenticated user may upload/replace/remove objects in this
-- bucket. This mirrors the app's existing trust model (the dashboard
-- routes that call these uploads are themselves gated by Postgres RLS
-- on maps/clients — this policy does not additionally scope by map
-- ownership at the storage layer). Flagged as a follow-up to tighten
-- later, not attempted here to keep this migration to the one fix
-- that's actually blocking today.
create policy "map-pins authenticated write"
  on storage.objects for insert
  with check (bucket_id = 'map-pins' and auth.role() = 'authenticated');

create policy "map-pins authenticated update"
  on storage.objects for update
  using (bucket_id = 'map-pins' and auth.role() = 'authenticated');

create policy "map-pins authenticated delete"
  on storage.objects for delete
  using (bucket_id = 'map-pins' and auth.role() = 'authenticated');


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'map-pins' and public = true) then
    raise exception 'VERIFY FAILED: map-pins bucket was not created as public';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'map-pins %') <> 4 then
    raise exception 'VERIFY FAILED: expected 4 map-pins policies on storage.objects';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Confirm no existing objects were affected (there should be none — the bucket was just created)
select count(*) as map_pins_objects_after from storage.objects where bucket_id = 'map-pins';
