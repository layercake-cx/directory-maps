-- ============================================================
-- Rollback: 20260821140000_seed_ai_search_feature_flag
-- Reverses: deletes the 'ai_search' feature_flags row (cascades to any
--           feature_flag_overrides rows via the existing FK on delete cascade).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.feature_flags where key = 'ai_search'
  ) then
    raise exception 'ABORT: nothing to roll back — feature_flags.ai_search does not exist';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

delete from public.feature_flags where key = 'ai_search';


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.feature_flags where key = 'ai_search'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: feature_flags.ai_search still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
