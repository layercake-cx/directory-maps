-- ============================================================
-- Rollback: 20260824123000_gate_custom_domain_entitlement
-- Reverses: drops resolve_custom_domain_entitlement() and deletes the
--           maps.custom_domain features row (cascades to its
--           plan_features/client_overrides rows via the existing FK).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'custom_domain') then
    raise exception 'ABORT: nothing to roll back — features.maps.custom_domain does not exist';
  end if;

  if exists (
    select 1 from public.client_overrides ov
    join public.features f on f.id = ov.feature_id
    where f.product_key = 'maps' and f.key = 'custom_domain'
    limit 1
  ) then
    raise exception
      'ABORT: per-client overrides exist for maps.custom_domain. '
      'Record which clients were granted which overrides before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.resolve_custom_domain_entitlement(text);

delete from public.features where product_key = 'maps' and key = 'custom_domain';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.features where product_key = 'maps' and key = 'custom_domain') then
    raise exception 'ROLLBACK VERIFY FAILED: features.maps.custom_domain still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'resolve_custom_domain_entitlement') then
    raise exception 'ROLLBACK VERIFY FAILED: resolve_custom_domain_entitlement still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
