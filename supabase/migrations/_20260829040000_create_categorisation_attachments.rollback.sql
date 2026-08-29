-- ============================================================
-- Rollback: 20260829040000_create_categorisation_attachments
-- Reverts: drops categorisation_attachments and listing_category_terms
--          entirely (including the backfilled attachment rows). Does not
--          touch categorisations.applies_to (unmodified by the forward
--          migration) or any other existing table.
-- ============================================================

drop table if exists public.categorisation_attachments;
drop table if exists public.listing_category_terms;

-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'categorisation_attachments') then
    raise exception 'ROLLBACK VERIFY FAILED: categorisation_attachments still exists';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_category_terms') then
    raise exception 'ROLLBACK VERIFY FAILED: listing_category_terms still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
