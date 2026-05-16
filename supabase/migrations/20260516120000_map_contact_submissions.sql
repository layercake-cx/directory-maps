-- Directory map contact form submissions (visitor messages); clients analyse inquiries.

create table if not exists public.map_contact_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  map_id text not null references public.maps(id) on delete cascade,
  listing_id text null references public.listings(id) on delete set null,
  listing_name text null,
  to_email text not null,
  sender_name text null,
  sender_email text not null,
  sender_phone text null,
  message text not null,
  surface text not null default 'embed',
  email_sent boolean null,
  email_error text null,
  constraint map_contact_submission_surface check (
    surface in ('embed', 'client_preview', 'admin_preview')
  )
);

create index if not exists idx_map_contact_submissions_map_time
  on public.map_contact_submissions(map_id, submitted_at desc);

create index if not exists idx_map_contact_submissions_listing
  on public.map_contact_submissions(listing_id)
  where listing_id is not null;

comment on table public.map_contact_submissions is
  'Visitor contact form submissions from published maps. First row per submit logs form fields; optional follow-up row records email delivery failure.';

alter table public.map_contact_submissions enable row level security;

-- Embed / anon: insert for published maps; listing must belong to map when set.
create policy "map_contact_submissions_anon_insert"
  on public.map_contact_submissions for insert
  to anon
  with check (
    exists (
      select 1 from public.maps m
      where m.id = map_contact_submissions.map_id
        and m.published_at is not null
    )
    and (
      map_contact_submissions.listing_id is null
      or exists (
        select 1 from public.listings l
        where l.id = map_contact_submissions.listing_id
          and l.map_id = map_contact_submissions.map_id
      )
    )
  );

-- Preview surfaces use authenticated sessions.
create policy "map_contact_submissions_authenticated_insert"
  on public.map_contact_submissions for insert
  to authenticated
  with check (true);

-- Map team or admin: read submissions for reporting.
create policy "map_contact_submissions_authenticated_select"
  on public.map_contact_submissions for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
    or exists (
      select 1
      from public.maps m
      join public.contacts c on c.client_id = m.client_id and c.user_id = auth.uid()
      where m.id = map_contact_submissions.map_id
        and (
          c.role in ('owner', 'manager')
          or exists (
            select 1 from public.contact_map_permissions cmp
            where cmp.contact_id = c.id and cmp.map_id = m.id
          )
        )
    )
  );
