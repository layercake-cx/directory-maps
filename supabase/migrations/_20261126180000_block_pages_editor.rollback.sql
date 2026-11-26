-- ============================================================
-- Rollback: 20261126180000_block_pages_editor
-- Reverses: the auto-add triggers and the promote RPC. Touches no data;
-- blocks already stamped by the trigger stay where they are.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'promote_page_block_to_template') then
    raise exception 'ABORT: phase 4 functions do not exist — nothing to roll back';
  end if;
end $$;

drop trigger if exists directory_entries_stamp_auto_add_blocks on public.directory_entries;
drop trigger if exists directory_content_pages_stamp_auto_add_blocks on public.directory_content_pages;
drop function if exists public.stamp_auto_add_block_templates();
drop function if exists public.promote_page_block_to_template(uuid, text, boolean, boolean, text, boolean);

do $$
begin
  if exists (select 1 from pg_trigger where tgname like '%stamp_auto_add_blocks' and not tgisinternal) then
    raise exception 'ROLLBACK VERIFY FAILED: an auto-add trigger still exists';
  end if;
  if exists (select 1 from pg_proc where proname in ('promote_page_block_to_template', 'stamp_auto_add_block_templates')) then
    raise exception 'ROLLBACK VERIFY FAILED: a phase 4 function still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
