-- ============================================================
-- Rollback: 20260827120000_directory_publish_foundation
-- Reverses: directory_entries.slug (+trigger+function+constraint), the
--           5 SEO override columns, directory_publications (+RPCs+RLS),
--           directories.current_publication_id/published_at/seo_defaults_json,
--           directory_redirects (+trigger+function+RLS),
--           directory_contact_submissions (+RLS).
--           Does NOT drop public.slugify_text() or
--           public.current_user_client_id() — both predate this migration
--           and are used elsewhere (listings.slug, tenant-scoped RLS).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_publications') then
    raise exception 'ABORT: nothing to roll back — public.directory_publications does not exist';
  end if;

  if exists (select 1 from public.directory_publications limit 1) then
    raise exception 'ABORT: live data exists in public.directory_publications. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  if exists (select 1 from public.directory_redirects limit 1) then
    raise exception 'ABORT: live data exists in public.directory_redirects. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  if exists (select 1 from public.directory_contact_submissions limit 1) then
    raise exception 'ABORT: live data exists in public.directory_contact_submissions. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  if exists (select 1 from public.directories where current_publication_id is not null or published_at is not null or seo_defaults_json is not null) then
    raise exception 'ABORT: a directories row has a non-default value in a column this rollback would drop. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  if exists (
    select 1 from public.directory_entries
    where meta_title is not null or meta_description is not null or noindex is not null
       or structured_data_type is not null or sitemap_priority is not null
  ) then
    raise exception 'ABORT: a directory_entries row has a non-default SEO override value. Export it before rolling back. To override, remove this check and re-run.';
  end if;
  -- slug itself is NOT NULL with real generated values for every row — rolling
  -- back always discards it (it will regenerate identically if re-applied,
  -- since generation is deterministic from name), no separate guard needed.
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

-- 5) directory_contact_submissions
drop table if exists public.directory_contact_submissions;

-- 4) directory_redirects
drop trigger if exists trg_record_directory_entry_slug_redirect on public.directory_entries;
drop function if exists public.record_directory_entry_slug_redirect();
drop table if exists public.directory_redirects;

-- 3) directory_publications + RPCs
drop function if exists public.list_directory_publications(text);
drop function if exists public.rollback_directory_to(text, uuid);
drop function if exists public.publish_directory(text, jsonb, text);
drop table if exists public.directory_publications;

alter table public.directories
  drop column if exists current_publication_id,
  drop column if exists published_at,
  drop column if exists seo_defaults_json;

-- 2) SEO override columns on directory_entries
alter table public.directory_entries
  drop column if exists meta_title,
  drop column if exists meta_description,
  drop column if exists noindex,
  drop column if exists structured_data_type,
  drop column if exists sitemap_priority;

-- 1) directory_entries.slug
alter table public.directory_entries drop constraint if exists directory_entries_directory_id_slug_key;
drop trigger if exists trg_set_directory_entry_slug on public.directory_entries;
drop function if exists public.set_directory_entry_slug();
drop function if exists public.generate_unique_directory_entry_slug(text, text, text);
alter table public.directory_entries drop column if exists slug;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_publications') then
    raise exception 'ROLLBACK VERIFY FAILED: directory_publications still exists';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_redirects') then
    raise exception 'ROLLBACK VERIFY FAILED: directory_redirects still exists';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_contact_submissions') then
    raise exception 'ROLLBACK VERIFY FAILED: directory_contact_submissions still exists';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'slug') then
    raise exception 'ROLLBACK VERIFY FAILED: directory_entries.slug still exists';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'current_publication_id') then
    raise exception 'ROLLBACK VERIFY FAILED: directories.current_publication_id still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — confirm no data loss beyond what was expected
select
  'directories' as tbl, count(*) as rows from public.directories       union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
