-- ============================================================
-- Migration: 20261126120000_create_block_pages
-- Description: Phase 1 of block-based page editing (entry detail pages and
--              directory content pages). Schema only — NOTHING reads these
--              tables yet, so no published page changes.
--
--              Model (agreed 2026-11-26):
--                * A block TEMPLATE (directory_block_templates) is a reusable
--                  content object in a directory's library: a block type,
--                  preset content, lock flags, and an optional "add to every
--                  page" rule (auto_add).
--                * A block INSTANCE (directory_page_blocks) belongs to exactly
--                  one page (an entry or a content page) and is what editors
--                  work with. It is LINKED to the template it came from:
--                    - data IS NULL  -> inherits the template's data (linked)
--                    - data NOT NULL -> the page's own content (detached, or
--                                       a block added from scratch with
--                                       template_id NULL)
--                  Detaching is per block, not per field. A content-locked
--                  instance must stay linked (enforced by the phase 2 RPCs).
--                * lock_position pins an instance to `placement` (start or
--                  end) of its region; admins are never bound by locks.
--
--              No draft/published layout tables: like notes_html today, rows
--              are the working state and the public site only changes when
--              the existing publish flow regenerates the static HTML.
--
--              Access: platform admins and client owners/managers
--              (can_manage_client) may write these tables directly. Other
--              client members and all claim users reach blocks ONLY through
--              item-scoped security-definer RPCs added in phase 2/5, because
--              locks can only be enforced server-side. Anonymous visitors
--              never read these tables (the Edge Function uses the service
--              role).
--
--              Also adds convert_entry_to_blocks() / convert_content_page_to_
--              blocks() / convert_directory_to_blocks(): idempotent, never
--              run by this migration, service_role only. They turn today's
--              page content (entry_templates layout, notes_html, content-page
--              body_html) into instances so a page can be switched over on
--              demand. See the function comments for the legacy "entry_*"
--              block types they emit.
-- Affected tables: directory_block_templates (new), directory_page_blocks (new)
-- Rollback: _20261126120000_create_block_pages.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-26
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste everything between "THE MIGRATION" and "POST-MIGRATION VERIFICATION" here>
--   ROLLBACK;
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_content_pages') then
    raise exception 'ABORT: table public.directory_content_pages does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_templates') then
    raise exception 'ABORT: table public.entry_templates does not exist';
  end if;
  if not exists (select 1 from pg_proc where proname = 'can_manage_client') then
    raise exception 'ABORT: function public.can_manage_client() does not exist — apply 20260923140000_claims_lifecycle_rpcs.sql first';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name in ('directory_block_templates', 'directory_page_blocks')) then
    raise exception 'ABORT: a block pages table already exists — migration may have already run';
  end if;
end $$;

-- Pre-state (compare after): none of these tables are modified.
select 'directory_entries' as tbl, count(*) as rows from public.directory_entries union all
select 'directory_content_pages', count(*) from public.directory_content_pages union all
select 'entry_templates', count(*) from public.entry_templates
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- ---- Block template library ----
create table public.directory_block_templates (
  id uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  page_kind text not null check (page_kind in ('entry', 'content_page')),
  name text not null check (length(trim(name)) between 1 and 120),
  -- Not a CHECK against a fixed list: the registry evolves in code
  -- (block-registry.json) and is validated by the phase 2 RPCs.
  block_type text not null check (block_type ~ '^[a-z][a-z0-9_]{0,39}$'),
  region text not null check (region in ('hero', 'main', 'sidebar')),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  common jsonb not null default '{}'::jsonb check (jsonb_typeof(common) = 'object'),
  lock_position boolean not null default false,
  lock_content boolean not null default false,
  -- Where a stamped instance goes in its region, and where a position-locked
  -- instance stays pinned.
  placement text not null default 'end' check (placement in ('start', 'end')),
  -- When true, the template is stamped onto every page of page_kind (new
  -- pages automatically; existing pages on an explicit admin backfill).
  auto_add boolean not null default false,
  -- Bumped whenever data/common change, so pages inheriting this template
  -- can be flagged as having unpublished changes.
  content_version integer not null default 1,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index directory_block_templates_name_key
  on public.directory_block_templates (directory_id, page_kind, lower(name));
create index idx_directory_block_templates_directory on public.directory_block_templates (directory_id);

comment on table public.directory_block_templates is
  'Block templates: a directory''s library of reusable content objects. Instances placed on pages (directory_page_blocks) link to a template until an editor changes them.';
comment on column public.directory_block_templates.auto_add is
  'Stamp this template onto every page of page_kind. New pages get it automatically; existing pages only via an explicit admin backfill.';
comment on column public.directory_block_templates.placement is
  'start or end of the region: where a stamped instance is inserted and where a position-locked instance stays pinned.';

-- ---- Block instances ----
create table public.directory_page_blocks (
  id uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  page_kind text not null check (page_kind in ('entry', 'content_page')),
  entry_id text null references public.directory_entries(id) on delete cascade,
  content_page_id text null references public.directory_content_pages(id) on delete cascade,
  region text not null check (region in ('hero', 'main', 'sidebar')),
  position integer not null default 0,
  block_type text not null check (block_type ~ '^[a-z][a-z0-9_]{0,39}$'),
  -- RESTRICT: deleting a template is a phase 2 RPC that first materialises
  -- the template's data into each linked instance (detaching it).
  template_id uuid null references public.directory_block_templates(id) on delete restrict,
  -- NULL = inherit template.data (linked). Non-null = this page's own content.
  data jsonb null check (data is null or jsonb_typeof(data) = 'object'),
  common jsonb not null default '{}'::jsonb check (jsonb_typeof(common) = 'object'),
  -- Effective locks. Copied from the template when stamped and kept in sync
  -- by the admin template RPC while the instance is linked.
  lock_position boolean not null default false,
  lock_content boolean not null default false,
  -- Provenance when produced by convert_*_to_blocks(); NULL for blocks made
  -- in the editor. Lets the rollback tell converted rows from edited ones.
  converted_from text null check (converted_from in ('entry_template', 'implicit_layout', 'notes_html', 'content_page_body', 'fixed_chrome')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  constraint directory_page_blocks_one_page check (
    (page_kind = 'entry' and entry_id is not null and content_page_id is null)
    or (page_kind = 'content_page' and content_page_id is not null and entry_id is null)
  ),
  constraint directory_page_blocks_has_content check (template_id is not null or data is not null)
);

create index idx_directory_page_blocks_entry on public.directory_page_blocks (entry_id, region, position) where entry_id is not null;
create index idx_directory_page_blocks_content_page on public.directory_page_blocks (content_page_id, region, position) where content_page_id is not null;
create index idx_directory_page_blocks_directory on public.directory_page_blocks (directory_id);
create index idx_directory_page_blocks_template on public.directory_page_blocks (template_id) where template_id is not null;

-- One instance of a given template per page (also makes backfill idempotent).
create unique index directory_page_blocks_template_entry_key
  on public.directory_page_blocks (template_id, entry_id) where template_id is not null and entry_id is not null;
create unique index directory_page_blocks_template_content_page_key
  on public.directory_page_blocks (template_id, content_page_id) where template_id is not null and content_page_id is not null;

comment on table public.directory_page_blocks is
  'Block instances: one row per block placed on an entry or content page. data NULL = inherits the linked template''s data; non-null = the page''s own content.';

-- ---- updated_at ----
create or replace function public.block_pages_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger directory_block_templates_touch_updated_at
  before update on public.directory_block_templates
  for each row execute function public.block_pages_touch_updated_at();
create trigger directory_page_blocks_touch_updated_at
  before update on public.directory_page_blocks
  for each row execute function public.block_pages_touch_updated_at();

-- ---- RLS ----
alter table public.directory_block_templates enable row level security;
alter table public.directory_page_blocks enable row level security;

-- Platform admins: everything.
create policy "directory_block_templates_admin_all"
  on public.directory_block_templates for all to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));
create policy "directory_page_blocks_admin_all"
  on public.directory_page_blocks for all to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

-- Client users may READ their directories' templates and blocks.
create policy "directory_block_templates_own_client_select"
  on public.directory_block_templates for select to authenticated
  using (directory_id in (select id from public.directories where client_id = public.current_user_client_id()));
create policy "directory_page_blocks_own_client_select"
  on public.directory_page_blocks for select to authenticated
  using (directory_id in (select id from public.directories where client_id = public.current_user_client_id()));

-- Direct WRITES are for the client's own contacts (owners/managers, i.e.
-- "directory admins"). Locks bind everyone else, so other members and claim
-- users must go through the phase 2/5 RPCs, which enforce them.
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

grant select, insert, update, delete on table public.directory_block_templates to authenticated, service_role;
grant select, insert, update, delete on table public.directory_page_blocks to authenticated, service_role;


-- ---- Converters (idempotent; NOT executed by this migration) ----
--
-- Legacy "entry_*" / "page_title" block types. Today's pages are mostly built
-- from entry data (sub-tables, categorisations) that the handoff's 18 generic
-- blocks do not cover, plus a fixed hero and sidebar. To switch a page over
-- with identical output, the converters emit data-bound blocks that render
-- from the entry exactly as builders.ts does now; `data` carries only
-- configuration ({"title": <admin section label>} and, for categorisation,
-- {"key": ...}):
--   entry_hero_image, entry_gallery, entry_accreditations, entry_evidence,
--   entry_product_tiles, entry_links, entry_categorisation   (main region,
--     from the resolved entry_templates layout)
--   entry_hero                                                (hero region)
--   entry_contact_panel, entry_map_card, entry_attributes, entry_tag_chips
--                                                             (sidebar region)
--   page_title                                                (content pages, hero)
-- notes_html and content-page body_html become ordinary `rich` blocks.
-- The claim banner and related-entries section stay page chrome for now.
-- Layout descriptors with hidden:true, and the four no-op legacy types (logo,
-- heading, address_map, contact_details), render nothing today and are skipped.
-- Template resolution mirrors builders.ts resolveLayout(): category-term
-- target (lowest term sort_order) > group target > directory default >
-- implicit pre-DIR-E6 order.

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
    v_count := v_count + 1;
  end loop;

  -- Sidebar region: the fixed panels, in today's order
  insert into public.directory_page_blocks (directory_id, page_kind, entry_id, region, position, block_type, data, converted_from)
  select v_entry.directory_id, 'entry', p_entry_id, 'sidebar', s.ord, s.btype, '{}'::jsonb, 'fixed_chrome'
  from (values (1, 'entry_contact_panel'), (2, 'entry_map_card'), (3, 'entry_attributes'), (4, 'entry_tag_chips')) as s(ord, btype);
  v_count := v_count + 4;

  return v_count;
end;
$$;

comment on function public.convert_entry_to_blocks(text) is
  'Idempotent. Turns an entry''s current page (resolved entry_templates layout, notes_html, the fixed hero and sidebar panels) into directory_page_blocks rows. Returns the number inserted; 0 if the entry already has blocks. Not invoked by any migration. Service role only; phase 2 wraps it with authorisation.';

create or replace function public.convert_content_page_to_blocks(p_page_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.directory_content_pages%rowtype;
  v_count integer := 0;
begin
  select * into v_page from public.directory_content_pages where id = p_page_id;
  if not found then
    raise exception 'content page % not found', p_page_id;
  end if;

  if exists (select 1 from public.directory_page_blocks where content_page_id = p_page_id) then
    return 0;
  end if;

  insert into public.directory_page_blocks (directory_id, page_kind, content_page_id, region, position, block_type, data, converted_from)
  values (v_page.directory_id, 'content_page', p_page_id, 'hero', 0, 'page_title', '{}'::jsonb, 'fixed_chrome');
  v_count := 1;

  -- body_html is already stored as HTML (sanitised on save by the editor).
  if trim(coalesce(v_page.body_html, '')) <> '' then
    insert into public.directory_page_blocks (directory_id, page_kind, content_page_id, region, position, block_type, data, converted_from)
    values (v_page.directory_id, 'content_page', p_page_id, 'main', 1, 'rich',
            jsonb_build_object('body', v_page.body_html, 'style', 'normal'), 'content_page_body');
    v_count := v_count + 1;
  end if;

  return v_count;
end;
$$;

comment on function public.convert_content_page_to_blocks(text) is
  'Idempotent. Turns a content page''s title and body_html into a page_title block (hero) and a rich block (main). Returns the number inserted; 0 if the page already has blocks. Not invoked by any migration. Service role only.';

create or replace function public.convert_directory_to_blocks(p_directory_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_entries integer := 0;
  v_pages integer := 0;
  v_blocks integer := 0;
  v_n integer;
begin
  for v_id in select id from public.directory_entries where directory_id = p_directory_id order by id loop
    v_n := public.convert_entry_to_blocks(v_id);
    if v_n > 0 then v_entries := v_entries + 1; v_blocks := v_blocks + v_n; end if;
  end loop;
  for v_id in select id from public.directory_content_pages where directory_id = p_directory_id order by id loop
    v_n := public.convert_content_page_to_blocks(v_id);
    if v_n > 0 then v_pages := v_pages + 1; v_blocks := v_blocks + v_n; end if;
  end loop;
  return jsonb_build_object('entries_converted', v_entries, 'content_pages_converted', v_pages, 'blocks_created', v_blocks);
end;
$$;

comment on function public.convert_directory_to_blocks(text) is
  'Runs convert_entry_to_blocks / convert_content_page_to_blocks over every page of a directory. Pages that already have blocks are skipped. Service role only.';

revoke all on function public.convert_entry_to_blocks(text) from public, anon, authenticated;
revoke all on function public.convert_content_page_to_blocks(text) from public, anon, authenticated;
revoke all on function public.convert_directory_to_blocks(text) from public, anon, authenticated;
grant execute on function public.convert_entry_to_blocks(text) to service_role;
grant execute on function public.convert_content_page_to_blocks(text) to service_role;
grant execute on function public.convert_directory_to_blocks(text) to service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_block_templates') then
    raise exception 'VERIFY FAILED: directory_block_templates was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_page_blocks') then
    raise exception 'VERIFY FAILED: directory_page_blocks was not created';
  end if;
  if (select count(*) from public.directory_block_templates) <> 0 or (select count(*) from public.directory_page_blocks) <> 0 then
    raise exception 'VERIFY FAILED: new tables should be empty (the migration converts nothing)';
  end if;
  if (select count(*) from pg_tables where schemaname = 'public' and tablename in ('directory_block_templates', 'directory_page_blocks') and rowsecurity) <> 2 then
    raise exception 'VERIFY FAILED: RLS is not enabled on both new tables';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('directory_block_templates', 'directory_page_blocks')) <> 6 then
    raise exception 'VERIFY FAILED: expected 6 RLS policies on the new tables';
  end if;
  if (select count(*) from pg_proc where proname in ('convert_entry_to_blocks', 'convert_content_page_to_blocks', 'convert_directory_to_blocks')) <> 3 then
    raise exception 'VERIFY FAILED: converter functions missing';
  end if;
  if has_function_privilege('authenticated', 'public.convert_entry_to_blocks(text)', 'execute') then
    raise exception 'VERIFY FAILED: convert_entry_to_blocks must not be callable by authenticated';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Existing tables unchanged (compare with the pre-state above).
select 'directory_entries' as tbl, count(*) as rows from public.directory_entries union all
select 'directory_content_pages', count(*) from public.directory_content_pages union all
select 'entry_templates', count(*) from public.entry_templates
order by tbl;

-- ------------------------------------------------------------
-- STAGING CONVERSION CHECK (optional, run by hand; changes data, so do it
-- inside a transaction and roll back unless you mean it):
--   begin;
--   select public.convert_directory_to_blocks('<directory_id>');
--   select block_type, region, count(*) from public.directory_page_blocks
--     where directory_id = '<directory_id>' group by 1, 2 order by 2, 1;
--   rollback;
-- ------------------------------------------------------------
