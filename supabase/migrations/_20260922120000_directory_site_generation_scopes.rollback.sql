-- ============================================================
-- Rollback: 20260922120000_directory_site_generation_scopes
-- Reverses: site_generation_manifest column and the entry-touch triggers
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'directories'
      and column_name = 'site_generation_manifest'
  ) then
    raise exception 'ABORT: column site_generation_manifest does not exist — nothing to roll back';
  end if;

  -- Derived publish bookkeeping, not user content. Refuse while any directory
  -- has a manifest so a rollback is a conscious choice. Clear the column
  -- (or remove this check) before re-running if you intend to discard it.
  if exists (select 1 from public.directories where site_generation_manifest is not null limit 1) then
    raise exception 'ABORT: site_generation_manifest has live data. It is rebuilt by the next full publish. To discard it, set the column null and re-run.';
  end if;
end $$;

-- THE ROLLBACK
drop trigger if exists trg_touch_entry_evidence_items on public.entry_evidence_items;
drop trigger if exists trg_touch_entry_media_assets on public.entry_media_assets;
drop trigger if exists trg_touch_entry_accreditations on public.entry_accreditations;
drop trigger if exists trg_touch_product_tiles on public.product_tiles;
drop trigger if exists trg_touch_prominent_links on public.prominent_links;
drop trigger if exists trg_touch_entry_category_terms on public.entry_category_terms;

drop function if exists public.touch_directory_entry_updated_at();

alter table public.directories drop column if exists site_generation_manifest;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'directories'
      and column_name = 'site_generation_manifest'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: site_generation_manifest still exists';
  end if;

  if exists (
    select 1 from pg_proc
    where proname = 'touch_directory_entry_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: touch_directory_entry_updated_at still exists';
  end if;

  raise notice 'ROLLBACK VERIFY PASSED: site generation scope bookkeeping removed';
end $$;
