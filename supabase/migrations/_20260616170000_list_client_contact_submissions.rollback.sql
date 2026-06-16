-- Rollback: 20260616170000_list_client_contact_submissions.sql

drop policy if exists "map_contact_submissions_authenticated_select" on public.map_contact_submissions;

create policy "map_contact_submissions_authenticated_select"
  on public.map_contact_submissions for select
  to authenticated
  using (
    public.is_admin()
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

revoke all on function public.list_client_contact_submissions(text, integer) from authenticated;
drop function if exists public.list_client_contact_submissions(text, integer);

revoke all on function public.can_access_client_messaging(text) from authenticated;
drop function if exists public.can_access_client_messaging(text);
