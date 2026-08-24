-- ============================================================
-- Rollback: 20260824122000_seed_custom_domain_feature_flag
-- Reverses: deletes the 'custom_domain' feature_flags row (cascades to
--           any feature_flag_overrides rows via the existing FK).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.feature_flags where key = 'custom_domain'
  ) then
    raise exception 'ABORT: nothing to roll back — feature_flags.custom_domain does not exist';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

delete from public.feature_flags where key = 'custom_domain';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.feature_flags where key = 'custom_domain'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: feature_flags.custom_domain still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
