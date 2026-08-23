-- ============================================================
-- Rollback: 20260822210000_seed_directory_pages_feature_flag
-- Reverses: deletes the 'directory_pages' feature_flags row (cascades to
--           any feature_flag_overrides rows via the existing FK).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.feature_flags where key = 'directory_pages'
  ) then
    raise exception 'ABORT: nothing to roll back — feature_flags.directory_pages does not exist';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

delete from public.feature_flags where key = 'directory_pages';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.feature_flags where key = 'directory_pages'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: feature_flags.directory_pages still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
