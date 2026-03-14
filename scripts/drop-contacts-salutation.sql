-- Remove salutation from contacts. Run in Supabase SQL Editor if the column exists.
alter table public.contacts drop column if exists salutation;
