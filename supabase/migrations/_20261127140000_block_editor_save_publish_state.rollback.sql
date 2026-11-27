-- ============================================================
-- Rollback: 20261127140000_block_editor_save_publish_state
-- Reverses: save_page_blocks, validate_page_blocks, page_block_errors,
-- get_page_publish_state, and restores get_page_blocks without page_updated_at.
-- Touches functions only; no data.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'save_page_blocks') then
    raise exception 'ABORT: save_page_blocks does not exist — nothing to roll back';
  end if;
end $$;

drop function if exists public.get_page_publish_state(text, text, uuid);
drop function if exists public.validate_page_blocks(text, text, uuid);
drop function if exists public.page_block_errors(text, text);
drop function if exists public.save_page_blocks(text, text, text, jsonb, uuid);

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
begin
  select * into v_ctx from public.block_page_context(p_page_kind, p_page_id, p_claim_id);

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

  return jsonb_build_object('converted', v_converted, 'is_admin', v_ctx.is_admin, 'blocks', v_blocks);
end;
$$;

do $$
begin
  if exists (select 1 from pg_proc where proname in ('save_page_blocks', 'validate_page_blocks', 'get_page_publish_state', 'page_block_errors')) then
    raise exception 'ROLLBACK VERIFY FAILED: an editor function still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
