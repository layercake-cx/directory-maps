-- ============================================================
-- ROLLBACK: 20261006120000_ai_usage_summary
-- Drops the usage-summary function. No table data is touched.
-- ============================================================

drop function if exists public.get_ai_usage_summary(text, timestamptz, timestamptz, text, text);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'get_ai_usage_summary') then
    raise exception 'ROLLBACK FAILED: function still present';
  end if;
  raise notice 'ROLLBACK VERIFIED';
end $$;
