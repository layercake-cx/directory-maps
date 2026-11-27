-- ============================================================
-- Rollback: 20261127120000_block_pages_notes_sync
-- Reverses: the notes sync trigger, block_notes_body(), and the converter's
-- "every entry gets a notes block" behaviour (back to
-- 20261127100000_block_pages_preserve_notes: only entries with notes get one).
-- Touches functions and a trigger only. Empty notes blocks already created stay.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'sync_converted_notes_block') then
    raise exception 'ABORT: notes sync does not exist — nothing to roll back';
  end if;
end $$;

drop trigger if exists directory_entries_sync_notes_block on public.directory_entries;
drop function if exists public.sync_converted_notes_block();

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
      -- Only if there is content; the body is stored the way the page
      -- renders it (plain text is escaped into a paragraph, as builders.ts does).
      if v_entry.notes_html is null or trim(v_entry.notes_html) = '' then
        continue;
      end if;
      v_body := case
        when v_entry.allow_html then v_entry.notes_html
        else '<p>' || replace(replace(replace(v_entry.notes_html, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>'
      end;
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

  -- notes_html is never lost. If the page's layout left the notes block out or hid it, the page did not show the
  -- text; keep it as a HIDDEN text block at the end of the main region so converting does not publish it, and an
  -- editor can reveal it by changing the block's Visibility.
  if not v_notes_done and v_entry.notes_html is not null and trim(v_entry.notes_html) <> '' then
    v_body := case
      when v_entry.allow_html then v_entry.notes_html
      else '<p>' || replace(replace(replace(v_entry.notes_html, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>'
    end;
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

revoke all on function public.convert_entry_to_blocks(text) from public, anon, authenticated;
grant execute on function public.convert_entry_to_blocks(text) to service_role;

drop function if exists public.block_notes_body(text, boolean);

do $$
begin
  if exists (select 1 from pg_proc where proname in ('sync_converted_notes_block', 'block_notes_body')) then
    raise exception 'ROLLBACK VERIFY FAILED: a notes sync function still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
