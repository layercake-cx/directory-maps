-- ============================================================
-- Migration: 20261126200000_block_pages_claim_context
-- Description: Phase 5 of block-based page editing (listing owners).
--              get_claim_block_context(): what the block editor in the
--              Listing Manager needs that a claim user cannot read directly
--              (claim users have no profile or contact row for RLS):
--              the directory's block templates for entry pages (name, type,
--              region, locks; never their content, which arrives through
--              get_page_blocks once a block is added) and the categorisation
--              terms the claimed entry holds (for attribute descriptions).
--              Requires an ACTIVE claim, like every claimed-listing write.
-- Affected tables: none (one read-only RPC)
-- Rollback: _20261126200000_block_pages_claim_context.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-26
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the migration body below here>
--   ROLLBACK;
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'require_active_claim_editor') then
    raise exception 'ABORT: require_active_claim_editor() does not exist — apply the claims migrations first';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_block_templates') then
    raise exception 'ABORT: directory_block_templates does not exist — apply 20261126120000_create_block_pages.sql first';
  end if;
  if exists (select 1 from pg_proc where proname = 'get_claim_block_context') then
    raise exception 'ABORT: get_claim_block_context already exists — migration may have already run';
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

comment on function public.get_claim_block_context(uuid) is
  'Block editor context for a claim user: the directory''s entry-page block templates (no content) and the claimed entry''s categorisation terms. Active claim required.';

revoke all on function public.get_claim_block_context(uuid) from public, anon;
grant execute on function public.get_claim_block_context(uuid) to authenticated;

do $$
begin
  if not has_function_privilege('authenticated', 'public.get_claim_block_context(uuid)', 'execute') then
    raise exception 'VERIFY FAILED: get_claim_block_context must be callable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.get_claim_block_context(uuid)', 'execute') then
    raise exception 'VERIFY FAILED: get_claim_block_context must not be callable by anon';
  end if;
  raise notice 'VERIFY PASSED';
end $$;
