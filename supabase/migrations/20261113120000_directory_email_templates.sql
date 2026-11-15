-- ============================================================
-- Migration: 20261113120000_directory_email_templates
-- Description: Per-directory editable text for branded system emails (claim
--              sign-in link, claim invitation, claim-request notification).
--              One row per directory + template_key; a missing row or a null
--              field means "use the built-in default" (defaults live in
--              supabase/functions/_shared/systemEmail.ts).
-- Affected tables: directory_email_templates (new)
-- Rollback: _20261113120000_directory_email_templates.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-13
-- ============================================================
--
-- DRY-RUN BLOCK (run this first, it makes NO persistent changes):
--   BEGIN;
--   <paste THE MIGRATION body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run -> STAGING (beqejxneehilplrtpntn) -> verification ->
-- PRODUCTION (gxixwdjfmegxcxfeflro) only after explicit sign-off.
--
-- Forbidden operations: none. Purely additive new table.
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECKS
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_email_templates') then
    raise exception 'ABORT: public.directory_email_templates already exists';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: public.directories does not exist';
  end if;
end $$;

select count(*) as directories_rows from public.directories;
-- Must be UNCHANGED after.

-- THE MIGRATION
create table public.directory_email_templates (
  id uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  template_key text not null check (template_key in ('claim_sign_in', 'claim_invite', 'claim_request_notification')),
  subject text null check (subject is null or char_length(subject) <= 200),
  heading text null check (heading is null or char_length(heading) <= 200),
  body text null check (body is null or char_length(body) <= 5000),
  button_label text null check (button_label is null or char_length(button_label) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (directory_id, template_key)
);

comment on table public.directory_email_templates is
  'Editable text for a directory''s branded system emails. Null/missing = built-in default. Placeholders like {{directory_name}} are replaced and HTML-escaped when sent.';

alter table public.directory_email_templates enable row level security;

create policy directory_email_templates_admin_all on public.directory_email_templates
  for all to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy directory_email_templates_own_client on public.directory_email_templates
  for all to authenticated
  using (directory_id in (select id from public.directories where client_id = public.current_user_client_id()))
  with check (directory_id in (select id from public.directories where client_id = public.current_user_client_id()));

-- No anon access.
grant select, insert, update, delete on table public.directory_email_templates to authenticated, service_role;

-- POST-MIGRATION VERIFICATION
select count(*) as directories_rows from public.directories;           -- unchanged
select count(*) as directory_email_templates_rows from public.directory_email_templates; -- 0
select relrowsecurity from pg_class where oid = 'public.directory_email_templates'::regclass; -- true
