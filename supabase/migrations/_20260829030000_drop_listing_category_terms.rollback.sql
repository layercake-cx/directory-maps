-- ============================================================
-- Rollback: 20260829030000_drop_listing_category_terms
-- Reverts: re-creates listing_category_terms + categorisations.
--          applies_to_listings, i.e. re-applies the effect of
--          20260829020000_create_listing_category_terms. Only needed if
--          the decision to remove this feature itself needs reversing.
-- ============================================================

alter table public.categorisations
  add column applies_to_listings boolean not null default false;

comment on column public.categorisations.applies_to_listings is
  'Independent of applies_to (directory/entry/both) — when true, this categorisation is also offered for tagging map listings via listing_category_terms.';

create table public.listing_category_terms (
  listing_id text not null references public.listings(id) on delete cascade,
  term_id uuid not null references public.category_terms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, term_id)
);

create index idx_lct_listing on public.listing_category_terms(listing_id);
create index idx_lct_term on public.listing_category_terms(term_id);

alter table public.listing_category_terms enable row level security;

create policy "listing_category_terms_admin_all"
  on public.listing_category_terms for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "listing_category_terms_own_client"
  on public.listing_category_terms for all
  to authenticated
  using (
    listing_id in (
      select l.id from public.listings l
      join public.maps m on m.id = l.map_id
      where m.client_id = public.current_user_client_id()
    )
  )
  with check (
    listing_id in (
      select l.id from public.listings l
      join public.maps m on m.id = l.map_id
      where m.client_id = public.current_user_client_id()
    )
  );

create policy "listing_category_terms_anon_select"
  on public.listing_category_terms for select
  to anon
  using (
    exists (
      select 1
      from public.listings l
      join public.maps m on m.id = l.map_id
      where l.id = listing_category_terms.listing_id
        and m.published_at is not null
    )
  );

grant select, insert, update, delete on table public.listing_category_terms to authenticated, service_role;
grant select on table public.listing_category_terms to anon;

-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_category_terms') then
    raise exception 'ROLLBACK VERIFY FAILED: listing_category_terms was not re-created';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to_listings') then
    raise exception 'ROLLBACK VERIFY FAILED: categorisations.applies_to_listings was not re-created';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
