# Agent instructions — Directory Maps

Instructions for AI agents (Cursor, Claude Code, etc.) working in this repository.

## Git workflow (follow this every session, no exceptions)

### 1 — Open: check for existing work, then start on a branch

At the very beginning of every session, run these three checks and **report the results to the user before doing anything else**:

```bash
# Where are we?
git status

# Any local branches that aren't main?
git branch --sort=-committerdate | grep -v '^\* main$' | head -10

# Any open PRs?
gh pr list --state open
```

**If open branches or PRs exist, tell the user:**
- List each open branch and its most recent commit message.
- List each open PR with its title and URL.
- Ask whether to continue on one of those branches or start a new one.
- Do not create a new branch or write any code until the user has answered.

This prevents stale branches accumulating and ensures work-in-progress isn't silently abandoned.

**Once the user has confirmed the branch to work on** — or if there is nothing open — proceed. If starting fresh on `main`, create a feature branch before writing a single line of code:

```bash
git checkout -b feat/YYYY-MM-DD-short-description
# e.g. feat/2026-06-01-logo-bg-toggle
```

Use the prefix that matches the work:
- `feat/` — new user-facing feature
- `fix/` — bug fix
- `chore/` — tooling, deps, config, docs-only

If the session covers several unrelated things, pick the dominant one for the branch name.

### 2 — Develop: commit little and often

- Commit after each logical unit of work (one feature, one fix, one migration file).
- Write commit messages that explain *why*, not just *what*.
- Never let a session end with uncommitted changes sitting in the working tree.
- Follow the commit style in the existing log (`git log --oneline -10`).

### 3 — Test: before opening the PR

Before declaring work done, verify the affected feature works in the running app:
- Start the dev server (`npm run dev`) and smoke-test the changed pages/flows.
- Check the browser console — no new errors or warnings.
- If a database migration was applied, run the post-migration verification block and confirm row counts are unchanged.

### 4 — Close: open a PR, do not merge unilaterally

When the work is done and tested:

```bash
git push -u origin HEAD
gh pr create --title "…" --body "…"
```

- **Never push directly to `main`** — always go through a PR.
- The PR body should say what changed, why, and how to verify it.
- Add a `docs/DEPLOYMENTS.md` entry (see below) in the same branch before opening the PR.
- Leave the PR open for the user to review and merge. Do not merge it yourself unless the user explicitly asks.

### If you are mid-session and realise you are on `main`

Stop immediately. Stash or commit your changes, then move them to a branch:

```bash
git stash
git checkout -b feat/YYYY-MM-DD-description
git stash pop
```

---

## Documentation

When you **build, change, or remove** a user-facing feature:

1. Update **`docs/USER_GUIDE.md`** in the same change (steps, routes, quick reference).
2. Update **`docs/FEATURES.md`** when the feature inventory or maturity changes.
3. Link specialist docs (`docs/GOOGLE_SHEETS_SYNC.md`, etc.) from USER_GUIDE when appropriate.
4. Add or update an entry in **`docs/DEPLOYMENTS.md`** (see below).

See `.cursor/rules/user-guide-documentation.mdc` for full rules (Cursor applies this automatically).

**Doc index:** `docs/README.md` · **Integrations & secrets:** `docs/INTEGRATION_ARCHITECTURE.md` · **Repo overview:** `README.md`

## Deployment log (write an entry for every meaningful change)

Every time you implement a meaningful change — feature, fix, migration, configuration — add an entry to **`docs/DEPLOYMENTS.md`** before the work is considered done. This is the plain-English record of what this codebase has become and why.

**When to write an entry:**
- Any new feature or behaviour change visible to users.
- Any bug fix that was causing real problems.
- Any database migration (forward or rollback).
- Any change to environment config, Edge Functions, or deployment settings.
- You do not need a separate entry for pure documentation edits or tiny typo fixes.

**What to write:**
- Plain English. Write for a smart person who wasn't in the room, not for a compiler.
- "What changed" explains *what it does now* and *why it was needed*, not just what files you edited.
- "Rollback plan" must be concrete: which migration file to run, which commit to revert to.
- Mark the verification checklist honestly — leave boxes unchecked if staging hasn't been tested yet; don't tick them speculatively.

**Format:** newest entry at the top, use the template in `docs/DEPLOYMENTS.md`. Each entry is headed `## YYYY-MM-DD — [Staging | Production]`.

## Stack

Vite + React (HashRouter) · Supabase · Google Maps · Resend · Stripe (partial)

## Edge Function deployments

**Never deploy an Edge Function to production without explicit user confirmation.**

Treat Edge Function deployments exactly like database migrations — staging first, production only after the user has verified staging and explicitly asked you to deploy to production.

**Rules:**
- Deploy to the **test project** (`beqejxneehilplrtpntn`) first.
- Tell the user what was deployed and ask them to verify it works.
- Only deploy to the **production project** (`gxixwdjfmegxcxfeflro`) when the user explicitly says to.
- When deploying, always specify `--project-ref` to be explicit about the target. Never rely on whichever project happens to be linked.

```bash
# Staging only (default — always safe to do)
supabase functions deploy <function_name> --project-ref beqejxneehilplrtpntn

# Production — only after explicit user sign-off
supabase functions deploy <function_name> --project-ref gxixwdjfmegxcxfeflro
```

---

## Database migrations (required reading before touching the schema)

Full procedure: **`docs/DATABASE_MIGRATIONS.md`**

**Absolute rules — no exceptions:**

1. **Never run a migration on production without first running it on staging** (Supabase test project / Vercel Preview).
2. **Every migration needs a rollback file** (`YYYYMMDDHHMMSS_name.rollback.sql`) written at the same time.
3. **Dry-run before every apply**: wrap the migration body in `BEGIN; … ROLLBACK;` in the SQL editor and confirm no errors before committing any changes.
4. **Run the integrity checklist** (row counts, RLS status, orphan checks) before and after every migration. If any count changes unexpectedly, stop immediately.
5. **Forbidden without explicit sign-off**: `DROP TABLE`, `TRUNCATE`, `DROP COLUMN` (forward migrations), bulk `DELETE`, `RENAME TO`. Always back up data before any destructive step.

**When writing a migration as an agent:**
- Output the migration file and rollback file. Do not apply them automatically.
- Include the dry-run block and integrity checklist as comments in the file.
- State clearly that staging must be verified before production is touched.
- Flag any forbidden operations explicitly and require user confirmation.

Migration files live in `supabase/migrations/` and are named `YYYYMMDDHHMMSS_short_description.sql`.

## Conventions

- Minimize scope; match existing patterns in `src/`.
- Do not commit unless the user asks.
- Auth is **email + password** for signup/login; team invites use invitation links to signup/login, not magic-link OTP.

## Client vs admin parity

Most user-facing pages exist in both a client portal version (`src/pages/client/`) and an admin version (`src/pages/admin/`). When asked to make a change to a map design view (or any other shared UI surface), **assume the request applies to both client and admin versions** and confirm this with the user before implementing. If the change is clearly admin-only or client-only from context, note that assumption explicitly.

## Admin event instrumentation (required for admin features)

Whenever you **create or change an admin-only workflow** (admin pages, admin RPCs, Edge Functions used by admin, back-office tools), you must ensure the workflow includes **structured admin events** that mirror the existing *user engagement* event style:

- **`event_type`**: stable `snake_case` string
- **`meta`**: structured JSON object (event-specific fields; no freeform blobs)

This is analogous to the public engagement framework documented in `docs/MAP_ENGAGEMENT.md` (`map_engagement_events.event_type` + `meta`). Admin events should follow the same principles: **consistent names**, **minimal but useful metadata**, and **future-proof** fields.

### 1) Naming and structure

- **Event naming**: `<category>_<action>` (all `snake_case`)
- **Categories** (high-level domains):
  - **Map design**: `map_design_*`
  - **Publication**: `map_publish_*`
  - **Data (import/sync/geocode)**: `data_*`
  - **Team and users**: `team_*`
  - **Email**: `email_*`
  - **Billing**: `billing_*`
  - **Deploy / operations**: `ops_*`

### 2) Required metadata (for all admin events)

Every admin event must include these `meta` keys when applicable:

- **`actor_user_id`**: authenticated user id performing the action (typically `auth.uid()`)
- **`actor_contact_id`**: the actor’s `contacts.id` when the action is performed in the context of an organisation (helps separate *who* did it from `auth.users` identity)
- **`actor_role`**: `admin` (or `owner`/`manager` when a “client admin” action happens in client portal but should still be treated as an admin-style event)
- **`actor_admin_scope`**: `platform_superadmin` | `platform_admin` | `client_owner` | `client_manager` | `client_member` (use `platform_*` when the actor is a Layercake Maps superadmin/admin and does not belong to the target org)
- **`client_id`**: target organisation id (this is the **organisation** / tenant)
- **`map_id`**: when the action is map-scoped
- **`source`**: UI surface / entry point, e.g. `admin_dashboard`, `admin_map`, `client_portal`, `edge_function`, `cron`
- **`request_id`**: stable id for correlating multi-step operations (if available)
- **`error`**: only on failure events (string message, no stack traces)

**Actor vs target:** for platform superadmins, `client_id` may be **null** as an actor attribute. In events, treat `client_id` as the **target organisation** (if any). If a platform admin performs an action on behalf of an org, include:

- `actor_admin_scope: "platform_superadmin"` (or `"platform_admin"`)
- `client_id`: the **target** org id (when the action is org-scoped)
- `actor_contact_id`: typically `null` (unless the platform admin is also explicitly a contact in that org)

**Privacy / security (non-negotiable):** never store secrets or sensitive payloads in `meta`:

- No OAuth tokens / refresh tokens
- No API keys
- No raw email bodies
- No full raw CSV contents
- Prefer hashes (e.g. `invitee_email_hash`) over raw emails where possible

### 3) Event catalogue (known functionality)

Use these event types and metadata fields as the baseline. When implementing, prefer these exact names over inventing new ones.

#### Map design

- **`map_design_created`**
  - `meta`: `client_id`, `map_id`, `name`, `slug`, `default_center` (`{lat,lng}`), `default_zoom`, `enable_clustering`, `show_list_panel`
- **`map_design_updated`**
  - `meta`: `client_id`, `map_id`, `changed_fields` (string[]), `draft_save` (boolean), optional `previous`/`next` (small objects only when safe)
- **`map_design_theme_updated`**
  - `meta`: `client_id`, `map_id`, `changed_fields` (string[]), `pin_style`, `pin_size`, `map_type_id`
- **`map_design_group_created` / `map_design_group_updated` / `map_design_group_reordered` / `map_design_group_deleted`**
  - `meta`: `client_id`, `map_id`, `group_id`, optional `group_name`, `sort_order` / `order` (array of ids)

#### Publication

- **`map_publish_requested`**
  - `meta`: `client_id`, `map_id`, `note_present` (boolean), `has_unpublished_changes` (boolean)
- **`map_published`**
  - `meta`: `client_id`, `map_id`, `publication_id`, `note_present` (boolean)
- **`map_publish_failed`**
  - `meta`: `client_id`, `map_id`, `error`
- **`map_publish_rolled_back`**
  - `meta`: `client_id`, `map_id`, `from_publication_id`, `to_publication_id`

#### Data (CSV import / Google Drive / sync / geocode)

- **`data_csv_uploaded`**
  - `meta`: `client_id`, `map_id`, `row_count`, `has_lat_lng` (boolean), `geocode_missing_enabled` (boolean)
- **`data_import_completed`**
  - `meta`: `client_id`, `map_id`, `rows_imported`, `rows_skipped`, `mode` (e.g. `upsert`)
- **`data_import_failed`**
  - `meta`: `client_id`, `map_id`, `error`
- **`data_google_drive_connected`**
  - `meta`: `client_id`, `map_id`, `provider` (`google_sheets`)
- **`data_google_drive_file_selected`**
  - `meta`: `client_id`, `map_id`, `spreadsheet_id`, `sheet_id` (nullable), `sheet_name` (nullable), `mime_type`, `file_name`
- **`data_google_drive_validation_failed`**
  - `meta`: `client_id`, `map_id`, `issues` (string[])
- **`data_sync_requested`**
  - `meta`: `client_id`, `map_id`, `provider`, `schedule` (`manual` / `nightly`), `source` (`client_portal` / `cron`)
- **`data_sync_completed`**
  - `meta`: `client_id`, `map_id`, `provider`, `rows_synced`, `warnings` (string[])
- **`data_sync_failed`**
  - `meta`: `client_id`, `map_id`, `provider`, `error`
- **`data_geocode_started` / `data_geocode_completed` / `data_geocode_failed`**
  - `meta`: `client_id`, `map_id`, `rows_queued` / `rows_geocoded`, `error` (on fail)

#### Team and users

- **`team_invite_created`**
  - `meta`: `client_id`, `invitation_id`, `invitee_email_hash` (never raw email), `role` (`manager` / `member`)
- **`team_invite_email_sent`**
  - `meta`: `client_id`, `invitation_id`, `email_provider` (`resend`)
- **`team_invite_cancelled`**
  - `meta`: `client_id`, `invitation_id`
- **`team_member_role_changed`**
  - `meta`: `client_id`, `contact_id`, `from_role`, `to_role`
- **`team_member_removed`**
  - `meta`: `client_id`, `contact_id`
- **`team_map_permission_changed`**
  - `meta`: `client_id`, `map_id`, `contact_id`, `action` (`grant` / `revoke`)

#### Email

- **`email_contact_message_sent`**
  - `meta`: `client_id`, `map_id`, `listing_id`, `email_provider` (`resend`)
- **`email_contact_message_failed`**
  - `meta`: `client_id`, `map_id`, `listing_id`, `error`
- **`email_domain_setup_started` / `email_domain_verified` / `email_domain_verify_failed`**
  - `meta`: `client_id`, `email_provider` (`resend`), `domain`, `error` (on fail)

#### Billing

- **`billing_checkout_session_created`**
  - `meta`: `client_id`, `stripe_mode` (`test`/`live`), `price_id`, `plan`
- **`billing_checkout_failed`**
  - `meta`: `client_id`, `error`

#### Deploy / operations

- **`ops_deploy_hook_triggered`**
  - `meta`: `environment` (`preview`/`production`), `source` (`admin_ui`)
- **`ops_deploy_hook_failed`**
  - `meta`: `environment`, `error`

### 4) Rule for future features

When introducing a new admin capability:

- Add or reuse an `event_type` under the correct category above.
- Define the minimal `meta` keys needed to debug and to build reporting later.
- Prefer **two events** for multi-step operations: `*_requested` and `*_completed` (plus `*_failed`).
- Keep event names stable; extend via `meta` rather than creating near-duplicates.
