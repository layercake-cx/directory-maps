-- ============================================================
-- Rollback: 20260829020000_create_listing_category_terms
-- Reverts: drops listing_category_terms entirely (and its RLS policies via
--          cascade) and removes categorisations.applies_to_listings.
--          map_filter_fields/listing_filter_values/categorisations/
--          category_terms/entry_category_terms are untouched by this
--          rollback.
-- ============================================================

drop table if exists public.listing_category_terms;

alter table public.categorisations
  drop column if exists applies_to_listings;

-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_category_terms') then
    raise exception 'ROLLBACK VERIFY FAILED: listing_category_terms still exists';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to_listings') then
    raise exception 'ROLLBACK VERIFY FAILED: categorisations.applies_to_listings still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
