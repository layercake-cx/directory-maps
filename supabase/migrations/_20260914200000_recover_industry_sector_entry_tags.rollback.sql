-- ============================================================
-- Rollback: 20260914200000_recover_industry_sector_entry_tags
-- Reverses: entry_category_terms rows tagging entries with an Industry
--           Sector term — leaves the categorisation/terms/attachment
--           from 20260914190000 intact (roll that back separately if the
--           whole recovery should be undone).
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from public.entry_category_terms ect
    join public.category_terms ct on ct.id = ect.term_id
    join public.categorisations c on c.id = ct.categorisation_id
    where c.client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and c.key = 'industry_sector'
  ) then
    raise exception 'ABORT: no industry_sector entry tags exist — nothing to roll back';
  end if;
end $$;

-- THE ROLLBACK
delete from public.entry_category_terms ect
using public.category_terms ct, public.categorisations c
where ect.term_id = ct.id
  and ct.categorisation_id = c.id
  and c.client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72'
  and c.key = 'industry_sector';

-- POST-ROLLBACK VERIFICATION
do $$
declare
  v_remaining integer;
begin
  select count(*) into v_remaining from public.entry_category_terms ect
    join public.category_terms ct on ct.id = ect.term_id
    join public.categorisations c on c.id = ct.categorisation_id
    where c.client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and c.key = 'industry_sector';
  if v_remaining <> 0 then
    raise exception 'ROLLBACK VERIFY FAILED: % industry_sector entry tags still remain', v_remaining;
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: all industry_sector entry tags removed';
end $$;
