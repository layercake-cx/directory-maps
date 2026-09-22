-- ============================================================
-- Rollback: 20260923120000_seed_claims_feature_flag
-- Reverses: deletes the 'claims' feature_flags row (cascades to any
--           feature_flag_overrides rows via the existing FK).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.feature_flags where key = 'claims'
  ) then
    raise exception 'ABORT: nothing to roll back — feature_flags.claims does not exist';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

delete from public.feature_flags where key = 'claims';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.feature_flags where key = 'claims'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: feature_flags.claims still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
