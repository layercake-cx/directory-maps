-- ============================================================
-- Rollback: 20261111100000_manual_claim_review
-- Reverses: drops the two functions and claim_requests.claim_id. Claims already
-- created from manual requests stay in public.claims (status claim_started) and
-- keep the listing reserved; revoke them from the Claims tab if they should go.
-- ============================================================

-- Restore the pre-hardening access functions (no claim status check).
create or replace function public.link_claim_user_by_email()
returns integer language plpgsql security definer set search_path = public as $$
declare v_email text; v_count integer;
begin
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then raise exception 'No authenticated email found'; end if;
  update public.claim_users
  set user_id = auth.uid(), accepted_at = coalesce(accepted_at, now()), updated_at = now()
  where lower(email) = v_email and user_id is null and removed_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

create or replace function public.can_access_claim(p_claim_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.claim_users where claim_id = p_claim_id and user_id = auth.uid() and removed_at is null);
$$;

create or replace function public.is_claim_owner(p_claim_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.claim_users where claim_id = p_claim_id and user_id = auth.uid() and role = 'owner' and removed_at is null);
$$;

create or replace function public.get_my_claim_context()
returns table (claim_id uuid, claim_user_id uuid, directory_id text, directory_item_id text, entry_name text, claim_status text, role text)
language sql security definer stable set search_path = public as $$
  select c.id, cu.id, c.directory_id, c.directory_item_id, e.name, c.status, cu.role
  from public.claim_users cu
  join public.claims c on c.id = cu.claim_id
  join public.directory_entries e on e.id = c.directory_item_id
  where cu.user_id = auth.uid() and cu.removed_at is null;
$$;

drop function if exists public.claim_status_is_approved(text);

drop function if exists public.is_listing_claimable(text);
drop function if exists public.admin_approve_manual_claim(uuid, text);
drop function if exists public.create_manual_claim_request(text, text, text, text, text);
drop index if exists public.idx_claim_requests_claim;
alter table public.claim_requests drop column if exists claim_id;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'claim_requests' and column_name = 'claim_id'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: claim_id still present';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
