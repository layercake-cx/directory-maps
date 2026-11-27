-- ============================================================
-- Rollback: 20261127150000_page_publish_preflight
-- Reverses: drops page_publish_preflight(). No data is touched.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'page_publish_preflight') then
    raise exception 'ABORT: page_publish_preflight does not exist — nothing to roll back';
  end if;
end $$;

drop function if exists public.page_publish_preflight(text, text, text);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'page_publish_preflight') then
    raise exception 'ROLLBACK VERIFY FAILED: page_publish_preflight still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
