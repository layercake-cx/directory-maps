-- ============================================================
-- Migration: 20261127140000_block_editor_save_publish_state
-- Description: Server side of the focused block editor (working copy, Save
--              draft, safe single-page Publish).
--              1. get_page_blocks() also returns page_updated_at (text), the
--                 version a working copy is based on.
--              2. save_page_blocks(): Save draft. Applies a whole working
--                 copy (every block, in order, per region) in ONE transaction
--                 with the same rules the granular RPCs enforce: locks bind
--                 non-admins, block type is immutable, content-locked blocks
--                 cannot take data, templates are added only from the
--                 directory's library, validation per block, max per page.
--                 It also refuses to save over someone else's changes: the
--                 caller passes the page_updated_at they loaded, and the
--                 page row is locked and compared first (SQLSTATE 40001).
--              3. page_block_errors() (service role) and
--                 validate_page_blocks(): every block's EFFECTIVE content
--                 (template data for linked blocks) checked against the
--                 registry. Publish refuses to go ahead while any block is
--                 invalid.
--              4. get_page_publish_state(): whether the directory has been
--                 published at all and whether THIS page has unpublished
--                 changes, from the publish manifest (so the editor can say
--                 "Unpublished changes" for one page, not just the directory).
-- Affected tables: none (functions only); writes directory_page_blocks rows
--                  when called.
-- Rollback: _20261127140000_block_editor_save_publish_state.rollback.sql
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
  if not exists (select 1 from pg_proc where proname = 'add_page_block') then
    raise exception 'ABORT: block pages API does not exist — apply 20261126140000_block_pages_api.sql first';
  end if;
  if exists (select 1 from pg_proc where proname in ('save_page_blocks', 'validate_page_blocks', 'get_page_publish_state', 'page_block_errors')) then
    raise exception 'ABORT: editor save/publish functions already exist — migration may have already run';
  end if;
end $$;

select 'directory_entries' as tbl, count(*) as rows from public.directory_entries union all
select 'directory_page_blocks', count(*) from public.directory_page_blocks
order by tbl;

-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1. get_page_blocks: add page_updated_at
create or replace function public.get_page_blocks(p_page_kind text, p_page_id text, p_claim_id uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ctx record;
  v_blocks jsonb;
  v_converted boolean;
  v_page_updated text;
begin
  select * into v_ctx from public.block_page_context(p_page_kind, p_page_id, p_claim_id);

  select case when p_page_kind = 'entry'
           then (select e.updated_at::text from public.directory_entries e where e.id = p_page_id)
           else (select c.updated_at::text from public.directory_content_pages c where c.id = p_page_id) end
    into v_page_updated;

  select exists (
    select 1 from public.directory_page_blocks b
    where case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end
  ) into v_converted;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id,
      'region', b.region,
      'position', b.position,
      'block_type', b.block_type,
      'template_id', b.template_id,
      'template_name', t.name,
      'linked', b.data is null,
      'data', coalesce(b.data, t.data),
      'common', b.common,
      'lock_position', b.lock_position,
      'lock_content', b.lock_content,
      'placement', t.placement,
      'can_edit', v_ctx.is_admin or not b.lock_content,
      'can_edit_content', not b.lock_content,
      'can_move', v_ctx.is_admin or not b.lock_position,
      'can_remove', v_ctx.is_admin or not b.lock_position,
      'converted_from', b.converted_from,
      'updated_at', b.updated_at
    ) order by b.region, b.position), '[]'::jsonb)
  into v_blocks
  from public.directory_page_blocks b
  left join public.directory_block_templates t on t.id = b.template_id
  where case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end;

  return jsonb_build_object('converted', v_converted, 'is_admin', v_ctx.is_admin, 'page_updated_at', v_page_updated, 'blocks', v_blocks);
end;
$$;

-- 2. Save draft
create or replace function public.save_page_blocks(
  p_page_kind text,
  p_page_id text,
  p_expected_updated_at text,
  p_blocks jsonb,
  p_claim_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_current text;
  v_el jsonb;
  v_ord bigint;
  v_id uuid;
  v_existing public.directory_page_blocks%rowtype;
  v_t public.directory_block_templates%rowtype;
  v_region text;
  v_type text;
  v_tid uuid;
  v_data jsonb;
  v_common jsonb;
  v_effective jsonb;
  v_data_changed boolean;
  v_common_changed boolean;
  v_seen uuid[] := '{}';
  v_pos_hero integer := 0;
  v_pos_main integer := 0;
  v_pos_sidebar integer := 0;
  v_pos integer;
  v_rm record;
  v_cnt record;
  v_max integer;
  v_new_id uuid;
  v_new_version text;
begin
  select * into v_ctx from public.block_page_context(p_page_kind, p_page_id, p_claim_id);

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be a list';
  end if;
  if jsonb_array_length(p_blocks) > 200 then
    raise exception 'A page can have at most 200 blocks';
  end if;

  -- Lock the page row and refuse to save over someone else's changes.
  if p_page_kind = 'entry' then
    select e.updated_at::text into v_current from public.directory_entries e where e.id = p_page_id for update;
  else
    select c.updated_at::text into v_current from public.directory_content_pages c where c.id = p_page_id for update;
  end if;
  if p_expected_updated_at is null or v_current is distinct from p_expected_updated_at then
    raise exception 'This page changed since you opened it. Reload to see the latest version before saving.' using errcode = '40001';
  end if;

  for v_el, v_ord in select value, ordinality from jsonb_array_elements(p_blocks) with ordinality loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'Each block must be an object';
    end if;
    v_region := v_el ->> 'region';
    if v_region not in ('hero', 'main', 'sidebar') then
      raise exception 'Block % has an unknown region', v_ord;
    end if;
    v_id := nullif(v_el ->> 'id', '')::uuid;
    v_data := case when jsonb_typeof(v_el -> 'data') = 'object' then v_el -> 'data' else null end;
    v_common := case when jsonb_typeof(v_el -> 'common') = 'object' then v_el -> 'common' else '{}'::jsonb end;
    v_pos := case v_region when 'hero' then v_pos_hero when 'main' then v_pos_main else v_pos_sidebar end;

    if v_id is not null then
      -- ---- an existing block ----
      select * into v_existing from public.directory_page_blocks b
      where b.id = v_id
        and case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end;
      if not found then
        raise exception 'A block in this save is not on this page any more. Reload and try again.';
      end if;
      v_seen := v_seen || v_id;

      if v_el ->> 'block_type' is distinct from v_existing.block_type then
        raise exception 'A block''s type cannot change';
      end if;
      if v_region <> v_existing.region then
        if v_existing.lock_position and not v_ctx.is_admin then
          raise exception 'A block locked in position by the directory administrator cannot be moved';
        end if;
        if not public.block_region_allowed(p_page_kind, v_region, v_existing.block_type) then
          raise exception 'That block cannot go in that region';
        end if;
      end if;

      v_data_changed := v_data is distinct from v_existing.data;
      v_common_changed := v_common is distinct from v_existing.common;
      if v_existing.lock_content then
        if not v_ctx.is_admin and (v_data_changed or v_common_changed) then
          raise exception 'A block whose content is locked by the directory administrator cannot be changed';
        end if;
        if v_data is not null then
          raise exception 'The content of a locked block comes from its library template';
        end if;
      end if;

      if v_data_changed and v_data is null and v_existing.template_id is null then
        raise exception 'A block that did not come from a template cannot be reset to one';
      end if;
      if v_data is not null and (v_data_changed or v_common_changed) then
        perform public.assert_block_valid(p_page_kind, v_region, v_existing.block_type, v_data, v_common);
      elsif v_common_changed then
        select coalesce(t.data, '{}'::jsonb) into v_effective from public.directory_block_templates t where t.id = v_existing.template_id;
        perform public.assert_block_valid(p_page_kind, v_region, v_existing.block_type, coalesce(v_effective, '{}'::jsonb), v_common);
      end if;

      update public.directory_page_blocks
         set region = v_region, position = v_pos, data = v_data, common = v_common, updated_by = auth.uid()
       where id = v_id
         and (region, position, data, common) is distinct from (v_region, v_pos, v_data, v_common);
    else
      -- ---- a new block ----
      v_tid := nullif(v_el ->> 'template_id', '')::uuid;
      if v_tid is not null then
        select * into v_t from public.directory_block_templates
        where id = v_tid and directory_id = v_ctx.directory_id and page_kind = p_page_kind;
        if not found then
          raise exception 'A library template in this save is not available for this page';
        end if;
        v_type := v_t.block_type;
        v_region := v_t.region;
        v_data := null;
        v_common := v_t.common || v_common;
        if not public.block_region_allowed(p_page_kind, v_region, v_type) then
          raise exception 'A template in this save cannot go on this kind of page';
        end if;
        v_pos := case v_region when 'hero' then v_pos_hero when 'main' then v_pos_main else v_pos_sidebar end;
        insert into public.directory_page_blocks (
          directory_id, page_kind, entry_id, content_page_id, region, position, block_type,
          template_id, data, common, lock_position, lock_content, updated_by
        ) values (
          v_ctx.directory_id, p_page_kind,
          case when p_page_kind = 'entry' then p_page_id end,
          case when p_page_kind = 'content_page' then p_page_id end,
          v_region, v_pos, v_type, v_tid, null, v_common, v_t.lock_position, v_t.lock_content, auth.uid()
        ) returning id into v_new_id;
      else
        v_type := v_el ->> 'block_type';
        if v_type is null or v_data is null then
          raise exception 'A new block needs a type and its content';
        end if;
        perform public.assert_block_valid(p_page_kind, v_region, v_type, v_data, v_common);
        insert into public.directory_page_blocks (
          directory_id, page_kind, entry_id, content_page_id, region, position, block_type,
          template_id, data, common, lock_position, lock_content, updated_by
        ) values (
          v_ctx.directory_id, p_page_kind,
          case when p_page_kind = 'entry' then p_page_id end,
          case when p_page_kind = 'content_page' then p_page_id end,
          v_region, v_pos, v_type, null, v_data, v_common, false, false, auth.uid()
        ) returning id into v_new_id;
      end if;
      v_seen := v_seen || v_new_id;
    end if;

    if v_region = 'hero' then v_pos_hero := v_pos_hero + 1;
    elsif v_region = 'main' then v_pos_main := v_pos_main + 1;
    else v_pos_sidebar := v_pos_sidebar + 1;
    end if;
  end loop;

  -- ---- blocks left out of the save are removals ----
  for v_rm in
    select b.id, b.lock_position from public.directory_page_blocks b
    where case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end
      and not (b.id = any (v_seen))
  loop
    if v_rm.lock_position and not v_ctx.is_admin then
      raise exception 'A block locked in position by the directory administrator cannot be removed';
    end if;
    delete from public.directory_page_blocks where id = v_rm.id;
  end loop;

  -- ---- per-page limits ----
  for v_cnt in
    select b.block_type, count(*) as n from public.directory_page_blocks b
    where case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end
    group by b.block_type
  loop
    v_max := (public.block_def(v_cnt.block_type) ->> 'maxPerPage')::int;
    if v_max is not null and v_cnt.n > v_max then
      raise exception 'A page can have at most % of the block "%"', v_max, v_cnt.block_type;
    end if;
  end loop;

  -- Pinned blocks go back to the start or end of their region.
  perform public.normalise_block_region(p_page_kind, p_page_id, 'hero');
  perform public.normalise_block_region(p_page_kind, p_page_id, 'main');
  perform public.normalise_block_region(p_page_kind, p_page_id, 'sidebar');

  perform public.touch_block_page(p_page_kind, p_page_id, v_ctx.claim_user_id);

  if p_page_kind = 'entry' then
    select e.updated_at::text into v_new_version from public.directory_entries e where e.id = p_page_id;
  else
    select c.updated_at::text into v_new_version from public.directory_content_pages c where c.id = p_page_id;
  end if;
  return jsonb_build_object('page_updated_at', v_new_version);
end;
$$;

comment on function public.save_page_blocks(text, text, text, jsonb, uuid) is
  'Save draft: applies a whole working copy of a page''s blocks atomically, enforcing the same lock and validation rules as the granular RPCs, and refuses to overwrite a page that changed since p_expected_updated_at was read (SQLSTATE 40001).';

-- 3. Validation of every block's effective content
create or replace function public.page_block_errors(p_page_kind text, p_page_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('block_id', x.id, 'block_type', x.block_type, 'errors', x.errs)), '[]'::jsonb)
  from (
    select b.id, b.block_type,
           public.block_data_errors(p_page_kind, b.region, b.block_type, coalesce(b.data, t.data), b.common) as errs
    from public.directory_page_blocks b
    left join public.directory_block_templates t on t.id = b.template_id
    where case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end
  ) x
  where jsonb_array_length(x.errs) > 0;
$$;

create or replace function public.validate_page_blocks(p_page_kind text, p_page_id text, p_claim_id uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from public.block_page_context(p_page_kind, p_page_id, p_claim_id);
  return public.page_block_errors(p_page_kind, p_page_id);
end;
$$;

-- 4. Per-page publish state, from the publish manifest
create or replace function public.get_page_publish_state(p_page_kind text, p_page_id text, p_claim_id uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ctx record;
  v_manifest jsonb;
  v_published boolean;
  v_generated timestamptz;
  v_page_updated timestamptz;
  v_seen text;
begin
  select * into v_ctx from public.block_page_context(p_page_kind, p_page_id, p_claim_id);
  select d.site_generation_manifest, (d.current_publication_id is not null), d.site_generated_at
    into v_manifest, v_published, v_generated
  from public.directories d where d.id = v_ctx.directory_id;

  if p_page_kind = 'entry' then
    select e.updated_at into v_page_updated from public.directory_entries e where e.id = p_page_id;
    v_seen := v_manifest -> 'entries' ->> p_page_id;
  else
    select c.updated_at into v_page_updated from public.directory_content_pages c where c.id = p_page_id;
    v_seen := v_manifest -> 'pages' ->> p_page_id;
  end if;

  return jsonb_build_object(
    'directory_published', coalesce(v_published, false),
    'directory_published_at', v_generated,
    'page_updated_at', v_page_updated::text,
    -- Never published, or changed since the version that was last built.
    'has_unpublished_changes', v_seen is null or v_seen = '' or v_seen::timestamptz is distinct from v_page_updated
  );
end;
$$;

revoke all on function public.save_page_blocks(text, text, text, jsonb, uuid) from public, anon;
revoke all on function public.validate_page_blocks(text, text, uuid) from public, anon;
revoke all on function public.get_page_publish_state(text, text, uuid) from public, anon;
revoke all on function public.page_block_errors(text, text) from public, anon, authenticated;
grant execute on function public.save_page_blocks(text, text, text, jsonb, uuid) to authenticated;
grant execute on function public.validate_page_blocks(text, text, uuid) to authenticated;
grant execute on function public.get_page_publish_state(text, text, uuid) to authenticated;
grant execute on function public.page_block_errors(text, text) to service_role;

-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if has_function_privilege('anon', 'public.save_page_blocks(text,text,text,jsonb,uuid)', 'execute') then
    raise exception 'VERIFY FAILED: save_page_blocks must not be callable by anon';
  end if;
  if has_function_privilege('authenticated', 'public.page_block_errors(text,text)', 'execute') then
    raise exception 'VERIFY FAILED: page_block_errors must be service-role only';
  end if;
  if not has_function_privilege('authenticated', 'public.get_page_publish_state(text,text,uuid)', 'execute') then
    raise exception 'VERIFY FAILED: get_page_publish_state must be callable by authenticated';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- End-to-end check of Save draft, as a real platform admin (and as a non-admin contact when one exists), inside a
-- sub-transaction that is always rolled back. Skips with a notice when there is no suitable entry or admin.
do $$
declare
  v_admin uuid;
  v_member uuid;
  v_e text;
  v_dir text;
  v_res jsonb;
  v_ver text;
  v_blocks jsonb;
  v_new jsonb;
  v_n integer;
  v_ok boolean;
  v_tid uuid;
  v_locked jsonb;
  v_locked_id text;
begin
  select p.user_id into v_admin from public.profiles p where p.role = 'admin' and p.user_id is not null limit 1;
  select e.id, e.directory_id into v_e, v_dir
  from public.directory_entries e
  where public.is_entity_live('directory', e.directory_id)
    and not exists (select 1 from public.directory_page_blocks b where b.entry_id = e.id)
  order by e.id limit 1;
  if v_admin is null or v_e is null then
    raise notice 'save_page_blocks end-to-end check skipped: no platform admin or no unconverted live entry';
    return;
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

    perform public.convert_page_to_blocks('entry', v_e);
    v_res := public.get_page_blocks('entry', v_e);
    v_ver := v_res ->> 'page_updated_at';
    if v_ver is null or not (v_res ->> 'converted')::boolean then
      raise exception 'VERIFY FAILED: get_page_blocks did not return a converted page with a version';
    end if;
    -- The working copy: every block as it is (linked blocks send null data).
    v_blocks := (
      select jsonb_agg(jsonb_build_object(
        'id', b ->> 'id', 'region', b ->> 'region', 'block_type', b ->> 'block_type',
        'data', case when (b ->> 'linked')::boolean then null else b -> 'data' end, 'common', b -> 'common'
      ) order by (b ->> 'region'), (b ->> 'position')::int)
      from jsonb_array_elements(v_res -> 'blocks') b
    );
    v_n := jsonb_array_length(v_blocks);

    -- 1. add a block and save
    v_new := v_blocks || jsonb_build_array(jsonb_build_object('region', 'main', 'block_type', 'rich', 'data', jsonb_build_object('body', '<p>Draft</p>', 'style', 'normal'), 'common', '{}'::jsonb));
    v_res := public.save_page_blocks('entry', v_e, v_ver, v_new);
    if (v_res ->> 'page_updated_at') is null or (v_res ->> 'page_updated_at') = v_ver then
      raise exception 'VERIFY FAILED: save did not return a new version';
    end if;
    if (select count(*) from public.directory_page_blocks where entry_id = v_e) <> v_n + 1 then
      raise exception 'VERIFY FAILED: the new block was not saved';
    end if;

    -- 2. a save based on the old version is refused
    v_ok := false;
    begin
      perform public.save_page_blocks('entry', v_e, v_ver, v_blocks);
    exception when sqlstate '40001' then
      v_ok := true;
    end;
    if not v_ok then raise exception 'VERIFY FAILED: a stale save was accepted'; end if;
    v_ver := v_res ->> 'page_updated_at';

    -- 3. an unsafe block is refused
    v_ok := false;
    begin
      perform public.save_page_blocks('entry', v_e, v_ver, v_blocks || jsonb_build_array(jsonb_build_object('region', 'main', 'block_type', 'rich', 'data', jsonb_build_object('body', '<script>x</script>'), 'common', '{}'::jsonb)));
    exception when sqlstate '22023' then
      v_ok := true;
    end;
    if not v_ok then raise exception 'VERIFY FAILED: an unsafe block was accepted'; end if;

    -- 4. a block cannot change type
    v_ok := false;
    begin
      perform public.save_page_blocks('entry', v_e, v_ver, (select jsonb_agg(case when i = 0 then jsonb_set(x, '{block_type}', '"callout"') else x end) from (select x, ordinality - 1 as i from jsonb_array_elements(v_blocks) with ordinality as t(x, ordinality)) s));
    exception when others then
      v_ok := sqlerrm like '%type cannot change%';
    end;
    if not v_ok then raise exception 'VERIFY FAILED: a block type change was accepted'; end if;

    -- 5. leaving the added block out removes it
    v_res := public.save_page_blocks('entry', v_e, v_ver, v_blocks);
    v_ver := v_res ->> 'page_updated_at';
    if (select count(*) from public.directory_page_blocks where entry_id = v_e) <> v_n then
      raise exception 'VERIFY FAILED: the removed block is still there';
    end if;

    -- 6. publish state reports this page as unpublished-changed or published, never errors
    if (public.get_page_publish_state('entry', v_e) ->> 'page_updated_at') is null then
      raise exception 'VERIFY FAILED: get_page_publish_state returned no version';
    end if;
    if jsonb_typeof(public.validate_page_blocks('entry', v_e)) <> 'array' then
      raise exception 'VERIFY FAILED: validate_page_blocks did not return a list';
    end if;

    -- 7. locks, for a non-admin contact of the same client when there is one
    select c.user_id into v_member
    from public.contacts c join public.directories d on d.client_id = c.client_id
    where d.id = v_dir and c.role = 'member' and c.user_id is not null limit 1;
    if v_member is not null then
      v_tid := public.save_block_template(v_dir, 'entry', 'Verify lock', 'callout', 'main',
        jsonb_build_object('title', 'Locked', 'body', 'x', 'tone', 'info'), '{}'::jsonb, true, true, 'end', false);
      v_res := public.save_page_blocks('entry', v_e, v_ver, v_blocks || jsonb_build_array(jsonb_build_object('region', 'main', 'template_id', v_tid::text, 'common', '{}'::jsonb)));
      v_ver := v_res ->> 'page_updated_at';
      v_locked := public.get_page_blocks('entry', v_e);
      v_blocks := (
        select jsonb_agg(jsonb_build_object('id', b ->> 'id', 'region', b ->> 'region', 'block_type', b ->> 'block_type',
          'data', case when (b ->> 'linked')::boolean then null else b -> 'data' end, 'common', b -> 'common') order by (b ->> 'region'), (b ->> 'position')::int)
        from jsonb_array_elements(v_locked -> 'blocks') b
      );
      v_locked_id := (select b ->> 'id' from jsonb_array_elements(v_locked -> 'blocks') b where b ->> 'template_id' = v_tid::text);
      perform set_config('request.jwt.claim.sub', v_member::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role', 'authenticated')::text, true);
      v_ok := false;
      begin
        perform public.save_page_blocks('entry', v_e, v_ver, (select jsonb_agg(b) from jsonb_array_elements(v_blocks) b where b ->> 'id' is distinct from v_locked_id));
      exception when others then
        v_ok := sqlerrm like '%locked%';
      end;
      if not v_ok then raise exception 'VERIFY FAILED: a non-admin removed a position-locked block'; end if;
      v_ok := false;
      begin
        perform public.save_page_blocks('entry', v_e, v_ver, (select jsonb_agg(case when b ->> 'id' = v_locked_id then jsonb_set(b, '{common}', '{"anchorId":"x"}') else b end) from jsonb_array_elements(v_blocks) b));
      exception when others then
        v_ok := sqlerrm like '%locked%';
      end;
      if not v_ok then raise exception 'VERIFY FAILED: a non-admin changed a content-locked block'; end if;
      raise notice 'lock checks ran as a non-admin contact';
    else
      raise notice 'no member contact found: lock checks for non-admins skipped';
    end if;

    raise exception 'VERIFY_ROLLBACK';
  exception when others then
    if sqlerrm <> 'VERIFY_ROLLBACK' then
      raise;
    end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  raise notice 'save_page_blocks end-to-end check ran on entry % (rolled back)', v_e;
end $$;

select 'directory_entries' as tbl, count(*) as rows from public.directory_entries union all
select 'directory_page_blocks', count(*) from public.directory_page_blocks
order by tbl;
