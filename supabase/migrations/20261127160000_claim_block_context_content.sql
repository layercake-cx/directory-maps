-- ============================================================
-- Migration: 20261127160000_claim_block_context_content
-- Description: The focused block editor, used by a listing owner, needs a
--              library template's content as well as its name: a block added
--              from the library has to show its text in the editor and in the
--              dialog preview. get_claim_block_context() now also returns each
--              entry-page template's data, common settings and placement.
--              A template's content is already public (it appears on every page
--              that uses it); the function still requires an ACTIVE claim and
--              returns only the claimed entry's directory's entry-page templates.
-- Affected tables: none (one read-only function, replaced)
-- Rollback: _20261127160000_claim_block_context_content.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-27
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the migration body below here>
--   ROLLBACK;
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'get_claim_block_context') then
    raise exception 'ABORT: get_claim_block_context() does not exist — apply 20261126200000_block_pages_claim_context.sql first';
  end if;
  if pg_get_functiondef('public.get_claim_block_context(uuid)'::regprocedure) like '%''placement''%' then
    raise exception 'ABORT: get_claim_block_context already returns template content — migration may have already run';
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
        'data', t.data, 'common', t.common, 'placement', t.placement,
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
  if pg_get_functiondef('public.get_claim_block_context(uuid)'::regprocedure) not like '%''placement''%' then
    raise exception 'VERIFY FAILED: get_claim_block_context does not return template content';
  end if;
  if has_function_privilege('anon', 'public.get_claim_block_context(uuid)', 'execute') then
    raise exception 'VERIFY FAILED: get_claim_block_context must not be callable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.get_claim_block_context(uuid)', 'execute') then
    raise exception 'VERIFY FAILED: get_claim_block_context must be callable by authenticated';
  end if;
  raise notice 'VERIFY PASSED';
end $$;
