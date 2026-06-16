-- Rollback: 20260616150000_add_email_message_subject

alter table public.clients
  drop column if exists email_message_subject;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'clients'
      and column_name  = 'email_message_subject'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: email_message_subject still exists';
  end if;
end $$;
