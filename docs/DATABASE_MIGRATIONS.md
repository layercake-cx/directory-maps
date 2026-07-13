# Database Migration Policy

All schema changes to the Supabase database must follow this policy — for agents and humans alike. The two environments are **staging** (Supabase test project, Vercel Preview) and **production** (Supabase prod project, Vercel Production). See `docs/ENVIRONMENTS_SETUP.md` for connection details.

---

## Golden rules

1. **Never run on production without first running on staging.** No exceptions.
2. **Every migration must have a rollback script** in the same PR/commit.
3. **Every migration must be dry-run first** (transaction that is rolled back) to verify it parses and executes without error.
4. **Never drop a table, drop a column, or truncate** in the same migration that also creates or modifies other objects. Destructive operations require a standalone migration with an explicit safety checklist (see below).
5. **Every migration must be recorded in `docs/DEPLOYMENTS.md`** — list the migration filename and describe in plain English what it does and why.
5. **Verify row counts and schema state** before and after every migration on every environment.

---

## File naming

```
supabase/migrations/YYYYMMDDHHMMSS_short_description.sql
```

Use UTC time. Keep the description lowercase, underscored, descriptive:

```
20260601120000_add_listings_logo_bg.sql        ✓
20260601120000_fix.sql                          ✗  (too vague)
20260601120000_AddLogoBackground.sql            ✗  (wrong case)
```

A paired rollback file lives alongside it, **prefixed with an underscore** so the
Supabase CLI skips it (the CLI applies every `<timestamp>_name.sql` file it finds;
rollback files must not match that pattern):

```
supabase/migrations/20260601120000_add_listings_logo_bg.sql
supabase/migrations/_20260601120000_add_listings_logo_bg.rollback.sql
```

---

## Migration file structure

Every migration file must follow this template exactly:

```sql
-- ============================================================
-- Migration: 20260601120000_add_listings_logo_bg
-- Description: Adds logo_bg (nullable text) to listings table
--              to store a CSS colour for the logo background.
-- Affected tables: listings
-- Rollback: 20260601120000_add_listings_logo_bg.rollback.sql
-- Author: <name or agent>
-- Date: 2026-06-01
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECK
-- Run these assertions BEFORE applying. If any fail, stop.
do $$
begin
  -- 1. Confirm the target table exists
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listings'
  ) then
    raise exception 'ABORT: table public.listings does not exist';
  end if;

  -- 2. Confirm the column does NOT already exist (idempotency guard)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'logo_bg'
  ) then
    raise exception 'ABORT: column logo_bg already exists — migration may have already run';
  end if;
end $$;

-- CAPTURE PRE-STATE
-- Save row counts before any changes (used for post-verification).
-- In the SQL editor, inspect these results before continuing.
select
  count(*)                              as total_listings,
  count(*) filter (where logo_bg is not null) as listings_with_logo_bg
from public.listings;
-- Expected: listings_with_logo_bg = 0 (column about to be added)


-- ============================================================
-- THE MIGRATION
-- ============================================================

alter table public.listings
  add column if not exists logo_bg text null;

comment on column public.listings.logo_bg
  is 'CSS colour string for the listing logo background (null = transparent/none).';


-- ============================================================
-- POST-MIGRATION VERIFICATION
-- Run these after applying. All assertions must pass.
-- ============================================================

do $$
begin
  -- Column now exists
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'logo_bg'
  ) then
    raise exception 'VERIFY FAILED: column logo_bg was not created';
  end if;

  -- Column is nullable (no NOT NULL constraint)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'logo_bg'
      and is_nullable = 'NO'
  ) then
    raise exception 'VERIFY FAILED: logo_bg should be nullable but is NOT NULL';
  end if;

  raise notice 'VERIFY PASSED: logo_bg column exists and is nullable';
end $$;

-- Confirm row count is unchanged (no accidental data loss)
select
  count(*)                              as total_listings,
  count(*) filter (where logo_bg is not null) as listings_with_logo_bg
from public.listings;
-- Expected: total_listings unchanged, listings_with_logo_bg = 0
```

---

## Rollback file structure

The rollback must exactly reverse the migration. It uses the same pre/post check pattern:

```sql
-- ============================================================
-- Rollback: 20260601120000_add_listings_logo_bg
-- Reverses: add column logo_bg to listings
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'logo_bg'
  ) then
    raise exception 'ABORT: column logo_bg does not exist — nothing to roll back';
  end if;

  -- Safety: refuse if any rows have data in this column
  -- (comment out only if you are certain the data can be discarded)
  if exists (select 1 from public.listings where logo_bg is not null limit 1) then
    raise exception 'ABORT: logo_bg has live data — back it up before rolling back. '
      'To override, delete this check and re-run.';
  end if;
end $$;

-- THE ROLLBACK
alter table public.listings drop column if exists logo_bg;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'logo_bg'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: column logo_bg still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: logo_bg column removed';
end $$;
```

---

## Dry-run procedure

A dry run wraps the entire migration in a transaction and rolls it back. It proves the SQL is valid and would execute cleanly — without making any persistent change.

**In the Supabase SQL editor:**

```sql
begin;

-- Paste the full migration body here (everything between the
-- PRE-MIGRATION CHECK block and the POST-MIGRATION VERIFICATION block)

alter table public.listings add column if not exists logo_bg text null;

-- If you reach this line without an error, the SQL is valid.
-- The rollback below discards all changes.
rollback;
```

A dry run **passes** when:
- No error is thrown.
- The editor returns without exception.

A dry run **fails** when any error appears. Fix the SQL before proceeding. Do not commit a migration that has not passed its dry run.

> **Supabase note:** DDL (`ALTER TABLE`, `CREATE TABLE`, etc.) is transactional in PostgreSQL. `ROLLBACK` after DDL statements reverses them completely. The only exceptions are `CREATE DATABASE`, `DROP DATABASE`, and a few other cluster-level commands — none of which appear in this project.

---

## Staging → Production workflow

Follow these steps in order. Do not skip or reorder.

### Step 1 — Write and review

- Create the migration file and rollback file locally.
- Run the **dry run** locally against the staging database (SQL editor for the Supabase test project).
- Peer-review or self-review the files before proceeding.

### Step 2 — Apply to staging

```bash
# Link CLI to the staging project
supabase link --project-ref YOUR_STAGING_PROJECT_REF

# Dry-run check (shows what would be applied without applying)
supabase db push --dry-run

# Apply
supabase db push
```

Or paste the migration into the Supabase **test project** SQL editor and run it.

**After applying to staging:**

1. Run the **post-migration verification block** from the migration file.
2. Smoke-test the affected feature in the Preview/staging app.
3. Confirm row counts are unchanged for tables that should not have lost rows.
4. Keep staging in this state for at least one deploy cycle before touching production.

### Step 3 — Apply to production

Only proceed when staging is verified and stable.

```bash
# Relink CLI to the production project
supabase link --project-ref YOUR_PRODUCTION_PROJECT_REF

# Confirm which migrations are pending (should match exactly what staging just ran)
supabase db push --dry-run

# Apply
supabase db push
```

Or paste the migration into the Supabase **production project** SQL editor.

**After applying to production:**

1. Run the **post-migration verification block** again.
2. Smoke-test the live app.
3. Record the migration as applied (Git history + any ops log you maintain).

### Step 4 — Rollback if needed

If something goes wrong on either environment:

1. Run the **rollback file** for that migration (paste into SQL editor or use CLI).
2. Verify the rollback verification block passes.
3. Do not re-attempt the forward migration until the root cause is identified and fixed.

---

## Integrity verification checklist

Run this checklist **before every migration** (forward or rollback) on any environment. It takes under two minutes.

```sql
-- 1. Row counts — paste and inspect before proceeding
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings          union all
  select 'profiles',  count(*) from public.profiles
order by tbl;

-- 2. RLS enabled on all user-data tables
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('clients','maps','groups','listings','profiles','contacts')
order by tablename;
-- Expected: rowsecurity = true for all rows

-- 3. No orphaned maps (maps without a valid client)
select count(*) as orphaned_maps
from public.maps m
where not exists (select 1 from public.clients c where c.id = m.client_id);
-- Expected: 0

-- 4. No orphaned listings (listings without a valid map)
select count(*) as orphaned_listings
from public.listings l
where not exists (select 1 from public.maps m where m.id = l.map_id);
-- Expected: 0

-- 5. No orphaned groups
select count(*) as orphaned_groups
from public.groups g
where not exists (select 1 from public.maps m where m.id = g.map_id);
-- Expected: 0

-- 6. Filter-field tables (present from 20260713120000_create_map_filter_fields)
select
  'map_filter_fields'        as tbl, count(*) as rows from public.map_filter_fields union all
  select 'map_filter_field_options', count(*) from public.map_filter_field_options   union all
  select 'listing_filter_values',    count(*) from public.listing_filter_values
order by tbl;

-- 7. No orphaned filter-field rows
select count(*) as orphaned_filter_fields
from public.map_filter_fields f
where not exists (select 1 from public.maps m where m.id = f.map_id);
select count(*) as orphaned_filter_options
from public.map_filter_field_options o
where not exists (select 1 from public.map_filter_fields f where f.id = o.field_id);
select count(*) as orphaned_filter_values_listing
from public.listing_filter_values v
where not exists (select 1 from public.listings l where l.id = v.listing_id);
select count(*) as orphaned_filter_values_field
from public.listing_filter_values v
where not exists (select 1 from public.map_filter_fields f where f.id = v.field_id);
-- Expected: 0 for all
```

Save the output. After the migration, rerun the same queries and confirm:
- Row counts are the same (or have only increased as expected for additive migrations).
- RLS is still enabled on all tables.
- Orphan counts are still zero.

**If any count changes unexpectedly — stop and investigate before deploying the frontend.**

---

## Forbidden operations (require explicit sign-off)

The following SQL commands must **never** appear in a migration without a separate documented decision and a mandatory pre-backup step:

| Forbidden | Reason |
|-----------|--------|
| `DROP TABLE` | Permanent data loss |
| `TRUNCATE` | Permanent data loss |
| `DROP COLUMN` | Permanent data loss (allowed in rollback files only, with data-present safety check) |
| `DELETE FROM … WHERE` (bulk) | Row-level data loss |
| `ALTER TABLE … RENAME TO` | Breaks app code silently until deployed |
| `ALTER COLUMN … SET NOT NULL` without default | Fails if any nulls exist; locks table |
| `CREATE INDEX` without `CONCURRENTLY` | Locks table during build (use `CONCURRENTLY`) |

**Before any forbidden operation:**

1. Snapshot the affected table: `pg_dump -t public.<table> --schema-only` + a row-count record.
2. If data would be deleted, export the rows to a backup table first:
   ```sql
   create table public.<table>_backup_YYYYMMDD as
   select * from public.<table>;
   ```
3. Confirm the backup exists and row count matches before proceeding.
4. Document the decision in the PR description.

---

## Agents: when Cursor or Claude Code writes a migration

- Output the migration file and rollback file. Do not apply them.
- Include the dry-run block as a comment at the top of the migration file.
- Include the integrity verification checklist as a comment at the bottom.
- State clearly in the chat: _"Run the dry run first, then apply to staging, verify, then production."_
- Never instruct the user to run `supabase db push` against production as a first step.
- If the migration contains any forbidden operation, flag it explicitly and require the user to confirm before proceeding.
