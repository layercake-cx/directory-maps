-- Contact permissions: primary contact (or users with these flags) can manage maps and/or users for the client.
alter table public.contacts
  add column if not exists can_manage_maps boolean not null default false,
  add column if not exists can_manage_users boolean not null default false;

comment on column public.contacts.can_manage_maps is 'When true, this contact can create/edit/delete maps for the client. Primary contact always has this.';
comment on column public.contacts.can_manage_users is 'When true, this contact can add and manage other users (contacts) and their permissions. Primary contact always has this.';
