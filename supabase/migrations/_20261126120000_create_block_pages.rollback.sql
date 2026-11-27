-- ============================================================
-- Rollback: 20261126120000_create_block_pages
-- Reverses: the block template and block instance tables, their policies,
--           triggers and the three converter functions.
-- Safe only while nothing authored by a person lives in them: it refuses if
-- any template exists or any instance is not an untouched conversion.
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_page_blocks') then
    raise exception 'ABORT: directory_page_blocks does not exist — nothing to roll back';
  end if;
  if exists (select 1 from public.directory_block_templates limit 1) then
    raise exception 'ABORT: directory_block_templates has rows — back them up (create table ..._backup_YYYYMMDD as select *) before rolling back';
  end if;
  if exists (
    select 1 from public.directory_page_blocks
    where converted_from is null or updated_at > created_at
    limit 1
  ) then
    raise exception 'ABORT: directory_page_blocks has blocks created or edited in the editor — back them up before rolling back';
  end if;
end $$;

-- THE ROLLBACK
drop function if exists public.convert_directory_to_blocks(text);
drop function if exists public.convert_content_page_to_blocks(text);
drop function if exists public.convert_entry_to_blocks(text);

drop table if exists public.directory_page_blocks;
drop table if exists public.directory_block_templates;

drop function if exists public.block_pages_touch_updated_at();

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name in ('directory_block_templates', 'directory_page_blocks')) then
    raise exception 'ROLLBACK VERIFY FAILED: a block pages table still exists';
  end if;
  if exists (select 1 from pg_proc where proname in ('convert_entry_to_blocks', 'convert_content_page_to_blocks', 'convert_directory_to_blocks', 'block_pages_touch_updated_at')) then
    raise exception 'ROLLBACK VERIFY FAILED: a block pages function still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
