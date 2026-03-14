# Contacts table

If you see **"Could not find the table 'public.contacts' in the schema cache"** in the app (e.g. on Admin → Clients or Client portal sign-up), create the table in Supabase:

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. Go to **SQL Editor**.
3. Copy the contents of **`scripts/create-contacts-table.sql`** and run it.

The script is idempotent (`create table if not exists`), so it’s safe to run more than once.
