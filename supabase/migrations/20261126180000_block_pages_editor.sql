-- ============================================================
-- Migration: 20261126180000_block_pages_editor
-- Description: Phase 4 of block-based page editing (the admin editor).
--              1. promote_page_block_to_template(): an admin turns a block
--                 on a page into a reusable template in the directory
--                 library and links the page's block to it ("Save as
--                 template" in the editor).
--              2. A trigger that stamps every auto_add template onto a newly
--                 created entry or content page (converting the page first so
--                 it keeps its standard content). It is a no-op for any
--                 directory without an auto_add template, and any error in it
--                 is swallowed with a warning so creating an entry or page can
--                 never fail because of blocks (these tables also serve maps
--                 created from a directory, and CSV imports).
-- Affected tables: directory_block_templates, directory_page_blocks (rows);
--                  triggers on directory_entries and directory_content_pages.
-- Rollback: _20261126180000_block_pages_editor.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-26
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste everything between "THE MIGRATION" and "POST-MIGRATION VERIFICATION" here>
--   ROLLBACK;
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'save_block_template') then
    raise exception 'ABORT: save_block_template() does not exist — apply 20261126140000_block_pages_api.sql first';
  end if;
  if exists (select 1 from pg_proc where proname in ('promote_page_block_to_template', 'stamp_auto_add_block_templates')) then
    raise exception 'ABORT: phase 4 functions already exist — migration may have already run';
  end if;
end $$;

select 'directory_entries' as tbl, count(*) as rows from public.directory_entries union all
select 'directory_content_pages', count(*) from public.directory_content_pages union all
select 'directory_page_blocks', count(*) from public.directory_page_blocks
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create or replace function public.promote_page_block_to_template(
  p_block_id uuid,
  p_name text,
  p_lock_position boolean default false,
  p_lock_content boolean default false,
  p_placement text default 'end',
  p_auto_add boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.directory_page_blocks%rowtype;
  v_page_id text;
  v_tid uuid;
begin
  select * into v_b from public.directory_page_blocks where id = p_block_id;
  if not found then
    raise exception 'Block not found';
  end if;
  perform public.require_directory_admin(v_b.directory_id);
  if v_b.template_id is not null then
    raise exception 'This block already comes from a template';
  end if;
  if v_b.data is null then
    raise exception 'This block has no content to save';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'A template needs a name';
  end if;
  perform public.assert_block_valid(v_b.page_kind, v_b.region, v_b.block_type, v_b.data, v_b.common);

  insert into public.directory_block_templates (
    directory_id, page_kind, name, block_type, region, data, common,
    lock_position, lock_content, placement, auto_add, created_by
  ) values (
    v_b.directory_id, v_b.page_kind, trim(p_name), v_b.block_type, v_b.region, v_b.data, v_b.common,
    p_lock_position, p_lock_content, p_placement, p_auto_add, auth.uid()
  ) returning id into v_tid;

  -- The page's block now follows the template (data null = linked) and carries its locks.
  update public.directory_page_blocks
     set template_id = v_tid, data = null, lock_position = p_lock_position, lock_content = p_lock_content, updated_by = auth.uid()
   where id = p_block_id;

  v_page_id := coalesce(v_b.entry_id, v_b.content_page_id);
  perform public.normalise_block_region(v_b.page_kind, v_page_id, v_b.region);
  perform public.touch_block_page(v_b.page_kind, v_page_id, null);
  return v_tid;
end;
$$;

comment on function public.promote_page_block_to_template(uuid, text, boolean, boolean, text, boolean) is
  'Directory admins only. Saves a page block''s content as a new library template and links the block to it.';

-- Stamps auto_add templates onto a page that was just created.
create or replace function public.stamp_auto_add_block_templates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := case when tg_table_name = 'directory_entries' then 'entry' else 'content_page' end;
  v_t record;
  v_region text;
begin
  -- Cheap exit for every directory that has no auto_add template (the normal case).
  if not exists (
    select 1 from public.directory_block_templates t
    where t.directory_id = new.directory_id and t.auto_add and t.page_kind = v_kind
  ) then
    return new;
  end if;

  begin
    if v_kind = 'entry' then
      perform public.convert_entry_to_blocks(new.id);
    else
      perform public.convert_content_page_to_blocks(new.id);
    end if;

    for v_t in
      select * from public.directory_block_templates t
      where t.directory_id = new.directory_id and t.auto_add and t.page_kind = v_kind
      order by t.created_at, t.id
    loop
      insert into public.directory_page_blocks (
        directory_id, page_kind, entry_id, content_page_id, region, position, block_type,
        template_id, data, common, lock_position, lock_content
      ) values (
        new.directory_id, v_kind,
        case when v_kind = 'entry' then new.id end,
        case when v_kind = 'content_page' then new.id end,
        v_t.region, case when v_t.placement = 'start' then -1 else 1000000 end, v_t.block_type,
        v_t.id, null, v_t.common, v_t.lock_position, v_t.lock_content
      )
      on conflict do nothing;
    end loop;

    for v_region in select unnest(array['hero', 'main', 'sidebar']) loop
      perform public.normalise_block_region(v_kind, new.id, v_region);
    end loop;
  exception when others then
    raise warning 'block auto-add failed for % %: %', v_kind, new.id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger directory_entries_stamp_auto_add_blocks
  after insert on public.directory_entries
  for each row execute function public.stamp_auto_add_block_templates();
create trigger directory_content_pages_stamp_auto_add_blocks
  after insert on public.directory_content_pages
  for each row execute function public.stamp_auto_add_block_templates();

revoke all on function public.promote_page_block_to_template(uuid, text, boolean, boolean, text, boolean) from public, anon;
grant execute on function public.promote_page_block_to_template(uuid, text, boolean, boolean, text, boolean) to authenticated;
revoke all on function public.stamp_auto_add_block_templates() from public, anon, authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if (select count(*) from pg_trigger where tgname in ('directory_entries_stamp_auto_add_blocks', 'directory_content_pages_stamp_auto_add_blocks') and not tgisinternal) <> 2 then
    raise exception 'VERIFY FAILED: expected 2 auto-add triggers';
  end if;
  if not has_function_privilege('authenticated', 'public.promote_page_block_to_template(uuid,text,boolean,boolean,text,boolean)', 'execute') then
    raise exception 'VERIFY FAILED: promote_page_block_to_template must be callable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.promote_page_block_to_template(uuid,text,boolean,boolean,text,boolean)', 'execute') then
    raise exception 'VERIFY FAILED: promote_page_block_to_template must not be callable by anon';
  end if;
  if has_function_privilege('authenticated', 'public.stamp_auto_add_block_templates()', 'execute') then
    raise exception 'VERIFY FAILED: the trigger function must not be directly callable';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select 'directory_entries' as tbl, count(*) as rows from public.directory_entries union all
select 'directory_content_pages', count(*) from public.directory_content_pages union all
select 'directory_page_blocks', count(*) from public.directory_page_blocks
order by tbl;
-- Expected: identical to the pre-migration counts (nothing is stamped until a template has auto_add).
