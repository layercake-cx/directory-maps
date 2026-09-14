-- ============================================================
-- Rollback: 20260914170000_categorisations_field_type_and_attachment_order
-- Reverses: adds of categorisations.field_type and
--           categorisation_attachments.sort_order
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'field_type'
  ) then
    raise exception 'ABORT: column categorisations.field_type does not exist — nothing to roll back';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisation_attachments' and column_name = 'sort_order'
  ) then
    raise exception 'ABORT: column categorisation_attachments.sort_order does not exist — nothing to roll back';
  end if;

  -- Safety: refuse if any categorisation has actually been set to
  -- single_select/boolean, or any attachment given a non-default order —
  -- rolling back would silently discard that admin configuration.
  if exists (select 1 from public.categorisations where field_type <> 'multi_select') then
    raise exception 'ABORT: at least one categorisation is single_select/boolean — rolling back would discard that configuration. '
      'Confirm this is intended, then delete this check and re-run.';
  end if;
  if exists (select 1 from public.categorisation_attachments where sort_order <> 0) then
    raise exception 'ABORT: at least one categorisation_attachment has a non-default sort_order — rolling back would discard admin-configured facet order. '
      'Confirm this is intended, then delete this check and re-run.';
  end if;
end $$;

-- THE ROLLBACK
alter table public.categorisations drop column if exists field_type;
alter table public.categorisation_attachments drop column if exists sort_order;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'field_type'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: categorisations.field_type still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisation_attachments' and column_name = 'sort_order'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: categorisation_attachments.sort_order still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: field_type and sort_order columns removed';
end $$;
