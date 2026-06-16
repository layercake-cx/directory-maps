-- Rollback: 20260616140000_add_email_message_intro
-- Drops email_message_intro from clients.

alter table public.clients
  drop column if exists email_message_intro;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'clients'
      and column_name  = 'email_message_intro'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: email_message_intro still exists';
  end if;
end $$;
