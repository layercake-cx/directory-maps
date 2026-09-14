-- ============================================================
-- Rollback: 20260914190000_recover_industry_sector_categorisation
-- Reverses: the recovered "industry_sector" categorisation, its 42 terms,
--           its directory attachment, and every entry_category_terms row
--           tagging it — all via cascade delete from the one categorisations
--           row (category_terms.categorisation_id, categorisation_attachments
--           .categorisation_id, and entry_category_terms.term_id ->
--           category_terms.id all reference on delete cascade).
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from public.categorisations
    where client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and key = 'industry_sector'
  ) then
    raise exception 'ABORT: industry_sector categorisation does not exist — nothing to roll back';
  end if;
end $$;

-- THE ROLLBACK
delete from public.categorisations
where client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and key = 'industry_sector';

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from public.categorisations
    where client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and key = 'industry_sector'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: industry_sector categorisation still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: industry_sector categorisation, its terms, attachment and entry tags removed';
end $$;
