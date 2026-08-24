-- ============================================================
-- Rollback: 20260824120000_create_client_domains
-- Reverses: drops the client_domains table (and its policies/indexes/
--           constraints along with it).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_domains'
  ) then
    raise exception 'ABORT: nothing to roll back — table public.client_domains does not exist';
  end if;

  if exists (select 1 from public.client_domains limit 1) then
    raise exception
      'ABORT: client_domains has rows. Export/record any registered domains '
      'before rolling back — this drop is destructive. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop table if exists public.client_domains;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_domains'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: client_domains still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
