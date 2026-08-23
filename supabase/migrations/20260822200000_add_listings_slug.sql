-- ============================================================
-- Migration: 20260822200000_add_listings_slug
-- Description: Foundational schema for Epic 3 (Directory & LLM/Search
--              Discoverability). Adds a url-safe, per-map-unique slug to
--              every listing, needed for the new canonical per-listing
--              public URLs this epic introduces.
--
--              Listings are created through many pathways (manual entry,
--              CSV import, Google Sheets sync, admin bulk edit) — rather
--              than touch every one of those code paths to compute a slug,
--              this migration makes slug generation a DB-level concern:
--                - slugify_text(): pure lowercase/hyphenate helper.
--                - generate_unique_listing_slug(): derives a slug from the
--                  listing's name, appending -2/-3/... on collision within
--                  the same map (slugs are unique per map_id, not globally
--                  — two different maps can each have a "the-lodge").
--                - set_listing_slug() trigger: BEFORE INSERT, only fills
--                  slug when the caller didn't already provide one, so
--                  nothing needs to change in any existing insert path.
--              Existing listings are backfilled in this same migration
--              (processed one at a time in a stable order so collisions
--              within a map resolve deterministically), then slug is
--              constrained NOT NULL + UNIQUE per map_id.
--
--              This migration does NOT add slug-based routing, entitlement
--              gating, or public read access — those are separate
--              migrations/PRs. This is schema only.
-- Affected tables: listings (new column + trigger)
-- Rollback: _20260822200000_add_listings_slug.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-22
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listings'
  ) then
    raise exception 'ABORT: table public.listings does not exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'listings' and column_name = 'slug'
  ) then
    raise exception 'ABORT: listings.slug already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select 'listings' as tbl, count(*) as rows from public.listings;
-- Save this output. You will compare it to the post-migration count (must be unchanged).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create or replace function public.slugify_text(input text)
returns text
language sql
immutable
as $$
  select nullif(trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g')), '');
$$;

comment on function public.slugify_text(text) is
  'Lowercases, strips non-alphanumerics to single hyphens, trims edge hyphens. Returns null for empty/all-punctuation input.';

create or replace function public.generate_unique_listing_slug(p_map_id text, p_name text, p_exclude_id text default null)
returns text
language plpgsql
as $$
declare
  base_slug text;
  candidate text;
  suffix integer := 1;
begin
  base_slug := coalesce(public.slugify_text(p_name), 'listing');
  candidate := base_slug;
  while exists (
    select 1 from public.listings
    where map_id = p_map_id and slug = candidate
      and (p_exclude_id is null or id <> p_exclude_id)
  ) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;
  return candidate;
end;
$$;

comment on function public.generate_unique_listing_slug(text, text, text) is
  'Derives a url-safe slug from a listing name, appending -2/-3/... to resolve collisions within the same map_id. Slugs are unique per map, not globally.';

-- BEFORE INSERT so any pathway (manual entry, CSV import, Sheets sync,
-- bulk admin operations) gets a slug without needing its own code changes.
-- Only fills in when the caller didn't already supply one.
create or replace function public.set_listing_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generate_unique_listing_slug(new.map_id, new.name, new.id);
  end if;
  return new;
end;
$$;

comment on function public.set_listing_slug() is
  'BEFORE INSERT hook on public.listings. Auto-fills slug from name when not already provided by the caller.';

alter table public.listings add column slug text null;

drop trigger if exists trg_set_listing_slug on public.listings;
create trigger trg_set_listing_slug
  before insert on public.listings
  for each row
  execute function public.set_listing_slug();

-- Backfill existing listings, one at a time in a stable order, so
-- collisions within a map resolve deterministically (alphabetical by name,
-- ties broken by id).
do $$
declare
  r record;
begin
  for r in
    select id, map_id, name from public.listings where slug is null order by map_id, name, id
  loop
    update public.listings
    set slug = public.generate_unique_listing_slug(r.map_id, r.name, r.id)
    where id = r.id;
  end loop;
end $$;

alter table public.listings alter column slug set not null;
alter table public.listings add constraint listings_map_id_slug_key unique (map_id, slug);

comment on column public.listings.slug is
  'Url-safe, per-map-unique slug for this listing''s canonical public URL (Epic 3). Auto-generated from name on insert if not supplied; never auto-changed afterward.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'listings' and column_name = 'slug'
  ) then
    raise exception 'VERIFY FAILED: listings.slug was not created';
  end if;
  if exists (select 1 from public.listings where slug is null) then
    raise exception 'VERIFY FAILED: some listings still have a null slug';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'listings_map_id_slug_key'
  ) then
    raise exception 'VERIFY FAILED: listings_map_id_slug_key unique constraint was not created';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_set_listing_slug'
  ) then
    raise exception 'VERIFY FAILED: trg_set_listing_slug was not created';
  end if;
  raise notice 'VERIFY PASSED: listings.slug backfilled, constrained, and auto-generating on insert';
end $$;

-- Row count — must be unchanged from pre-migration
select 'listings' as tbl, count(*) as rows from public.listings;

-- Duplicate check — must return 0 (the unique constraint above would already
-- have blocked the migration if this weren't true, but confirm explicitly)
select map_id, slug, count(*) from public.listings group by map_id, slug having count(*) > 1;
