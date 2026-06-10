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

## 5) Daily auto-sync (pg_cron)

Maps set to **Daily** in Data → Google Drive store `sync_schedule = 'daily:HH:00'` (UTC hour; the dropdown displays the equivalent local time). A `pg_cron` dispatch job runs at the top of every hour and invokes `sync_sheet_listings` with `{"schedule": "daily"}`; the Edge Function then syncs only the sources scheduled for the current UTC hour.

Note: because the stored hour is UTC, the displayed local run time shifts by an hour when daylight saving starts or ends.

**New environments:** apply migration `20260610120000_sync_sheet_listings_daily_cron.sql` (included in this repo) and ensure the current `sync_sheet_listings` Edge Function is deployed.

**Prerequisite Vault secrets** (run in Supabase Dashboard → SQL Editor if not already created):

```sql
select vault.create_secret('https://<YOUR_PROJECT_REF>.supabase.co', 'project_url');
select vault.create_secret('<YOUR_SUPABASE_ANON_KEY>', 'anon_key');
```

The migration also removes the legacy `sync-sheet-listings-nightly` job (if present), which synced **all** enabled sources regardless of schedule and did not honour per-map daily times.

## 6) Sheet format

The Sheet must have a header row containing at least:

- `id` (stable unique id, used for upsert)
- `name`

Other supported columns match the CSV importer template:

- `address`, `postcode`, `country`, `lat`, `lng`
- `website_url`, `email`, `phone`, `logo_url`
- `notes_html`, `allow_html`, `group_name`, `is_active`

If `lat`/`lng` are missing, the sync will geocode using `GOOGLE_GEOCODING_API_KEY` when possible.

## 7) Google Drive sync vs local CSV upload

| Path | Where | Use when |
|------|--------|----------|
| **Google Drive** (Data → Google Drive tab) | File must live in **Google Drive** (Google Sheet or `.csv` stored in Drive) | You want daily auto-sync or to keep editing in Sheets/Drive |
| **Spreadsheet / CSV** tab | Upload from your computer | One-off import; file is **not** read by Drive sync |

Drive sync does **not** read a CSV you only uploaded via the Spreadsheet / CSV tab.

## 8) Troubleshooting “Synced 0 rows”

After **Sync now**, the Data page should show a yellow or red message explaining what went wrong. Common causes:

1. **Wrong tab** — CSV uploaded locally but sync expects a file **chosen in Google Drive**.
2. **Missing headers** — First row must include columns **`id`** and **`name`** (case-insensitive; a UTF-8 BOM on the first column is OK).
3. **Empty names** — Every data row needs a non-empty **name**; blank name rows are skipped.
4. **No data rows** — Header row only, or file empty.
5. **Semicolon CSV** — Comma-separated files are supported; semicolon-delimited exports (common in some locales) may parse as a single column — re-export as comma-separated or use a Google Sheet.
6. **Not connected** — Connect Drive, pick a file, then sync. Validation runs when the page loads and lists issues before sync.

Check **Issues detected** on the Data page and `last_sync_error` under the sync controls.

