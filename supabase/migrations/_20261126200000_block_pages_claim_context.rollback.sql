-- ============================================================
-- Rollback: 20261126200000_block_pages_claim_context
-- Reverses: drops get_claim_block_context(). No data is touched.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'get_claim_block_context') then
    raise exception 'ABORT: get_claim_block_context does not exist — nothing to roll back';
  end if;
end $$;

drop function if exists public.get_claim_block_context(uuid);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'get_claim_block_context') then
    raise exception 'ROLLBACK VERIFY FAILED: get_claim_block_context still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
