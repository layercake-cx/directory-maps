-- ============================================================
-- Rollback: 20260822220000_gate_directory_pages_entitlement
-- Reverses: drops resolve_directory_pages_entitlement() and deletes the
--           maps.directory_pages features row (cascades to its
--           plan_features/client_overrides rows via the existing FK).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.features where product_key = 'maps' and key = 'directory_pages') then
    raise exception 'ABORT: nothing to roll back — features.maps.directory_pages does not exist';
  end if;

  if exists (
    select 1 from public.client_overrides ov
    join public.features f on f.id = ov.feature_id
    where f.product_key = 'maps' and f.key = 'directory_pages'
    limit 1
  ) then
    raise exception
      'ABORT: per-client overrides exist for maps.directory_pages. '
      'Record which clients were granted which overrides before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.resolve_directory_pages_entitlement(text);

delete from public.features where product_key = 'maps' and key = 'directory_pages';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.features where product_key = 'maps' and key = 'directory_pages') then
    raise exception 'ROLLBACK VERIFY FAILED: features.maps.directory_pages still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'resolve_directory_pages_entitlement') then
    raise exception 'ROLLBACK VERIFY FAILED: resolve_directory_pages_entitlement still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
