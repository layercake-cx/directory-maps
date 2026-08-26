-- ============================================================
-- Migration: 20260826120000_create_directory_entry_extras
-- Description: Phase 2 of the Directories build-out (see the build-scope
--              brief reconciled against docs/DIRECTORIES.md in this
--              session's plan). Six small, additive entities from the
--              brief's data model (§5) that don't yet exist:
--                - entry_evidence_items          (§5.5 Evidence item)
--                - entry_media_assets            (§5.6 Media asset)
--                - directory_accreditation_schemes + entry_accreditations
--                                                 (§5.7 Accreditation)
--                - prominent_links                (§5.8 Prominent link —
--                                                   directory- or entry-level)
--                - product_tiles                  (§5.9 Product tile)
--              Plus four boolean display-preference columns on
--              directory_entries (§5.10 Contact listing "which fields
--              are public"). The Redirect entity (§5.11) is deliberately
--              NOT included here — it needs directory_entries.slug,
--              which doesn't exist yet (that lands with DIR-E2/Phase 3's
--              publish work) — there is nothing to redirect from until
--              slugs exist.
--              RLS follows the exact `_admin_all` / `_own_client` pattern
--              already used by categorisations/entry_category_terms
--              (20260714130000_create_categorisations.sql) — no
--              anon_select policies yet, since publishing doesn't exist.
-- Affected tables: entry_evidence_items, entry_media_assets,
--                   directory_accreditation_schemes, entry_accreditations,
--                   prominent_links, product_tiles (all new);
--                   directory_entries (4 new nullable-default columns)
-- Rollback: _20260826120000_create_directory_entry_extras.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-26
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- If no error appears, the dry run passed. Then apply for real.
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- Run these BEFORE applying. Stop if any assertion fails.
-- ------------------------------------------------------------

-- A) Confirm the tables we reference exist
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directories'
  ) then
    raise exception 'ABORT: table public.directories does not exist (run 20260714120000_create_directories.sql first)';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directory_entries'
  ) then
    raise exception 'ABORT: table public.directory_entries does not exist (run 20260714120000_create_directories.sql first)';
  end if;
end $$;

-- B) Row counts — inspect before proceeding
select
  'directories'        as tbl, count(*) as rows from public.directories        union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
-- Save this output. You will compare it to the post-migration counts.

-- C) Idempotency guard — the new tables must NOT already exist
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'entry_evidence_items', 'entry_media_assets',
        'directory_accreditation_schemes', 'entry_accreditations',
        'prominent_links', 'product_tiles'
      )
  ) then
    raise exception 'ABORT: one of the new tables already exists — migration may have already run';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'show_phone'
  ) then
    raise exception 'ABORT: directory_entries.show_phone already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Evidence items (§5.5) — "why included" / claim-by-claim sourcing, entry-scoped.
create table public.entry_evidence_items (
  id uuid primary key default gen_random_uuid(),
  entry_id text not null references public.directory_entries(id) on delete cascade,
  claim text not null,
  value text null,
  source_url text null,
  checked_at date null,
  confidence text null check (confidence in ('verified', 'unverified', 'disputed')),
  note text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_eei_entry on public.entry_evidence_items(entry_id);

comment on table public.entry_evidence_items is
  'Per-claim evidence backing an entry (build-scope §5.5) — "the evidence we checked" content. Where a claim could not be verified, that is recorded (confidence=unverified/disputed) rather than assumed.';

-- 2) Media assets (§5.6) — gallery/hero photos, entry-scoped. Distinct from the
--    existing directory_entries.logo_url (a single logo/thumbnail, unchanged).
create table public.entry_media_assets (
  id uuid primary key default gen_random_uuid(),
  entry_id text not null references public.directory_entries(id) on delete cascade,
  url text not null,
  alt_text text not null,
  credit text null,
  caption text null,
  is_hero boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_ema_entry on public.entry_media_assets(entry_id);

-- At most one hero image per entry.
create unique index entry_media_assets_one_hero
  on public.entry_media_assets(entry_id)
  where is_hero;

comment on table public.entry_media_assets is
  'Entry gallery/hero images (build-scope §5.6). alt_text is required at the schema level, per the brief''s accessibility requirement. Responsive/modern-format processing is a later (publish-time) concern, not done here.';

-- 3) Accreditation schemes (§5.7) — the directory defines the schemes...
create table public.directory_accreditation_schemes (
  id uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  name text not null,
  issuing_body text null,
  badge_image_url text null,
  description text null,
  verification_note text null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index directory_accreditation_schemes_directory_name_key
  on public.directory_accreditation_schemes(directory_id, name);

create index idx_das_directory on public.directory_accreditation_schemes(directory_id);

comment on table public.directory_accreditation_schemes is
  'Accreditation scheme definitions, per directory (build-scope §5.7). A directory defines the schemes; entries hold them via entry_accreditations.';

-- ...and entries hold them.
create table public.entry_accreditations (
  entry_id text not null references public.directory_entries(id) on delete cascade,
  scheme_id uuid not null references public.directory_accreditation_schemes(id) on delete cascade,
  verified_at date null,
  created_at timestamptz not null default now(),
  primary key (entry_id, scheme_id)
);

create index idx_ea_entry on public.entry_accreditations(entry_id);
create index idx_ea_scheme on public.entry_accreditations(scheme_id);

comment on table public.entry_accreditations is
  'Tags an entry with an accreditation scheme it holds (build-scope §5.7), rendered as trust badges once publishing exists.';

-- 4) Prominent links (§5.8) — available at BOTH directory level (homepage link
--    tiles) and entry level (listing page link tiles). One polymorphic table
--    rather than two near-identical ones, matching the entity-polymorphic
--    shape planned for client_domains in a later phase.
create table public.prominent_links (
  id uuid primary key default gen_random_uuid(),
  directory_id text null references public.directories(id) on delete cascade,
  entry_id text null references public.directory_entries(id) on delete cascade,
  label text not null,
  url text not null check (url ~* '^https?://'),
  icon text null,
  style text not null default 'secondary' check (style in ('primary', 'secondary')),
  open_in_new boolean not null default true,
  tracking boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prominent_links_one_owner check (
    (case when directory_id is not null then 1 else 0 end)
    + (case when entry_id is not null then 1 else 0 end) = 1
  )
);

create index idx_pl_directory on public.prominent_links(directory_id) where directory_id is not null;
create index idx_pl_entry on public.prominent_links(entry_id) where entry_id is not null;

comment on table public.prominent_links is
  'A set of links displayed prominently (build-scope §5.8) — at directory level (homepage) or entry level (listing page), never both on one row. URL is checked http(s)-only at the schema level; rel="noopener"/"sponsored nofollow" rendering rules are an app-layer concern, applied when these are actually rendered (a later phase).';

-- 5) Product tiles (§5.9) — Viator-style booking cards, entry-scoped only
--    (the brief places these on listing pages, not the directory homepage).
create table public.product_tiles (
  id uuid primary key default gen_random_uuid(),
  entry_id text not null references public.directory_entries(id) on delete cascade,
  title text not null,
  image_url text null,
  price numeric(10, 2) null,
  currency text null,
  rating numeric(2, 1) null check (rating is null or rating between 0 and 5),
  review_count integer null check (review_count is null or review_count >= 0),
  provider text null,
  destination_url text not null check (destination_url ~* '^https?://'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pt_entry on public.product_tiles(entry_id);

comment on table public.product_tiles is
  'External booking/product tiles (build-scope §5.9, e.g. Viator). Entered manually here — provider-API import is a later, separate decision (see docs/DIRECTORIES.md §11). Inclusion/ranking of entries must never depend on these (enforced at the app layer, not schema-enforceable).';

-- 6) Contact listing display preferences (§5.10) — which fields are public.
--    Default true (matches current behaviour: nothing reads these yet, so
--    "true" is a no-op until a public rendering path exists in a later phase).
alter table public.directory_entries
  add column show_phone boolean not null default true,
  add column show_email boolean not null default true,
  add column show_website boolean not null default true,
  add column show_address boolean not null default true;

comment on column public.directory_entries.show_phone is
  'Contact listing display preference (build-scope §5.10) — whether phone is shown on the public entry page once publishing exists.';


-- ------------------------------------------------------------
-- RLS: tenant-scoped, mirrors entry_category_terms/directory_category_terms
-- exactly (20260714130000_create_categorisations.sql). No anon_select
-- policies yet — no publish concept until DIR-E2/Phase 3.
-- ------------------------------------------------------------

alter table public.entry_evidence_items enable row level security;
alter table public.entry_media_assets enable row level security;
alter table public.directory_accreditation_schemes enable row level security;
alter table public.entry_accreditations enable row level security;
alter table public.prominent_links enable row level security;
alter table public.product_tiles enable row level security;

-- ---- entry_evidence_items ----
create policy "eei_admin_all"
  on public.entry_evidence_items for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "eei_own_client"
  on public.entry_evidence_items for all
  to authenticated
  using (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  )
  with check (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  );

-- ---- entry_media_assets ----
create policy "ema_admin_all"
  on public.entry_media_assets for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "ema_own_client"
  on public.entry_media_assets for all
  to authenticated
  using (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  )
  with check (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  );

-- ---- directory_accreditation_schemes ----
create policy "das_admin_all"
  on public.directory_accreditation_schemes for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "das_own_client"
  on public.directory_accreditation_schemes for all
  to authenticated
  using (directory_id in (select id from public.directories where client_id = public.current_user_client_id()))
  with check (directory_id in (select id from public.directories where client_id = public.current_user_client_id()));

-- ---- entry_accreditations ----
create policy "ea_admin_all"
  on public.entry_accreditations for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "ea_own_client"
  on public.entry_accreditations for all
  to authenticated
  using (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  )
  with check (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  );

-- ---- prominent_links ----
create policy "pl_admin_all"
  on public.prominent_links for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "pl_own_client"
  on public.prominent_links for all
  to authenticated
  using (
    (directory_id is not null and directory_id in (
      select id from public.directories where client_id = public.current_user_client_id()
    ))
    or
    (entry_id is not null and entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    ))
  )
  with check (
    (directory_id is not null and directory_id in (
      select id from public.directories where client_id = public.current_user_client_id()
    ))
    or
    (entry_id is not null and entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    ))
  );

-- ---- product_tiles ----
create policy "pt_admin_all"
  on public.product_tiles for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "pt_own_client"
  on public.product_tiles for all
  to authenticated
  using (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  )
  with check (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  );

-- ------------------------------------------------------------
-- Data API grants (RLS still governs; these just let PostgREST reach the tables)
-- ------------------------------------------------------------
grant select, insert, update, delete on table public.entry_evidence_items to authenticated, service_role;
grant select, insert, update, delete on table public.entry_media_assets to authenticated, service_role;
grant select, insert, update, delete on table public.directory_accreditation_schemes to authenticated, service_role;
grant select, insert, update, delete on table public.entry_accreditations to authenticated, service_role;
grant select, insert, update, delete on table public.prominent_links to authenticated, service_role;
grant select, insert, update, delete on table public.product_tiles to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_evidence_items') then
    raise exception 'VERIFY FAILED: entry_evidence_items was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_media_assets') then
    raise exception 'VERIFY FAILED: entry_media_assets was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_accreditation_schemes') then
    raise exception 'VERIFY FAILED: directory_accreditation_schemes was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_accreditations') then
    raise exception 'VERIFY FAILED: entry_accreditations was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'prominent_links') then
    raise exception 'VERIFY FAILED: prominent_links was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'product_tiles') then
    raise exception 'VERIFY FAILED: product_tiles was not created';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'show_phone') then
    raise exception 'VERIFY FAILED: directory_entries.show_phone was not added';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Row counts — confirm no existing data was touched (directories/directory_entries counts must match the pre-migration snapshot)
select
  'directories'        as tbl, count(*) as rows from public.directories        union all
  select 'directory_entries', count(*) from public.directory_entries          union all
  select 'entry_evidence_items', count(*) from public.entry_evidence_items    union all
  select 'entry_media_assets', count(*) from public.entry_media_assets        union all
  select 'directory_accreditation_schemes', count(*) from public.directory_accreditation_schemes union all
  select 'entry_accreditations', count(*) from public.entry_accreditations    union all
  select 'prominent_links', count(*) from public.prominent_links              union all
  select 'product_tiles', count(*) from public.product_tiles
order by tbl;

-- Orphan checks — should all return 0 rows
select 'orphaned_eei' as check_name, count(*) from public.entry_evidence_items x where not exists (select 1 from public.directory_entries e where e.id = x.entry_id)
union all
select 'orphaned_ema', count(*) from public.entry_media_assets x where not exists (select 1 from public.directory_entries e where e.id = x.entry_id)
union all
select 'orphaned_das', count(*) from public.directory_accreditation_schemes x where not exists (select 1 from public.directories d where d.id = x.directory_id)
union all
select 'orphaned_ea_entry', count(*) from public.entry_accreditations x where not exists (select 1 from public.directory_entries e where e.id = x.entry_id)
union all
select 'orphaned_ea_scheme', count(*) from public.entry_accreditations x where not exists (select 1 from public.directory_accreditation_schemes s where s.id = x.scheme_id)
union all
select 'orphaned_pl', count(*) from public.prominent_links x where
  (x.directory_id is not null and not exists (select 1 from public.directories d where d.id = x.directory_id))
  or (x.entry_id is not null and not exists (select 1 from public.directory_entries e where e.id = x.entry_id))
union all
select 'orphaned_pt', count(*) from public.product_tiles x where not exists (select 1 from public.directory_entries e where e.id = x.entry_id);
