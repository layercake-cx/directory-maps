# Google Sheets sync (Drive connect + nightly import)

This project supports connecting a Google Sheet to a map and syncing listings nightly.

## 1) Create DB table

Run `scripts/create-map-data-sources.sql` in Supabase Dashboard → SQL Editor.

## 2) Create Google OAuth credentials

In Google Cloud Console:

- Enable APIs:
  - Google Drive API
  - Google Sheets API
  - OAuth consent screen
- Create an **OAuth client** (Web application).
- Add an **authorized redirect URI**:
  - `https://<YOUR_SUPABASE_PROJECT_REF>.functions.supabase.co/google_oauth_callback`

## 3) Set Supabase Edge Function secrets

Set secrets (Supabase Dashboard → Edge Functions → Secrets):

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_GEOCODING_API_KEY` (already used elsewhere in this repo)

Supabase-provided env vars used automatically:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 4) Deploy Edge Functions

From the project root (with Supabase CLI installed and linked to your project), deploy:

```bash
supabase functions deploy google_oauth_start
supabase functions deploy google_oauth_callback
supabase functions deploy google_get_access_token
supabase functions deploy google_set_sheet_file
supabase functions deploy validate_sheet_source
supabase functions deploy sync_sheet_listings
```

Or deploy all at once:

```bash
supabase functions deploy
```

If you see "Failed to send a request to the Edge Function" in the app, the most common cause is that these functions are not yet deployed to the same Supabase project your app uses (`VITE_SUPABASE_URL`).

## 5) Nightly schedule (2:00am)

Use `pg_cron` + `pg_net` to invoke the sync function nightly. In Supabase SQL Editor:

```sql
-- Enable extensions if needed
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- Store project URL + anon key in Vault
select vault.create_secret('https://<YOUR_PROJECT_REF>.supabase.co', 'project_url');
select vault.create_secret('<YOUR_SUPABASE_ANON_KEY>', 'anon_key');

-- Schedule nightly at 2am
select cron.schedule(
  'sync-sheet-listings-nightly',
  '0 2 * * *',
  $$
  select net.http_post(
    url:= (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/sync_sheet_listings',
    headers:=jsonb_build_object(
      'Content-type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body:='{}'::jsonb
  );
  $$
);
```

## 6) Sheet format

The Sheet must have a header row containing at least:

- `id` (stable unique id, used for upsert)
- `name`

Other supported columns match the CSV importer template:

- `address`, `postcode`, `country`, `lat`, `lng`
- `website_url`, `email`, `phone`, `logo_url`
- `notes_html`, `allow_html`, `group_name`, `is_active`

If `lat`/`lng` are missing, the sync will geocode using `GOOGLE_GEOCODING_API_KEY` when possible.

