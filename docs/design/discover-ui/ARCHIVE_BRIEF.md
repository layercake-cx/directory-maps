# Consistent list screens and Archive / Restore: brief for Claude Code

**Two PRs, in order.** PR 1 is presentation only (list layout). PR 2 adds archiving for directories, maps and customers, which needs a migration and small server-side checks. Follow `AGENTS.md` throughout: opening checks, branch per PR, migrations rules (template + rollback, staging first, production only after sign-off), Edge Function deploy rules, admin events, `docs/USER_GUIDE.md`, `docs/DEPLOYMENTS.md`.

Visual references:
- `reference/34-list-my-maps.html`: My maps in the Directories layout.
- `reference/35-list-customers.html`: platform Customers in the same layout.
- `reference/36-pattern-archive.html`: archive dialog with the ARCHIVE gate, row menus, archived view, archived banner, the visitor's offline page, and the sign-in message for an archived customer.
- Current screens: `assets/current-directories.png` (the target layout) and `assets/current-customers.png`.

## Decisions (Damian, 2026-11-17)

1. **Archiving never deletes records.** It's reversible with Restore. Every row, publication, file, setting and history entry is kept.
2. **Archiving takes things offline.** An archived directory's site (including custom domains), and an archived map's page and embeds, show a "no longer available" page to visitors. Restore brings them back exactly as they were: live if they were published.
3. **Archiving a customer locks out its users and takes all its maps and directories offline.** Everything is kept and comes back on restore. Staff can still open an archived customer.
4. **Archiving needs a typed confirmation**: the user types `ARCHIVE` (exact, case-sensitive, surrounding spaces trimmed) before the confirm button enables. Restore needs no typing.
5. **One list layout everywhere**: the Directories screen is the model for Maps and Customers, in both the staff admin and the client portal.

---

# PR 1: one list layout (presentation only)

Branch `feat/<date>-list-layout`. No schema, server or behaviour changes.

## 1.1 The list pattern

Build `ListPage` in `src/components/ui/` (or compose existing kit parts: `PageLayout` + `SegmentedControl` + `Toolbar` + `DataTable` + `OverflowMenu` + `BulkBar`) so every list screen has the same anatomy, top to bottom:

1. **PageHead**: title, one-line subtitle, at most two actions (primary on the right, e.g. New map).
2. **Status views**: a `SegmentedControl` with counts, e.g. `All maps (4)` · `Published (2)` · `Not yet published (2)` · `Archived (1)`. **"All" means everything not archived;** Archived is always its own view, always last, and shown even at zero. The selected view is kept in the URL (`?view=archived`) so it survives reload and the back button.
3. **Toolbar** (only when the list can exceed ~10 rows): search field with a visible label; extra filters as labelled Selects.
4. **DataTable**: the name cell is the link, with one muted context line under it; a status Pill; numbers right-aligned with tabular figures; dates as `dd/mm/yyyy`; a ⋯ row menu last. Selectable rows when bulk actions exist.
5. **Secondary Sections** below the table (e.g. the Plan box), never above it.
6. **Empty states**: no items at all → `EmptyState` with the primary action; a view with no matches → "No {things} in this view".

## 1.2 Apply it to every list

| Screen | Route(s) | File(s) | Columns |
|---|---|---|---|
| Directories (model) | `/client/directories`, `/admin/clients/:id/directories` | `DirectoriesDashboard.jsx` | Directory (+ "Linked to {map}") · Status · Entries · ⋯ |
| My maps / customer Maps | `/client/maps`, `/admin/clients/:id` (Maps tab) | `MapsView.jsx`, `ClientDashboard.jsx`, `AdminClientDetail.jsx` maps tab | Map (+ data-source line: "Pins from {directory}" / "Google Sheets · {sheet}" / "No data source yet") · Status (Published / Unpublished changes / Draft) · Data source · Listings · Updated · ⋯ |
| Platform: Customers | `/admin/clients` | `AdminClients.jsx`, `CustomersFeaturePanel.jsx` | Customer (+ slug in mono) · Plan · Status · Maps · Directories · Primary contact · Updated · ⋯ |
| Platform: All maps | `/admin/maps` | `AdminMaps.jsx` | Map columns + Customer |
| Platform: All directories | `/admin/directories` | `AdminDirectories.jsx` | Directory columns + Customer |

Specifics:
- **Maps**: remove the card grid (`.mp-map-grid`) and the "Create a new map" tile. New map becomes the PageHead primary action. Views: All maps · Published · Not yet published · Archived. Archived shows 0 until PR 2. Keep sync-error Callouts above the views.
- **Customers**: views become All customers · Archived. Move the plan views (Basic, Founding Partner) and "With beta access" out of the side panel into Toolbar Selects ("Plan", "Beta access"). The side panel keeps "Recently viewed". The "Created" column moves into the customer record; "Updated" stays. Keep Refresh and New customer as the two actions. Keep the search field.
- **⋯ row menus**, active rows: Open · View live site/map ↗ (when published) · divider · Archive… (red; hidden until PR 2). Archived rows: Restore · Open (read-only). In PR 1, show only the items that already work.
- **Client vs staff**: the same component renders in both contexts. Staff screens add the Customer column on platform-wide lists; nothing else differs.
- Keep every existing data call, route, event and permission check.

Acceptance (PR 1): all five screens match `reference/34-…` / `35-…` anatomy at 1440 and 390px (the table scrolls inside `.table-wrap`); views persist in the URL; `scripts/check-ui.sh` and `npm run build` pass; before/after screenshots in the PR.

---

# PR 2: Archive and Restore

Branch `feat/<date>-archive`. Contains a migration and server-side checks: follow AGENTS.md's migration and Edge Function sections exactly, and **stop for sign-off before any production database or function deploy**.

## 2.1 Data model

Directories already use `is_active` with `archiveDirectory` / `restoreDirectory` in `src/lib/directories.js`. Give maps and clients the same, and add an audit trail to all three:

| Table | Add |
|---|---|
| `maps` | `is_active boolean not null default true`, `archived_at timestamptz null`, `archived_by uuid null` |
| `clients` | `is_active boolean not null default true`, `archived_at timestamptz null`, `archived_by uuid null` |
| `directories` | `archived_at timestamptz null`, `archived_by uuid null` (is_active exists) |

- `archived_by` references the acting user's id (the same id type `profiles` uses; check before writing the FK).
- Backfill: none needed (defaults are active). For directories already `is_active = false`, leave `archived_at` null; the UI shows "Archived" without a date.
- **Effective liveness** = the item is active **and** its client is active. Don't cascade a customer's archive by flipping each map/directory: that would lose which items were archived separately. Implement a SQL helper `public.is_entity_live(entity_type text, entity_id text) returns boolean` (or equivalent) and use it everywhere below.
- RLS: anon/public read paths for maps, listings, directory data and published snapshots must exclude non-live items. Authenticated client users of an archived client get no rows (see 2.4). Staff (`profiles.role = 'admin'`) can always read.
- Write the rollback file. Apply to staging first.

## 2.2 Library functions

In `src/lib/`: `archiveMap(id)`, `restoreMap(id)`, `archiveClient(id)`, `restoreClient(id)` (staff only), and update `archiveDirectory` / `restoreDirectory` to set and clear `archived_at` / `archived_by`. Bulk variants for directories (one exists) and maps. List functions get `{ includeArchived }` like `listDirectories`, plus `countByStatus` helpers for the view counts.

## 2.3 Taking things offline (server side)

Visitors of anything not live get a neutral page: "This {directory|map} is no longer available. It may have moved or been taken down by the organisation that ran it." It has **HTTP 410**, `noindex`, no client branding and no Discover marketing.

Find and gate every public entry point (grep for the resolvers and public fetches; at least these):
- `middleware.js`: `resolveCustomDomain` / `resolve_custom_domain` RPC, and the path-based `/directories/{client}/{directory}` blob serving. Return the 410 page when the resolved entity isn't live. Keep the edge lookup to one RPC call (extend the resolver's return with `is_live` rather than adding a second round trip). Don't cache 410s for more than 60s, so restores show quickly.
- `src/pages/SlugMap.jsx`, `EmbedMap.jsx`, `CustomDomainMap.jsx`, `PublishedMapView.jsx` (and the RPC or queries they use): show the unavailable state for non-live maps. Embeds show a compact version that fits the iframe.
- Directory site `sitemap.xml`, `robots.txt`, `llms.txt`: return 410 too.
- Background work must skip non-live items: scheduled `sync_sheet_listings`, AI workers (`process_entry_content_jobs`, `process_entry_seo_metadata_jobs`, generate_* functions), claim and enquiry emails (`send_claim_link`, `send_contact_message`, `submit_claim_request`). Return a clear "not live" result instead of erroring. Jobs already queued for an archived item are left in place and resume on restore.

Restore needs nothing special: liveness is computed, so published items are live again as soon as the flag flips. Don't regenerate the published files on archive or restore.

## 2.4 Locking out an archived customer's users

- After sign-in, `ClientGate` (and anything that resolves the user's client) checks the client's `is_active`. If it's archived: sign the user out and send them to `/login?archived=1`, where the login page shows a danger Callout: "**This account is archived.** Contact Layercake to restore it: hello@layercake-cx.biz". Check whether a support address constant already exists and use it.
- Staff aren't affected: staff can open an archived customer from Customers › Archived, and see it read-only with the archived banner.
- Invitations to an archived customer can't be accepted (`complete_invited_signup` returns a clear error).

## 2.5 UI

**ArchiveDialog** (new, `ui/overlays.jsx`), built on `Dialog`. Props: `entityType` (`directory | map | customer`), `name` or `count`, `consequences` (array of nodes), `onConfirm` (async), `busy`.
- Title "Archive {name}?" or "Archive {n} {things}?".
- A bullet list of real consequences, computed from data before the dialog opens:
  - **Directory:** "{domain} goes offline. Visitors see a 'no longer available' page." · "{n} linked map(s) ({names}) stop updating from this directory." (use `getMapsLinkedToDirectory`) · "Claims, enquiries and AI jobs for this directory stop." · "Entries, pages, settings and publish history are all kept."
  - **Map:** "The map and every embed go offline. Embeds show 'This map is no longer available'." · "Scheduled Google Sheets syncs pause." (only if a schedule exists) · "Listings, groups, filters and settings are kept."
  - **Customer:** "{m} maps and {d} directories go offline (custom domains included)." · "{u} users can't sign in. They'll see 'This account is archived. Contact Layercake to restore it.'" · "Scheduled syncs, AI jobs and outgoing emails stop." · "Billing and plan are not changed here."
  - Only list live items as "go offline"; drafts are simply hidden.
- Green note: "**Nothing is deleted.** Restore it from Archived at any time and it comes back as it was."
- Field labelled "Type ARCHIVE to confirm": `autocomplete="off"`, `spellcheck="false"`, monospace, focused on open. The confirm button (danger-solid, label "Archive directory" / "Archive map" / "Archive customer" / "Archive {n} directories") is disabled until the trimmed value is exactly `ARCHIVE`. Wrong text that has been edited shows the hint "Type ARCHIVE in capitals"; empty shows nothing. Enter submits only when it matches. While archiving: Button loading "Archiving…", Cancel disabled.
- After success: close; the row leaves the current view; the counts update; Toast "{name} archived. It's offline now." with **Undo**, which calls restore directly.
- Failure: keep the dialog open with a danger Callout; nothing changed.

**Restore**: from the Archived view's row menu, or the banner. Single click, no typing; Toast "{name} restored." plus, if it was published, "It's live again." Restoring a customer: a plain `ConfirmDialog` ("Restore {customer}? Users can sign in again and their live maps and directories come back.").

**Archived banner** (`ArchivedBanner`, warn tone) under PageHead on every page of an archived directory, map or customer: "**This {thing} is archived.** It's offline and read-only. Archived {date} by {name}." plus a "Restore {thing}" button (managers and staff). Wrap the page's forms in a `ReadOnly` context that disables inputs and hides publish, sync, import, AI and invite actions. Navigation, viewing and exporting still work.

**Where Archive appears:**
- The ⋯ row menu on every list in PR 1 (last item, red, after a divider).
- The BulkBar on Directories and Maps (customers: single only).
- The existing "Archive directory" control in directory settings (`DirectoryContext.archiveDirectory`) now opens ArchiveDialog.
- The customer record's details tab (staff only), in a danger Section at the bottom.

**Permanent delete** (directories have `deleteDirectoryPermanently`): don't add delete anywhere new and don't put it in the Archive menu group. If it's currently next to Archive, move it to the Archived view's row menu, staff only, and gate it with the same dialog using the word `DELETE` and copy that says it can't be undone. If that's more than a move, leave it and add a BACKLOG entry.

**Permissions**: directories and maps can be archived and restored by managers of the organisation and by staff. Customers by staff only. View-only users see archived items read-only, with no archive or restore controls.

## 2.6 Events

Per AGENTS.md "Admin event instrumentation": `directory_archived`, `directory_restored`, `map_archived`, `map_restored`, `client_archived`, `client_restored`, plus `_bulk_` variants with counts. Meta must include the required keys plus `was_live` (boolean) and `trigger` (`row_menu | bulk | banner | settings | undo`). Reuse existing names if `DirectoryContext` already records one; check the catalogue and add the new ones. If the event-type list is a database constraint, include it in this PR's migration.

## 2.7 Docs

- `docs/USER_GUIDE.md`: an "Archiving and restoring" section covering what goes offline, what's kept, the typed confirmation, Restore and Undo, and what an archived customer's users see.
- `docs/DATA_AND_PRIVACY.md`: archived data is retained. Note that this isn't deletion and that deletion requests are handled separately.
- `docs/DEPLOYMENTS.md`: the migration, middleware and any Edge Function deploys, staging then production.
- `BACKLOG.md`: retention policy for long-archived items; permanent delete for maps and customers (not built); customer-facing "archived" email notice.

## 2.8 Acceptance

Test on staging with a client manager, a view-only client user and a staff user:

| Action | Expect |
|---|---|
| Archive a published directory (row menu) | Dialog lists the domain and linked maps; button disabled until `ARCHIVE`; on confirm, the row moves to Archived, Toast with Undo. Visiting the site, its custom domain and its sitemap gives the 410 page. Linked map still loads with its last data. |
| Undo from the toast | Site live again within 60s; row back in All. |
| Archive a published map | Map page and embed (`/embed`, custom domain `/map`) show unavailable; sheet sync is skipped (sync log entry says skipped: archived). |
| Restore the map | Live again; next scheduled sync runs. |
| Bulk archive 3 directories | One dialog with the count; one `ARCHIVE`; all three offline. |
| Archive a customer (staff) | Its users are signed out on next request and see the archived message; all its live maps/directories show 410; staff can still open it read-only with the banner. |
| Restore the customer | Users can sign in; items that were archived separately before stay archived; the rest are live. |
| View-only user | Sees archived items read-only; no Archive or Restore anywhere. |
| Database | No rows deleted at any step (compare row counts for the customer's maps, listings, directories, entries before and after). |
| Keyboard and screen reader | Dialog focus starts in the text field; the disabled button's reason is announced; Esc cancels; focus returns to the row menu button. |

`scripts/check-ui.sh` and `npm run build` pass; PR includes screenshots of the dialog (empty, wrong, matching), the Archived view, the banner, the 410 page and the archived sign-in message.
