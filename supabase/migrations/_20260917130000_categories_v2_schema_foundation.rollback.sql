-- ============================================================
-- Rollback: 20260917130000_categories_v2_schema_foundation
-- Reverses: widen map_filter_fields.field_type to allow 'boolean';
--           add maps.color_filter_field_id
-- ============================================================

-- ------------------------------------------------------------
-- PRE-ROLLBACK CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'color_filter_field_id'
  ) then
    raise exception 'ABORT: column maps.color_filter_field_id does not exist — nothing to roll back';
  end if;

  -- Safety: refuse if any map has actually set this (an admin opted in).
  -- Only override this if that data can genuinely be discarded.
  if exists (select 1 from public.maps where color_filter_field_id is not null limit 1) then
    raise exception 'ABORT: color_filter_field_id has live data on at least one map — an admin has set a colour category. Back it up / confirm discard before rolling back.';
  end if;

  -- Safety: refuse if any map_filter_fields row actually uses 'boolean' —
  -- narrowing the constraint back would break that data.
  if exists (select 1 from public.map_filter_fields where field_type = 'boolean' limit 1) then
    raise exception 'ABORT: at least one map_filter_fields row uses field_type = boolean — narrowing the constraint would leave that row invalid. Resolve or re-type that data before rolling back.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

alter table public.maps drop column if exists color_filter_field_id;

do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'map_filter_fields'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%field_type%';

  if v_constraint_name is null then
    raise exception 'ABORT: could not find the current check constraint on map_filter_fields.field_type';
  end if;

  execute format('alter table public.map_filter_fields drop constraint %I', v_constraint_name);
  execute $c$alter table public.map_filter_fields
    add constraint map_filter_fields_field_type_check
    check (field_type in ('single_select', 'multi_select', 'text'))$c$;
end $$;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'color_filter_field_id'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: maps.color_filter_field_id still exists';
  end if;

  if exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'map_filter_fields'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%boolean%'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: map_filter_fields.field_type check constraint still allows boolean';
  end if;

  raise notice 'ROLLBACK VERIFY PASSED: color_filter_field_id removed, field_type constraint narrowed back to single_select/multi_select/text';
end $$;

-- Row counts — must be unchanged (rollback only removes an empty column /
-- narrows a constraint, no rows touched).
select
  'maps'               as tbl, count(*) as rows from public.maps               union all
  select 'map_filter_fields',       count(*) from public.map_filter_fields
order by tbl;
