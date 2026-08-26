-- ============================================================
-- Migration: 20260827120000_directory_publish_foundation
-- Description: Phase 3a of the Directories build-out (DIR-E2 — Publish/
--              SEO, data layer only). Lays the foundation the static
--              publish pipeline (a later, separate piece of work) needs:
--
--                1) directory_entries.slug — url-safe, per-directory-unique,
--                   auto-generated on insert. Exact mirror of
--                   generate_unique_listing_slug/set_listing_slug/
--                   trg_set_listing_slug (20260822200000_add_listings_slug.sql),
--                   reusing the existing slugify_text() helper as-is.
--                2) Per-entry and per-directory SEO override columns
--                   (docs/DIRECTORIES.md §4.1/§4.2): meta_title,
--                   meta_description, noindex, structured_data_type,
--                   sitemap_priority on directory_entries; seo_defaults_json
--                   on directories.
--                3) directory_publications + publish_directory/
--                   rollback_directory_to/list_directory_publications —
--                   exact mirror of map_publications' FINAL definition
--                   (20260503120000_map_publications.sql as amended by
--                   20260520100000_tenant_scoped_rls.sql's manual tenant
--                   check, since security definer functions bypass RLS
--                   and must check access themselves). config snapshots
--                   directory settings + the categorisation taxonomy
--                   structure; directory_entries and live tag assignments
--                   are read live at generation time, not snapshotted —
--                   this matches how map_publications snapshots
--                   map+groups but EmbedMap.jsx still reads public_listings
--                   live regardless of publication version.
--                4) directory_redirects — deferred from Phase 2's
--                   20260826120000 migration because it needed
--                   directory_entries.slug, which didn't exist yet. A
--                   BEFORE UPDATE trigger records the old slug whenever an
--                   entry's slug changes, per docs/DIRECTORIES.md §5.11
--                   ("Slug changes create a redirect from the old URL").
--                5) directory_contact_submissions — mirrors
--                   map_contact_submissions (20260516120000) exactly,
--                   scoped to directory_id/entry_id. The actual enquiry
--                   form UI and email-sending Edge Function wiring are
--                   separate, later work — this migration is the table
--                   + RLS only.
--
--              Deliberately NOT included: anon-read RLS policies on
--              directories/directory_entries/categorisations/etc., and any
--              public_directory_entries-style view. The actual static
--              generator runs server-side via a service-role Edge Function
--              (bypasses RLS entirely, matching generate_directory_pages'
--              existing pattern) — anon RLS is only needed for a future
--              client-side standalone map embed, and getting the exposed
--              field shape right belongs with that work, not guessed at
--              here. Same "not yet" stance the original DIR-E1 migration
--              took, now scoped explicitly to this rather than being an
--              open-ended deferral.
-- Affected tables: directory_entries (7 new columns), directories (3 new
--                   columns), directory_publications (new),
--                   directory_redirects (new), directory_contact_submissions
--                   (new)
-- Rollback: _20260827120000_directory_publish_foundation.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-27
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_entries') then
    raise exception 'ABORT: table public.directory_entries does not exist';
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'slugify_text') then
    raise exception 'ABORT: public.slugify_text() does not exist (run 20260822200000_add_listings_slug.sql first)';
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'current_user_client_id') then
    raise exception 'ABORT: public.current_user_client_id() does not exist';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'slug') then
    raise exception 'ABORT: directory_entries.slug already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_publications') then
    raise exception 'ABORT: directory_publications already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'directories' as tbl, count(*) as rows from public.directories       union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
-- Save this output. You will compare it to the post-migration counts.


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) directory_entries.slug — exact mirror of the listings.slug mechanism.
--    Reuses the existing public.slugify_text() as-is (no redefinition).

create or replace function public.generate_unique_directory_entry_slug(p_directory_id text, p_name text, p_exclude_id text default null)
returns text
language plpgsql
as $$
declare
  base_slug text;
  candidate text;
  suffix integer := 1;
begin
  base_slug := coalesce(public.slugify_text(p_name), 'entry');
  candidate := base_slug;
  while exists (
    select 1 from public.directory_entries
    where directory_id = p_directory_id and slug = candidate
      and (p_exclude_id is null or id <> p_exclude_id)
  ) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;
  return candidate;
end;
$$;

comment on function public.generate_unique_directory_entry_slug(text, text, text) is
  'Derives a url-safe slug from an entry name, appending -2/-3/... to resolve collisions within the same directory_id. Peer of generate_unique_listing_slug.';

create or replace function public.set_directory_entry_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generate_unique_directory_entry_slug(new.directory_id, new.name, new.id);
  end if;
  return new;
end;
$$;

comment on function public.set_directory_entry_slug() is
  'BEFORE INSERT hook on public.directory_entries. Auto-fills slug from name when not already provided. Peer of set_listing_slug.';

alter table public.directory_entries add column slug text null;

drop trigger if exists trg_set_directory_entry_slug on public.directory_entries;
create trigger trg_set_directory_entry_slug
  before insert on public.directory_entries
  for each row
  execute function public.set_directory_entry_slug();

-- Backfill existing entries, one at a time in a stable order.
do $$
declare
  r record;
begin
  for r in
    select id, directory_id, name from public.directory_entries where slug is null order by directory_id, name, id
  loop
    update public.directory_entries
    set slug = public.generate_unique_directory_entry_slug(r.directory_id, r.name, r.id)
    where id = r.id;
  end loop;
end $$;

alter table public.directory_entries alter column slug set not null;
alter table public.directory_entries add constraint directory_entries_directory_id_slug_key unique (directory_id, slug);

comment on column public.directory_entries.slug is
  'Url-safe, per-directory-unique slug for this entry''s canonical public URL (DIR-E2). Auto-generated from name on insert if not supplied; never auto-changed afterward (see directory_redirects for what happens when it IS changed).';

-- 2) SEO override columns (docs/DIRECTORIES.md §4.1/§4.2)

alter table public.directory_entries
  add column meta_title text null,
  add column meta_description text null,
  add column noindex boolean null,
  add column structured_data_type text null check (structured_data_type is null or structured_data_type in ('LocalBusiness', 'Organization', 'Person')),
  add column sitemap_priority numeric(2, 1) null check (sitemap_priority is null or sitemap_priority between 0 and 1);

comment on column public.directory_entries.noindex is
  'Per-entry override of directories.seo_defaults_json.default_noindex; null = inherit the directory default.';

alter table public.directories
  add column seo_defaults_json jsonb null;

comment on column public.directories.seo_defaults_json is
  'Directory-level SEO defaults (docs/DIRECTORIES.md §4.1): meta_title_template, meta_description, default_noindex, default_structured_data_type, llms_txt_extra.';

-- 3) directory_publications + publish/rollback/list RPCs — mirrors
--    map_publications' final (tenant-checked) definition exactly.

create table public.directory_publications (
  id uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  version integer not null,
  config jsonb not null,
  note text null,
  published_at timestamptz not null default now(),
  published_by uuid null references auth.users(id),
  unique (directory_id, version)
);

create index idx_directory_publications_directory_id_version_desc
  on public.directory_publications(directory_id, version desc);

alter table public.directories
  add column current_publication_id uuid null,
  add column published_at timestamptz null;

comment on column public.directories.current_publication_id is
  'Points at the active publication row; no FK to avoid a circular dependency with directory_publications (mirrors maps.current_publication_id).';

alter table public.directory_publications enable row level security;

create policy "directory_publications_admin_all"
  on public.directory_publications for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "directory_publications_own_client"
  on public.directory_publications for all
  to authenticated
  using (directory_id in (select id from public.directories where client_id = public.current_user_client_id()))
  with check (directory_id in (select id from public.directories where client_id = public.current_user_client_id()));

grant select, insert, update, delete on table public.directory_publications to authenticated, service_role;

create or replace function public.publish_directory(
  p_directory_id text,
  p_config jsonb,
  p_note text default null
)
returns public.directory_publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_ver integer;
  v_pub      public.directory_publications%rowtype;
  v_note     text;
  v_client   text;
begin
  select client_id into v_client from public.directories where id = p_directory_id;
  if not found then
    raise exception 'Directory not found';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_client)
  ) then
    raise exception 'Access denied';
  end if;

  if coalesce((p_config->>'schemaVersion')::integer, 0) <> 1 then
    raise exception 'Invalid publication config: schemaVersion must be 1';
  end if;
  if p_config->'directory' is null then
    raise exception 'Invalid publication config: missing directory';
  end if;

  select coalesce(max(version), 0) + 1
    into v_next_ver
  from public.directory_publications
  where directory_id = p_directory_id;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  insert into public.directory_publications (directory_id, version, config, note, published_by)
  values (p_directory_id, v_next_ver, p_config, v_note, auth.uid())
  returning * into v_pub;

  update public.directories
  set
    current_publication_id = v_pub.id,
    published_at = v_pub.published_at
  where id = p_directory_id;

  return v_pub;
end;
$$;

create or replace function public.rollback_directory_to(
  p_directory_id text,
  p_publication_id uuid
)
returns public.directory_publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src      public.directory_publications%rowtype;
  v_next_ver integer;
  v_pub      public.directory_publications%rowtype;
  v_client   text;
begin
  select client_id into v_client from public.directories where id = p_directory_id;
  if not found then
    raise exception 'Directory not found';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_client)
  ) then
    raise exception 'Access denied';
  end if;

  select * into v_src
  from public.directory_publications
  where id = p_publication_id and directory_id = p_directory_id;

  if not found then
    raise exception 'Publication not found for this directory';
  end if;

  select coalesce(max(version), 0) + 1
    into v_next_ver
  from public.directory_publications
  where directory_id = p_directory_id;

  insert into public.directory_publications (directory_id, version, config, note, published_by)
  values (
    p_directory_id,
    v_next_ver,
    v_src.config,
    format('Restore version %s', v_src.version),
    auth.uid()
  )
  returning * into v_pub;

  update public.directories
  set
    current_publication_id = v_pub.id,
    published_at = v_pub.published_at
  where id = p_directory_id;

  return v_pub;
end;
$$;

create or replace function public.list_directory_publications(p_directory_id text)
returns setof public.directory_publications
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_client text;
begin
  select client_id into v_client from public.directories where id = p_directory_id;
  if not found then
    raise exception 'Directory not found';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_client)
  ) then
    raise exception 'Access denied';
  end if;

  return query
    select * from public.directory_publications
    where directory_id = p_directory_id
    order by version desc;
end;
$$;

revoke all on function public.publish_directory(text, jsonb, text) from public;
revoke all on function public.rollback_directory_to(text, uuid) from public;
revoke all on function public.list_directory_publications(text) from public;

grant execute on function public.publish_directory(text, jsonb, text) to authenticated;
grant execute on function public.rollback_directory_to(text, uuid) to authenticated;
grant execute on function public.list_directory_publications(text) to authenticated;

-- 4) directory_redirects (docs/DIRECTORIES.md §5.11) — deferred from Phase 2
--    because directory_entries.slug didn't exist yet.

create table public.directory_redirects (
  id uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  old_slug text not null,
  entry_id text not null references public.directory_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (directory_id, old_slug)
);

create index idx_directory_redirects_directory_id on public.directory_redirects(directory_id);

comment on table public.directory_redirects is
  'Records an entry''s previous slug so its public URL keeps working after a rename (docs/DIRECTORIES.md §5.11). Populated automatically by trg_record_directory_entry_slug_redirect.';

create or replace function public.record_directory_entry_slug_redirect()
returns trigger
language plpgsql
as $$
begin
  if old.slug is distinct from new.slug then
    insert into public.directory_redirects (directory_id, old_slug, entry_id)
    values (new.directory_id, old.slug, new.id)
    on conflict (directory_id, old_slug) do update set entry_id = excluded.entry_id, created_at = now();
  end if;
  return new;
end;
$$;

comment on function public.record_directory_entry_slug_redirect() is
  'AFTER UPDATE hook on public.directory_entries. Whenever slug changes, records the old slug as a redirect to this entry. on conflict handles a slug being reused a second time (e.g. A renamed away from "foo", then B renamed to "foo" later, then B renamed again — "foo" now redirects to whichever entry most recently held it).';

drop trigger if exists trg_record_directory_entry_slug_redirect on public.directory_entries;
create trigger trg_record_directory_entry_slug_redirect
  after update on public.directory_entries
  for each row
  execute function public.record_directory_entry_slug_redirect();

alter table public.directory_redirects enable row level security;

create policy "directory_redirects_admin_all"
  on public.directory_redirects for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "directory_redirects_own_client"
  on public.directory_redirects for select
  to authenticated
  using (directory_id in (select id from public.directories where client_id = public.current_user_client_id()));

grant select on table public.directory_redirects to authenticated, service_role;
grant insert, update on table public.directory_redirects to service_role;

-- 5) directory_contact_submissions — mirrors map_contact_submissions exactly.

create table public.directory_contact_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  directory_id text not null references public.directories(id) on delete cascade,
  entry_id text null references public.directory_entries(id) on delete set null,
  entry_name text null,
  to_email text not null,
  sender_name text null,
  sender_email text not null,
  sender_phone text null,
  message text not null,
  surface text not null default 'published',
  email_sent boolean null,
  email_error text null,
  constraint directory_contact_submission_surface check (
    surface in ('published', 'client_preview', 'admin_preview')
  )
);

create index idx_directory_contact_submissions_directory_time
  on public.directory_contact_submissions(directory_id, submitted_at desc);

create index idx_directory_contact_submissions_entry
  on public.directory_contact_submissions(entry_id)
  where entry_id is not null;

comment on table public.directory_contact_submissions is
  'Visitor contact form submissions from published directories (build-scope §5.10 enquiry). Peer of map_contact_submissions. The enquiry form UI and email-sending Edge Function are separate, later work — this is the table + RLS only.';

alter table public.directory_contact_submissions enable row level security;

create policy "directory_contact_submissions_anon_insert"
  on public.directory_contact_submissions for insert
  to anon
  with check (
    exists (
      select 1 from public.directories d
      where d.id = directory_contact_submissions.directory_id
        and d.published_at is not null
    )
    and (
      directory_contact_submissions.entry_id is null
      or exists (
        select 1 from public.directory_entries e
        where e.id = directory_contact_submissions.entry_id
          and e.directory_id = directory_contact_submissions.directory_id
      )
    )
  );

create policy "directory_contact_submissions_authenticated_insert"
  on public.directory_contact_submissions for insert
  to authenticated
  with check (true);

create policy "directory_contact_submissions_authenticated_select"
  on public.directory_contact_submissions for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
    or exists (
      select 1
      from public.directories d
      join public.contacts c on c.client_id = d.client_id and c.user_id = auth.uid()
      where d.id = directory_contact_submissions.directory_id
        and (
          c.role in ('owner', 'manager')
          or exists (
            select 1 from public.contact_directory_permissions cdp
            where cdp.contact_id = c.id and cdp.directory_id = d.id
          )
        )
    )
  );

grant select, insert on table public.directory_contact_submissions to anon;
grant select, insert on table public.directory_contact_submissions to authenticated;
grant select, insert, update on table public.directory_contact_submissions to service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'slug') then
    raise exception 'VERIFY FAILED: directory_entries.slug was not created';
  end if;
  if exists (select 1 from public.directory_entries where slug is null) then
    raise exception 'VERIFY FAILED: some directory_entries still have a null slug';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'directory_entries_directory_id_slug_key') then
    raise exception 'VERIFY FAILED: directory_entries_directory_id_slug_key unique constraint was not created';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_set_directory_entry_slug') then
    raise exception 'VERIFY FAILED: trg_set_directory_entry_slug was not created';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_record_directory_entry_slug_redirect') then
    raise exception 'VERIFY FAILED: trg_record_directory_entry_slug_redirect was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_publications') then
    raise exception 'VERIFY FAILED: directory_publications was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_redirects') then
    raise exception 'VERIFY FAILED: directory_redirects was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_contact_submissions') then
    raise exception 'VERIFY FAILED: directory_contact_submissions was not created';
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'publish_directory') then
    raise exception 'VERIFY FAILED: publish_directory() was not created';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Row counts — directories/directory_entries counts must be unchanged (additive only)
select
  'directories' as tbl, count(*) as rows from public.directories                   union all
  select 'directory_entries', count(*) from public.directory_entries               union all
  select 'directory_publications', count(*) from public.directory_publications     union all
  select 'directory_redirects', count(*) from public.directory_redirects           union all
  select 'directory_contact_submissions', count(*) from public.directory_contact_submissions
order by tbl;

-- Duplicate slug check — must return 0 rows
select directory_id, slug, count(*) from public.directory_entries group by directory_id, slug having count(*) > 1;

-- Orphan checks — should all return 0
select 'orphaned_directory_publications' as check_name, count(*) from public.directory_publications x
where not exists (select 1 from public.directories d where d.id = x.directory_id)
union all
select 'orphaned_directory_redirects', count(*) from public.directory_redirects x
where not exists (select 1 from public.directory_entries e where e.id = x.entry_id)
union all
select 'orphaned_directory_contact_submissions', count(*) from public.directory_contact_submissions x
where not exists (select 1 from public.directories d where d.id = x.directory_id);
