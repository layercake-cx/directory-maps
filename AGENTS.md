# Agent instructions — Directory Maps

Instructions for AI agents (Cursor, Claude Code, etc.) working in this repository.

## Git workflow (follow this every session, no exceptions)

### 1 — Open: check for existing work, then start on a branch

At the very beginning of every session — including sessions that begin with a "continued from previous conversation" summary — run these three checks and **report the results to the user before doing anything else**:

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
- Check whether a dev server is already listening on port 5173 (`lsof -i :5173`) before starting one — multiple agent sessions share this machine, and a second `npm run dev` will fail on the port, not spin up a second instance. If one is already running, assume it belongs to another session: don't kill it, and note in your summary that you skipped starting your own rather than treating the conflict as an error.
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

### If you resumed a session from a summary and skipped the opening checks

Stop immediately. Run the three opening checks now, report the results, and ask the user which branch to work on before continuing. If code has already been written on `main`, follow the recovery steps below.

### If you are mid-session and realise you are on `main`

Stop immediately. Stash or commit your changes, then move them to a branch:

```bash
git stash
git checkout -b feat/YYYY-MM-DD-description
git stash pop
```

---

## Documentation

### Third-party integrations and privacy

Whenever you **add, change, or remove a third-party integration** (any external API, service, or SDK — including new environment variables or changed data flows), update **`docs/DATA_AND_PRIVACY.md`** in the same task. This document is the canonical record used to keep the privacy policy and client DPAs accurate.

Specifically update it when:
- A new external service is connected (new API, SDK, or webhook)
- An existing integration changes what personal data it receives or where it processes it
- An integration is removed
- A provider's DPA terms or processing region change
- A new environment variable points to an external service

When you **build, change, or remove** a user-facing feature:

1. Update **`docs/USER_GUIDE.md`** in the same change (steps, routes, quick reference).
2. Update **`docs/FEATURES.md`** when the feature inventory or maturity changes.
3. Link specialist docs (`docs/GOOGLE_SHEETS_SYNC.md`, etc.) from USER_GUIDE when appropriate.
4. Add or update an entry in **`docs/DEPLOYMENTS.md`** (see below).

See `.cursor/rules/user-guide-documentation.mdc` for full rules (Cursor applies this automatically).

**Doc index:** `docs/README.md` · **Integrations & secrets:** `docs/INTEGRATION_ARCHITECTURE.md` · **Repo overview:** `README.md`

## Monday.com feature/deployment tracking

The monday.com MCP connection (Layercake's `layercake-cx.monday.com` account) is available in Claude Code sessions. Use it to keep the **"Tasks" board** (board id `5094351513`) in the **"Maps" workspace** (workspace id `6134662`) as the running record of Directory Maps feature work — this is the board Justyna already uses for this project, so reuse it rather than creating a new board.

Board reference (so you don't need to re-query it every session):
- Groups: `Product Backlog` (`group_mm5j96jb`) for incoming/unstarted requests, `Non-Functional Req` (`new_group29179`) for other work, `Client Tasks` (`new_group43041`).
- `project_status` (status column): `Not Started`, `Working on it`, `Testing`, `Stuck`, `Done`.
- `project_owner` (people), `people` (collaborators), `status_1` (priority: `Critical ⚠`/`High`/`Medium`/`Low`).

**1 — Feature ticket:** whenever the user requests a new feature, or a change to an existing feature, search the board for a matching open item first (`get_board_items_page` / `search`). If none exists, create one (`create_item`) in `Product Backlog` with `project_status: "Not Started"`. Move it to `"Working on it"` once you start implementing. Keep the title short and human; put the actual ask/scope in the item description or a first update.

**2 — Deployment log → Monday comment:** every time you write a `docs/DEPLOYMENTS.md` entry (see below), also post that entry's content as an update (`create_update`) on the matching Monday item — same "what changed" text, environment, and rollback plan. Then:
- Set `project_status` to `"Testing"` once staging is verified.
- Set `project_status` to `"Done"` once deployed to production and verified.

If a deployment doesn't map to any specific feature ticket (e.g. a small fix bundled into other work), create a lightweight ticket for it too rather than skipping the log.

**Never** put secrets, API keys, tokens, connection strings, or end-user/client personal data in a Monday ticket title, description, or comment — same rule as admin event `meta` fields below. Monday tickets are internal engineering notes (what/why/rollback), not data exports.

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

Vite + React (BrowserRouter) · Supabase · Google Maps · Resend · Stripe (partial)

## Frontend deployment

**There are two live production frontends, not one** — this was undocumented until Epic 3 (2026-08-23) discovered it by testing the real branded domain directly:

1. **GitHub Pages** (`layercake-cx.github.io/directory-maps/`) — deployed automatically by GitHub Actions on every push to `main`. No manual step needed.
   - Workflow file: `.github/workflows/` — job name "Deploy to GitHub Pages"
   - Build command: `npm run build` (output: `dist/`)
   - VITE env vars are injected from GitHub repository secrets at build time (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_SNAPSHOT_BASE_URL`)
   - Check deploy status: `gh run list --limit 5`
   - A successful merge to `main` = deployed. Typical deploy time ~35 seconds.

2. **Vercel** (`maps.layercake-cx.biz`, the real branded domain real users hit) — a linked Vercel project (`directory-maps`), same static Vite build, **does not redeploy automatically on push to `main`**. Requires an explicit deploy:
   - `npm run deploy:test` (`scripts/deploy-to-test.sh`, `npx vercel --yes`) — preview deploy, safe default.
   - `npm run deploy:live` (`scripts/deploy-live.sh`, `npx vercel --prod --yes`) — **production** deploy, only after explicit user sign-off, same discipline as a database migration.
   - Also has an SPA rewrite in `vercel.json` and, since Epic 3, a `middleware.js` at the repo root (Vercel Edge Middleware — the only server-side logic either frontend host runs).
   - Requires an authenticated Vercel CLI session (`npx vercel login`) — an agent cannot do this step itself; ask the user to run it once per environment.

**When deploying a frontend change that matters on the live customer-facing site, both need updating** — a GitHub Pages-only deploy leaves the real branded domain on stale code.

## Supabase CLI — use the installed binary, never `npx supabase`

**Always run `supabase ...` directly** (it's already installed via Homebrew at `/opt/homebrew/bin/supabase`, already logged in, and typically already linked to staging from the main repo checkout). Confirm with `command -v supabase` if unsure.

**Never run `npx supabase ...`.** `npx` ignores the installed binary and downloads a separate, freshly-fetched copy with no stored login session. That fresh copy will try to start an interactive login flow the moment you run any command that needs auth (e.g. `projects list`, `db push`) — which can hang for its full timeout and, on macOS, trigger a Keychain permission prompt for the *user* to handle, not something an agent should be initiating. If a `supabase` command using `npx` hangs or looks like it's waiting on input, stop it immediately (don't wait it out) — it's not a slow network call, it's an auth flow that needs a human.

**Before running `db push` (or any command that reads `supabase/migrations/`) in a shared working directory:** check `git status` for uncommitted/untracked migration files first. If another session's WIP migration is sitting there uncommitted, `db push` will happily try to apply it too — it has no concept of "whose" file it is. Prefer running from an isolated `git worktree` containing only your own branch's files when the shared directory might have someone else's in-progress migration in it.

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
- Output the migration file and rollback file.
- Include the dry-run block and integrity checklist as comments in the file.
- Flag any forbidden operations explicitly and require user confirmation.
- **Staging**, when the user has asked for it: confirm the CLI is linked to the staging project ref (never an ambiguous or unconfirmed link), run the dry run for real, and if it passes cleanly, apply to staging and run the integrity checklist. See `docs/DATABASE_MIGRATIONS.md` for the full procedure.
- **Production always requires a separate, explicit human go-ahead** — never apply to production as a default next step after staging succeeds, even if asked to run staging.

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
  - **Leads (pre-account enquiries)**: `leads_*`
  - **Entitlements (commercial/tier gating)**: `entitlements_*`
  - **Domains (custom domain / subdomain publishing)**: `domain_*`

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
- **`data_directory_linked` / `data_directory_unlinked`** (DIR-E4-S2 — map reads pins live from a directory)
  - `meta`: `client_id`, `map_id`, `directory_id`, `source` (`admin_map` / `client_portal`)

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
- **`ops_entitlement_kill_switch_toggled`**
  - `meta`: `feature_key`, `enabled`, `actor_admin_scope: "platform_superadmin"`, `source`
  - Platform-wide (no `client_id`) — the kill switch is a global emergency force-off for one feature, not scoped to a client.

#### Entitlements

- **`entitlements_plan_changed`**
  - `meta`: `client_id`, `from_plan_key`, `to_plan_key`
- **`entitlements_override_set`**
  - `meta`: `client_id`, `feature_key`, `entitlement_type`, plus whichever value field(s) changed (`bool_value` / `limit_value` / `included_allowance` / `expires_at`), `reason` (optional)
- **`entitlements_override_cleared`**
  - `meta`: `client_id`, `feature_key`
- **`entitlements_limit_blocked`**
  - `meta`: `client_id`, `feature_key`, `source` (UI surface where the blocked attempt happened, e.g. `admin_client_detail`)
  - Fired when a UI action is pre-emptively blocked by a plan/volume limit (e.g. admin "New map" at `max_maps`) before the user reaches the gated screen.

#### Leads (pre-account enquiries)

- **`leads_status_changed`**
  - `meta`: `lead_id` (`beta_signups.id`), `from_status`, `to_status`, `source` (`admin_leads`)
  - No `client_id` — leads are pre-account and not yet tied to an organisation.

#### Domains (custom domain / subdomain publishing — Bring Your Own Domain epic)

A domain publishes exactly one entity — a map or a directory (`client_domains.map_id` XOR `directory_id`). Events carry both `map_id`/`directory_id` fields; whichever doesn't apply is `null`.

- **`domain_added`**
  - `meta`: `client_id`, `map_id`, `directory_id`, `hostname`, `source` (`client_portal` / `admin_dashboard`)
- **`domain_verified`**
  - `meta`: `client_id`, `map_id`, `directory_id`, `hostname`, `source`
- **`domain_verify_failed`**
  - `meta`: `client_id`, `map_id`, `directory_id`, `hostname`, `source`
  - Fired when a verify attempt completes but DNS isn't fully correct yet — not a hard error, just "not active yet."
- **`domain_removed`**
  - `meta`: `client_id`, `map_id`, `directory_id`, `hostname`, `source`

### 4) Rule for future features

When introducing a new admin capability:

- Add or reuse an `event_type` under the correct category above.
- Define the minimal `meta` keys needed to debug and to build reporting later.
- Prefer **two events** for multi-step operations: `*_requested` and `*_completed` (plus `*_failed`).
- Keep event names stable; extend via `meta` rather than creating near-duplicates.
