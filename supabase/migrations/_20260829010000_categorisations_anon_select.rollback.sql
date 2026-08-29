-- ============================================================
-- Rollback: 20260829010000_categorisations_anon_select
-- Reverts: adds back to authenticated/service_role-only access by dropping
--          the four anon_select policies and anon grants added by the
--          forward migration. No data is touched.
-- ============================================================

drop policy if exists "categorisations_anon_select" on public.categorisations;
drop policy if exists "category_terms_anon_select" on public.category_terms;
drop policy if exists "directory_category_terms_anon_select" on public.directory_category_terms;
drop policy if exists "entry_category_terms_anon_select" on public.entry_category_terms;

revoke select on table public.categorisations from anon;
revoke select on table public.category_terms from anon;
revoke select on table public.directory_category_terms from anon;
revoke select on table public.entry_category_terms from anon;

-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('categorisations', 'category_terms', 'directory_category_terms', 'entry_category_terms')
      and policyname like '%_anon_select'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: an anon_select policy still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
