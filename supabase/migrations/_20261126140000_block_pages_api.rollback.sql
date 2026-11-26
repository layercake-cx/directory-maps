-- ============================================================
-- Rollback: 20261126140000_block_pages_api
-- Reverses: the block pages validator and RPCs, and restores phase 1's
--           (looser) write policies on the two block tables.
-- Safe at any time: it touches functions and policies only, never data.
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'add_page_block') then
    raise exception 'ABORT: block pages API does not exist — nothing to roll back';
  end if;
end $$;

-- THE ROLLBACK
drop function if exists public.stamp_block_template(uuid, integer);
drop function if exists public.delete_block_template(uuid);
drop function if exists public.save_block_template(text, text, text, text, text, jsonb, jsonb, boolean, boolean, text, boolean, uuid, boolean);
drop function if exists public.require_directory_admin(text);
drop function if exists public.remove_page_block(uuid, uuid);
drop function if exists public.move_page_block(uuid, text, integer, uuid);
drop function if exists public.reset_page_block_to_template(uuid, uuid);
drop function if exists public.update_page_block(uuid, jsonb, jsonb, uuid);
drop function if exists public.add_page_block(text, text, text, text, jsonb, jsonb, integer, uuid, uuid);
drop function if exists public.convert_page_to_blocks(text, text, uuid);
drop function if exists public.get_page_blocks(text, text, uuid);
drop function if exists public.block_page_of(uuid);
drop function if exists public.touch_block_page(text, text, uuid);
drop function if exists public.normalise_block_region(text, text, text);
drop function if exists public.block_page_context(text, text, uuid);
drop function if exists public.block_region_allowed(text, text, text);
drop function if exists public.block_def(text);
drop function if exists public.assert_block_valid(text, text, text, jsonb, jsonb);
drop function if exists public.block_data_errors(text, text, text, jsonb, jsonb);
drop function if exists public.block_field_errors(jsonb, jsonb, text, jsonb);
drop function if exists public.block_object_errors(jsonb, jsonb, text);
drop function if exists public.block_when(text, jsonb);
drop function if exists public.block_err(text, text);
drop function if exists public.block_registry();

-- Back to phase 1's write policies (any client contact), then drop the helper they no longer use.
drop policy if exists "directory_block_templates_own_client_write" on public.directory_block_templates;
drop policy if exists "directory_page_blocks_own_client_write" on public.directory_page_blocks;

create policy "directory_block_templates_own_client_write"
  on public.directory_block_templates for all to authenticated
  using (directory_id in (
    select d.id from public.directories d
    where d.client_id = public.current_user_client_id() and public.can_manage_client(d.client_id)
  ))
  with check (directory_id in (
    select d.id from public.directories d
    where d.client_id = public.current_user_client_id() and public.can_manage_client(d.client_id)
  ));
create policy "directory_page_blocks_own_client_write"
  on public.directory_page_blocks for all to authenticated
  using (directory_id in (
    select d.id from public.directories d
    where d.client_id = public.current_user_client_id() and public.can_manage_client(d.client_id)
  ))
  with check (directory_id in (
    select d.id from public.directories d
    where d.client_id = public.current_user_client_id() and public.can_manage_client(d.client_id)
  ));

drop function if exists public.is_directory_admin(text);

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (select 1 from pg_proc where proname in ('add_page_block', 'block_registry', 'block_data_errors', 'is_directory_admin', 'save_block_template')) then
    raise exception 'ROLLBACK VERIFY FAILED: a phase 2 function still exists';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('directory_block_templates', 'directory_page_blocks')) <> 6 then
    raise exception 'ROLLBACK VERIFY FAILED: expected 6 policies on the block tables';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
