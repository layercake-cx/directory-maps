-- ============================================================
-- Rollback: 20260822200000_add_listings_slug
-- Reverses: drops the slug column + unique constraint, the insert trigger,
--           and the three helper functions.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'listings' and column_name = 'slug'
  ) then
    raise exception 'ABORT: nothing to roll back — listings.slug does not exist';
  end if;
end $$;

select 'listings' as tbl, count(*) as rows from public.listings;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop trigger if exists trg_set_listing_slug on public.listings;
drop function if exists public.set_listing_slug();
drop function if exists public.generate_unique_listing_slug(text, text, text);
drop function if exists public.slugify_text(text);

alter table public.listings drop constraint if exists listings_map_id_slug_key;
alter table public.listings drop column if exists slug;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'listings' and column_name = 'slug'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: listings.slug still exists';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_set_listing_slug') then
    raise exception 'ROLLBACK VERIFY FAILED: trg_set_listing_slug still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select 'listings' as tbl, count(*) as rows from public.listings;
