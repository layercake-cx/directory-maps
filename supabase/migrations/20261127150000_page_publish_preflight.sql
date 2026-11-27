-- ============================================================
-- Migration: 20261127150000_page_publish_preflight
-- Description: The safeguards for publishing ONE page from the focused block
--              editor, in a single service-role function the Edge Function
--              calls before it will rebuild anything:
--                * the directory is live (not archived) and has been
--                  published at least once (a single page is only ever
--                  re-published into an existing site)
--                * this page has been published before (a new page also
--                  needs the navigation, sitemap and listings updated, which
--                  only a directory publish does)
--                * the page is switched on (an inactive entry or page is not
--                  part of the site)
--                * the caller is publishing the version they saved: the
--                  expected page_updated_at matches the page row
--                * every block's effective content passes validation
--              It returns { ok, problems[], block_errors[], directory_id }.
-- Affected tables: none (one read-only function)
-- Rollback: _20261127150000_page_publish_preflight.rollback.sql
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
  if not exists (select 1 from pg_proc where proname = 'page_block_errors') then
    raise exception 'ABORT: page_block_errors() does not exist — apply 20261127140000_block_editor_save_publish_state.sql first';
  end if;
  if exists (select 1 from pg_proc where proname = 'page_publish_preflight') then
    raise exception 'ABORT: page_publish_preflight already exists — migration may have already run';
  end if;
end $$;

create or replace function public.page_publish_preflight(p_page_kind text, p_page_id text, p_expected_updated_at text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dir text;
  v_version text;
  v_active boolean;
  v_published boolean;
  v_manifest jsonb;
  v_seen text;
  v_problems jsonb := '[]'::jsonb;
  v_block_errors jsonb := '[]'::jsonb;
begin
  if p_page_kind = 'entry' then
    select e.directory_id, e.updated_at::text, e.is_active into v_dir, v_version, v_active
    from public.directory_entries e where e.id = p_page_id;
  elsif p_page_kind = 'content_page' then
    select c.directory_id, c.updated_at::text, c.is_active into v_dir, v_version, v_active
    from public.directory_content_pages c where c.id = p_page_id;
  else
    return jsonb_build_object('ok', false, 'problems', jsonb_build_array('Unknown kind of page'), 'block_errors', '[]'::jsonb);
  end if;
  if v_dir is null then
    return jsonb_build_object('ok', false, 'problems', jsonb_build_array('Page not found'), 'block_errors', '[]'::jsonb);
  end if;

  select (d.current_publication_id is not null), d.site_generation_manifest into v_published, v_manifest
  from public.directories d where d.id = v_dir;
  v_seen := case when p_page_kind = 'entry' then v_manifest -> 'entries' ->> p_page_id else v_manifest -> 'pages' ->> p_page_id end;

  if not public.is_entity_live('directory', v_dir) then
    v_problems := v_problems || to_jsonb('This directory is archived, so nothing can be published.'::text);
  end if;
  if not coalesce(v_published, false) then
    v_problems := v_problems || to_jsonb('The directory has not been published yet. Publish the whole directory once before publishing single pages.'::text);
  elsif v_seen is null or v_seen = '' then
    v_problems := v_problems || to_jsonb('This page has not been published before. Publish the directory to add it to the site, its navigation and its listings.'::text);
  end if;
  if not coalesce(v_active, true) then
    v_problems := v_problems || to_jsonb('This page is switched off, so it is not part of the site.'::text);
  end if;
  if p_expected_updated_at is not null and v_version is distinct from p_expected_updated_at then
    v_problems := v_problems || to_jsonb('This page changed since you loaded it. Reload it to see the latest version before publishing.'::text);
  end if;

  v_block_errors := public.page_block_errors(p_page_kind, p_page_id);
  if jsonb_array_length(v_block_errors) > 0 then
    v_problems := v_problems || to_jsonb(format('%s block(s) on this page have problems that must be fixed first.', jsonb_array_length(v_block_errors)));
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_problems) = 0,
    'problems', v_problems,
    'block_errors', v_block_errors,
    'directory_id', v_dir
  );
end;
$$;

comment on function public.page_publish_preflight(text, text, text) is
  'Checks that one page can be safely re-published: live and previously published directory and page, page switched on, the saved version is the one being published, and all blocks valid. Service role only.';

revoke all on function public.page_publish_preflight(text, text, text) from public, anon, authenticated;
grant execute on function public.page_publish_preflight(text, text, text) to service_role;

do $$
declare
  v_e text;
  v_r jsonb;
begin
  if has_function_privilege('authenticated', 'public.page_publish_preflight(text,text,text)', 'execute') then
    raise exception 'VERIFY FAILED: page_publish_preflight must be service-role only';
  end if;
  v_r := public.page_publish_preflight('entry', 'no-such-entry');
  if (v_r ->> 'ok')::boolean is not false then
    raise exception 'VERIFY FAILED: an unknown page passed the preflight';
  end if;
  select e.id into v_e from public.directory_entries e order by e.id limit 1;
  if v_e is not null then
    v_r := public.page_publish_preflight('entry', v_e, 'definitely-not-the-version');
    if (v_r ->> 'ok')::boolean is not false or not (v_r -> 'problems')::text like '%changed since you loaded%' then
      raise exception 'VERIFY FAILED: a stale version passed the preflight: %', v_r;
    end if;
  end if;
  raise notice 'VERIFY PASSED';
end $$;
