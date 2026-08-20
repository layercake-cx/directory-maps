-- ============================================================
-- Rollback: 20260820130000_rename_plan_display_names
-- Reverses: restores plans.name to its pre-rename values.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if (select name from public.plans where key = 'standard') <> 'Basic' then
    raise exception 'ABORT: plans.standard.name is not "Basic" — nothing to roll back, or already changed since';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

update public.plans set name = 'Standard'        where key = 'standard';
update public.plans set name = 'Premium'         where key = 'premium';
update public.plans set name = 'Unlimited'       where key = 'unlimited';
update public.plans set name = 'Founder Members' where key = 'founder';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if (select name from public.plans where key = 'standard') <> 'Standard' then
    raise exception 'ROLLBACK VERIFY FAILED: standard plan name was not restored';
  end if;
  if (select name from public.plans where key = 'premium') <> 'Premium' then
    raise exception 'ROLLBACK VERIFY FAILED: premium plan name was not restored';
  end if;
  if (select name from public.plans where key = 'unlimited') <> 'Unlimited' then
    raise exception 'ROLLBACK VERIFY FAILED: unlimited plan name was not restored';
  end if;
  if (select name from public.plans where key = 'founder') <> 'Founder Members' then
    raise exception 'ROLLBACK VERIFY FAILED: founder plan name was not restored';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select key, name from public.plans order by sort_order;
