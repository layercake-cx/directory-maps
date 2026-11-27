-- ============================================================
-- Rollback: 20261127160000_claim_block_context_content
-- Reverses: get_claim_block_context() goes back to returning only name, type,
-- region, page kind and locks for each template. No data is touched.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'get_claim_block_context') then
    raise exception 'ABORT: get_claim_block_context does not exist — nothing to roll back';
  end if;
end $$;

create or replace function public.get_claim_block_context(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_item text;
  v_dir text;
begin
  select r.directory_item_id into v_item from public.require_active_claim_editor(p_claim_id) r;
  select e.directory_id into v_dir from public.directory_entries e where e.id = v_item;

  return jsonb_build_object(
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'block_type', t.block_type, 'region', t.region, 'page_kind', t.page_kind,
        'lock_position', t.lock_position, 'lock_content', t.lock_content
      ) order by t.name)
      from public.directory_block_templates t
      where t.directory_id = v_dir and t.page_kind = 'entry'
    ), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object('id', ect.term_id, 'label', ct.label) order by ct.label)
      from public.entry_category_terms ect
      join public.category_terms ct on ct.id = ect.term_id
      where ect.entry_id = v_item
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_claim_block_context(uuid) from public, anon;
grant execute on function public.get_claim_block_context(uuid) to authenticated;

do $$
begin
  if pg_get_functiondef('public.get_claim_block_context(uuid)'::regprocedure) like '%''placement''%' then
    raise exception 'ROLLBACK VERIFY FAILED: the function still returns template content';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
