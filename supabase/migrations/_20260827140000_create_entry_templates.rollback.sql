-- ============================================================
-- Rollback: 20260827140000_create_entry_templates
-- Reverses: creation of entry_templates
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_templates') then
    raise exception 'ABORT: entry_templates does not exist — nothing to roll back';
  end if;

  if exists (select 1 from public.entry_templates) then
    raise exception 'ABORT: entry_templates has rows — a real layout has been designed. Export it before rolling back. To override, remove this check and re-run.';
  end if;
end $$;

drop table public.entry_templates;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_templates') then
    raise exception 'ROLLBACK VERIFY FAILED: entry_templates still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
