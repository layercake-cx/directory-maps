-- ============================================================
-- Migration: 20261127120000_block_pages_notes_sync
-- Description: Notes written after an entry is converted to blocks must not be
--              ignored. AI content generation, CSV import and version restore
--              all write directory_entries.notes_html; once a page uses blocks
--              the page renders the blocks, so those writes had no effect.
--              1. block_notes_body(): the one definition of how notes_html
--                 becomes a text block body (plain text is escaped into a
--                 paragraph, as the page always did).
--              2. convert_entry_to_blocks(): every converted entry now gets a
--                 notes block, even when its notes are empty (an empty block
--                 renders nothing). It is the place later notes land in.
--                 Without it, entries converted before AI fills them, the main
--                 use of AI enrichment, would have nowhere to put the text.
--              3. A BEFORE UPDATE trigger on directory_entries, fired only when
--                 notes_html or allow_html changes: it refreshes the entry's
--                 converted notes block IF NOBODY HAS EDITED IT. "Not edited"
--                 means the block's text still equals what conversion would
--                 have produced from the OLD notes (a comparison of content,
--                 not of timestamps, because reordering blocks also bumps
--                 updated_at). Once a person edits the block it is theirs and
--                 later writes leave it alone, as does an entry whose notes
--                 block was removed on purpose. When it refreshes, it also
--                 bumps the entry's updated_at so the next publish rebuilds the
--                 page. Any error in it is swallowed with a warning, so a
--                 notes save (including bulk AI jobs and imports) can never
--                 fail because of blocks.
--              Entries converted earlier that have no notes block are not
--              changed.
-- Affected tables: directory_entries (trigger), directory_page_blocks (rows)
-- Rollback: _20261127120000_block_pages_notes_sync.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-27
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste everything between "THE MIGRATION" and "POST-MIGRATION VERIFICATION" here>
--   ROLLBACK;
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'convert_entry_to_blocks')
     or pg_get_functiondef('public.convert_entry_to_blocks(text)'::regprocedure) not like '%v_notes_done%' then
    raise exception 'ABORT: apply 20261127100000_block_pages_preserve_notes.sql first';
  end if;
  if exists (select 1 from pg_proc where proname in ('block_notes_body', 'sync_converted_notes_block')) then
    raise exception 'ABORT: notes sync already exists — migration may have already run';
  end if;
end $$;

select 'directory_entries' as tbl, count(*) as rows from public.directory_entries union all
select 'directory_page_blocks', count(*) from public.directory_page_blocks
order by tbl;

-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create or replace function public.block_notes_body(p_notes text, p_allow_html boolean)
returns text
language sql
immutable
as $$
  select case
    when p_notes is null or trim(p_notes) = '' then ''
    when coalesce(p_allow_html, false) then p_notes
    else '<p>' || replace(replace(replace(p_notes, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>'
  end;
$$;

comment on function public.block_notes_body(text, boolean) is
  'How an entry''s notes_html becomes the body of a text block: HTML as is when allow_html, otherwise plain text escaped into one paragraph. Empty notes give an empty body.';

create or replace function public.convert_entry_to_blocks(p_entry_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.directory_entries%rowtype;
  v_layout jsonb;
  v_source text := 'entry_template';
  v_el jsonb;
  v_ord bigint;
  v_type text;
  v_new_type text;
  v_data jsonb;
  v_pos integer := 0;
  v_count integer := 0;
  v_body text;
  v_notes_done boolean := false;
  v_implicit constant jsonb := '[{"type":"hero"},{"type":"heading"},{"type":"address_map"},{"type":"contact_details"},{"type":"accreditations"},{"type":"notes_html"},{"type":"gallery"},{"type":"evidence"},{"type":"product_tiles"},{"type":"links"}]'::jsonb;
begin
  select * into v_entry from public.directory_entries where id = p_entry_id;
  if not found then
    raise exception 'entry % not found', p_entry_id;
  end if;

  -- Idempotent: a page that already has instances is left alone.
  if exists (select 1 from public.directory_page_blocks where entry_id = p_entry_id) then
    return 0;
  end if;

  -- 1. template targeting one of the entry's category terms
  select t.layout_json into v_layout
  from public.entry_templates t
  join public.entry_category_terms ect on ect.term_id = t.applies_to_term_id and ect.entry_id = p_entry_id
  join public.category_terms ct on ct.id = t.applies_to_term_id
  where t.directory_id = v_entry.directory_id
  order by ct.sort_order, ct.id
  limit 1;

  -- 2. template targeting the entry's group
  if v_layout is null and v_entry.directory_group_id is not null then
    select t.layout_json into v_layout
    from public.entry_templates t
    where t.directory_id = v_entry.directory_id and t.applies_to_group_id = v_entry.directory_group_id
    limit 1;
  end if;

  -- 3. the directory default
  if v_layout is null then
    select t.layout_json into v_layout
    from public.entry_templates t
    where t.directory_id = v_entry.directory_id and t.is_default
    limit 1;
  end if;

  -- 4. implicit pre-DIR-E6 order (also when entry_templates has rows but none apply)
  if v_layout is null then
    v_layout := v_implicit;
    v_source := 'implicit_layout';
  end if;

  -- Hero region
  insert into public.directory_page_blocks (directory_id, page_kind, entry_id, region, position, block_type, data, converted_from)
  values (v_entry.directory_id, 'entry', p_entry_id, 'hero', 0, 'entry_hero', '{}'::jsonb, 'fixed_chrome');
  v_count := v_count + 1;

  -- Main region, in layout order
  for v_el, v_ord in select value, ordinality from jsonb_array_elements(v_layout) with ordinality loop
    v_type := v_el->>'type';
    if coalesce((v_el->>'hidden')::boolean, false) then
      continue;
    end if;
    v_data := case when coalesce(v_el->>'label', '') <> '' then jsonb_build_object('title', v_el->>'label') else '{}'::jsonb end;

    if v_type = 'notes_html' then
      -- The body is stored the way the page
      -- renders it (plain text is escaped into a paragraph, as builders.ts does).
      v_body := public.block_notes_body(v_entry.notes_html, v_entry.allow_html);
      v_new_type := 'rich';
      v_data := v_data || jsonb_build_object('body', v_body, 'style', 'normal');
    elsif v_type = 'hero' then v_new_type := 'entry_hero_image';
    elsif v_type = 'gallery' then v_new_type := 'entry_gallery';
    elsif v_type = 'accreditations' then v_new_type := 'entry_accreditations';
    elsif v_type = 'evidence' then v_new_type := 'entry_evidence';
    elsif v_type = 'product_tiles' then v_new_type := 'entry_product_tiles';
    elsif v_type = 'links' then v_new_type := 'entry_links';
    elsif v_type = 'categorisation' then
      v_new_type := 'entry_categorisation';
      v_data := v_data || jsonb_build_object('key', v_el->>'key');
    else
      -- logo / heading / address_map / contact_details (no-ops today) and
      -- any unknown type: nothing to carry over.
      continue;
    end if;

    v_pos := v_pos + 1;
    insert into public.directory_page_blocks (directory_id, page_kind, entry_id, region, position, block_type, data, converted_from)
    values (
      v_entry.directory_id, 'entry', p_entry_id, 'main', v_pos, v_new_type, v_data,
      case when v_type = 'notes_html' then 'notes_html' else v_source end
    );
    if v_type = 'notes_html' then
      v_notes_done := true;
    end if;
    v_count := v_count + 1;
  end loop;

  -- notes_html is never lost, and every converted entry has a notes block for later notes to land in (an empty one
  -- renders nothing). If the page's layout left the notes block out or hid it, the page did not show the text;
  -- keep it as a HIDDEN text block at the end of the main region so converting does not publish it, and an
  -- editor can reveal it by changing the block's Visibility.
  if not v_notes_done then
    v_body := public.block_notes_body(v_entry.notes_html, v_entry.allow_html);
    v_pos := v_pos + 1;
    insert into public.directory_page_blocks (directory_id, page_kind, entry_id, region, position, block_type, data, common, converted_from)
    values (v_entry.directory_id, 'entry', p_entry_id, 'main', v_pos, 'rich',
            jsonb_build_object('body', v_body, 'style', 'normal'), '{"visibility":"hidden"}'::jsonb, 'notes_html');
    v_count := v_count + 1;
  end if;

  -- Sidebar region: the fixed panels, in today's order
  insert into public.directory_page_blocks (directory_id, page_kind, entry_id, region, position, block_type, data, converted_from)
  select v_entry.directory_id, 'entry', p_entry_id, 'sidebar', s.ord, s.btype, '{}'::jsonb, 'fixed_chrome'
  from (values (1, 'entry_contact_panel'), (2, 'entry_map_card'), (3, 'entry_attributes'), (4, 'entry_tag_chips')) as s(ord, btype);
  v_count := v_count + 4;

  return v_count;
end;
$$;

comment on function public.convert_entry_to_blocks(text) is
  'Idempotent. Turns an entry''s current page (resolved entry_templates layout, notes_html, the fixed hero and sidebar panels) into directory_page_blocks rows. Every entry gets a notes block: visible when the layout showed notes, otherwise hidden; empty when there are no notes. Returns the number inserted; 0 if the entry already has blocks. Not invoked by any migration. Service role only.';

revoke all on function public.convert_entry_to_blocks(text) from public, anon, authenticated;
grant execute on function public.convert_entry_to_blocks(text) to service_role;

create or replace function public.sync_converted_notes_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_old_body text;
  v_new_body text;
begin
  begin
    v_old_body := public.block_notes_body(old.notes_html, old.allow_html);
    v_new_body := public.block_notes_body(new.notes_html, new.allow_html);
    if v_old_body is distinct from v_new_body then
      -- The block is unedited while its text is still what conversion made from the old notes.
      select b.id into v_id
      from public.directory_page_blocks b
      where b.entry_id = new.id
        and b.converted_from = 'notes_html'
        and b.block_type = 'rich'
        and b.template_id is null
        and b.data is not null
        and coalesce(b.data ->> 'body', '') = v_old_body
      order by b.created_at, b.id
      limit 1;
      if v_id is not null then
        update public.directory_page_blocks
           set data = jsonb_set(data, '{body}', to_jsonb(v_new_body))
         where id = v_id;
        new.updated_at := now();
      end if;
    end if;
  exception when others then
    raise warning 'notes block sync failed for entry %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

comment on function public.sync_converted_notes_block() is
  'Keeps a converted entry''s untouched notes block in step with notes_html. Never raises.';

revoke all on function public.sync_converted_notes_block() from public, anon, authenticated;

create trigger directory_entries_sync_notes_block
  before update of notes_html, allow_html on public.directory_entries
  for each row
  when (old.notes_html is distinct from new.notes_html or old.allow_html is distinct from new.allow_html)
  execute function public.sync_converted_notes_block();

-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
declare
  v_e text;
  v_notes text;
  v_allow boolean;
  v_body text;
  v_found boolean := false;
begin
  if public.block_notes_body(null, false) <> '' or public.block_notes_body('  ', true) <> '' then
    raise exception 'VERIFY FAILED: empty notes should give an empty body';
  end if;
  if public.block_notes_body('a < b & c', false) <> '<p>a &lt; b &amp; c</p>' then
    raise exception 'VERIFY FAILED: plain notes are not escaped into a paragraph';
  end if;
  if public.block_notes_body('<p>x</p>', true) <> '<p>x</p>' then
    raise exception 'VERIFY FAILED: html notes should pass through';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'directory_entries_sync_notes_block' and not tgisinternal) then
    raise exception 'VERIFY FAILED: notes sync trigger missing';
  end if;
  if has_function_privilege('authenticated', 'public.sync_converted_notes_block()', 'execute') then
    raise exception 'VERIFY FAILED: the trigger function must not be callable directly';
  end if;

  -- End to end on a real entry, inside a sub-transaction that is always rolled back.
  select e.id, e.notes_html, e.allow_html into v_e, v_notes, v_allow
  from public.directory_entries e
  where not exists (select 1 from public.directory_page_blocks b where b.entry_id = e.id)
  order by e.id limit 1;
  if v_e is not null then
    begin
      update public.directory_entries set notes_html = '<p>Original</p>', allow_html = true where id = v_e;
      perform public.convert_entry_to_blocks(v_e);
      select data ->> 'body' into v_body from public.directory_page_blocks where entry_id = v_e and converted_from = 'notes_html';
      if v_body is distinct from '<p>Original</p>' then
        raise exception 'VERIFY FAILED: conversion did not create the notes block (body %)', v_body;
      end if;

      update public.directory_entries set notes_html = '<p>Updated</p>' where id = v_e;
      select data ->> 'body' into v_body from public.directory_page_blocks where entry_id = v_e and converted_from = 'notes_html';
      if v_body is distinct from '<p>Updated</p>' then
        raise exception 'VERIFY FAILED: an unedited notes block did not follow notes_html (body %)', v_body;
      end if;

      update public.directory_page_blocks set data = jsonb_set(data, '{body}', '"<p>Mine</p>"') where entry_id = v_e and converted_from = 'notes_html';
      update public.directory_entries set notes_html = '<p>Third</p>' where id = v_e;
      select data ->> 'body' into v_body from public.directory_page_blocks where entry_id = v_e and converted_from = 'notes_html';
      if v_body is distinct from '<p>Mine</p>' then
        raise exception 'VERIFY FAILED: an edited notes block was overwritten (body %)', v_body;
      end if;

      v_found := true;
      raise exception 'VERIFY_ROLLBACK';
    exception when others then
      if sqlerrm <> 'VERIFY_ROLLBACK' then
        raise;
      end if;
    end;
    raise notice 'end-to-end check ran on entry % (rolled back)', v_e;
  else
    raise notice 'no unconverted entry to run the end-to-end check on; helper and trigger checks only';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select 'directory_entries' as tbl, count(*) as rows from public.directory_entries union all
select 'directory_page_blocks', count(*) from public.directory_page_blocks
order by tbl;
-- Expected: identical to the pre-migration counts (the end-to-end check is rolled back).
