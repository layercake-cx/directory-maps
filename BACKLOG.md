# Backlog

Gaps identified while building the admin shell redesign (`docs/design/admin-shell/`) — things
the design shows that aren't built yet. One entry per missing capability, per
`docs/design/admin-shell/BUILD_BRIEF.md`'s process: check the codebase and `docs/FEATURES.md`
first; if a piece already exists, wire it up instead of adding a new entry for it.

### [ADMIN-SHELL] Organisation home: recent activity feed
- **Where in the design:** `00-organisation-home.html`
- **What's missing:** a real recent-activity feed. **Resolved in Phase 4 except this one piece:** stat tiles (maps/directories/published/team size/enquiries in 30 days) and a "Needs attention" list now ship for real in `ClientHome.jsx`. The activity feed specifically is NOT buildable without a migration: `admin_events`'s only SELECT policy checks `profiles.role = 'admin'` — there is no client-scoped policy, so a real client contact querying it (even filtered by their own `client_id`) gets zero rows today.
- **Existing pieces:** `admin_events` table (data exists, RLS doesn't allow client contacts to read it yet)
- **Shown meanwhile:** no activity feed on Organisation home
- **Size guess:** M (one migration: a client-scoped `admin_events` SELECT policy, mirroring `directory_contact_submissions_authenticated_select`)
- **Status:** To do

### [ADMIN-SHELL] Directories dashboard: "directories used of allowance"
- **Where in the design:** `01-directories.html` (plan box)
- **What's missing:** a volume entitlement for directories. **Resolved in Phase 4 except this one piece:** Published/Not yet published/Archived views, plan name, "features needing a higher plan", card preview image (see below), and linked-map-per-card now ship for real in the new shared `DirectoriesDashboard.jsx`. Unlike `max_maps` (a real seeded volume entitlement with `plan_features` rows), there is no equivalent `max_directories` feature/entitlement anywhere — showing "N of M directories used" isn't possible without adding one.
- **Existing pieces:** `src/lib/entitlements.js`; `20260820120000_seed_max_maps_entitlement.sql` as the pattern to mirror for a new `max_directories` migration
- **Shown meanwhile:** plan box shows plan name + locked features, no allowance/usage line
- **Size guess:** S (one migration: seed a `max_directories` feature + `plan_features` rows)
- **Status:** To do

### [ADMIN-SHELL] Directories dashboard: dedicated card thumbnail field
- **Where in the design:** `01-directories.html` (card preview image)
- **What's missing:** nothing is missing functionally — `DirectoriesDashboard.jsx` shows a real image today — but it repurposes `seo_og_image_url` (meant for social-share meta) as the card thumbnail rather than a field purpose-built for this. Flagging so a future "real" thumbnail field isn't designed on the false assumption that one already exists for this purpose.
- **Existing pieces:** `directories.seo_og_image_url`
- **Shown meanwhile:** works, just a repurposed field
- **Size guess:** S (a dedicated `card_image_url` column, if the repurposing ever becomes a problem)
- **Status:** To do

### [ADMIN-SHELL] Entries table: dedicated "sector" field
- **Where in the design:** `03-directory-entries.html` (labelled "Industry sector" / "All sectors")
- **What's missing:** a decision from Damian, not a build. **Resolved in Phase 4 except this framing:** the Gaps filter (no logo/content/SEO/not geocoded) and a categorisation filter both ship for real in `DirectoryEntriesPanel.jsx`. But categorisations are a fully generic, client-defined taxonomy — there's no dedicated "sector" concept, so the shipped filter is "filter by any one attached categorisation," not a hardcoded "Industry sector" dropdown. Decide: is a generic categorisation filter enough, or does "sector" need to become a first-class, always-present field?
- **Existing pieces:** `categorisations`/`category_terms`/`entry_category_terms` (generic taxonomy, already used by the shipped filter)
- **Shown meanwhile:** generic categorisation filter, labelled by whichever categorisations the client has actually created
- **Size guess:** decision, not build
- **Status:** To do

### [ADMIN-SHELL] Global search in the top bar
- **Where in the design:** TopBar search field, all reference pages
- **What's missing:** any backing query across customers/maps/directories/entries
- **Existing pieces:** none combined yet — would need a new RPC or client-side fan-out query
- **Shown meanwhile:** the search input renders (Phase 1) but is disabled/non-functional
- **Size guess:** L
- **Status:** To do

### [ADMIN-SHELL] Support link destination
- **Where in the design:** TopBar support icon, all reference pages
- **What's missing:** a decision on where it should link (docs site? mailto? a chat widget?)
- **Existing pieces:** none
- **Shown meanwhile:** links to `#` (no-op)
- **Size guess:** decision, not build
- **Status:** To do

### [ADMIN-SHELL] Per-directory Domain & Publishing view
- **Where in the design:** `nav.config.json` `panels.directory.groups[Settings].domain-publishing` (Phase 2)
- **What's missing:** `DomainSettings.jsx` has no per-directory mode — it takes only `{clientId, clientName, eventSource}` and is rendered exclusively at the client level (`ClientDomains.jsx`, `AdminClientDetail.jsx`), not from any directory route. A directory *can* have a custom domain assigned (via that client-wide screen's target dropdown), but there's no directory-scoped view of it.
- **Existing pieces:** `DomainSettings.jsx`'s existing target-dropdown (`map`/`directory`) already supports assigning a domain to a directory; just no scoped view from inside the directory itself
- **Shown meanwhile:** Settings › Domain & Publishing shows `DirectoryPublishPanel` (publish/unpublish) plus a link out to the client-level Domains page
- **Size guess:** M
- **Status:** To do

### [ADMIN-SHELL] Prominent Links: new treatment
- **Where in the design:** `nav.config.json` `panels.directory.notPlaced`
- **What's missing:** decision from Damian on how Prominent Links should be presented in the new IA
- **Existing pieces:** `ProminentLinksEditor.jsx` (existing, kept reachable from Settings › General until the new treatment is decided)
- **Shown meanwhile:** existing editor stays reachable via a link from Settings › General
- **Size guess:** decision, not build
- **Status:** To do

### [ADMIN-SHELL] Leads: move under Logs or remove
- **Where in the design:** `nav.config.json` `contexts.platform.rail` (leads item note)
- **What's missing:** decision from Damian; Leads has been deprecated/historical-only since 2026-07-07
- **Existing pieces:** `AdminLeads.jsx` (existing, kept in the platform rail for now per the brief)
- **Shown meanwhile:** stays in the platform rail as today
- **Size guess:** decision, not build
- **Status:** To do

### [ADMIN-SHELL] Responsive behaviour below 1024px
- **Where in the design:** `BUILD_BRIEF.md` "HTML/CSS approach"
- **What's missing:** feature panel collapsing into a drawer below 1024px; rail collapsing to a bottom bar/drawer below 640px
- **Existing pieces:** none — Phase 1 ships desktop-first (1280–1440px) only, matching the brief's own stated priority
- **Shown meanwhile:** not responsive below 1024px in Phase 1 (existing admin/client pages weren't mobile-optimized before this either, so this isn't a regression)
- **Size guess:** M
- **Status:** To do

### [ADMIN-SHELL] Feature access (beta) as its own route
- **Where in the design:** `nav.config.json` `panels.customerAccount` (lists Customer details / Entitlements / Feature access as three peer items)
- **What's missing:** "Feature access (beta)" (the three `feature_flag_overrides` toggles — Directories & Categorisations, Directory pages, Custom domains) is a *subsection inside* the "Customer details" tab today, not its own tab — **corrects an earlier version of this entry which wrongly said it was "folded into Entitlements"; it's actually inside Customer details.** Phase 3 built real routes for Customer details (`/admin/clients/:clientId/details`) and Entitlements (`/admin/clients/:clientId/entitlements`), but left Feature access where it is rather than extracting it (the three toggles already save independently of the surrounding form, so the extraction is low-risk, just deferred).
- **Existing pieces:** the three toggles + their handlers already exist in `AdminClientDetail.jsx`'s "details" tab
- **Shown meanwhile:** reachable via Customer details, not its own nav item
- **Size guess:** S
- **Status:** To do

### [ADMIN-SHELL] Page body content still uses the old design system
- **Where in the design:** every reference page — cards, stat tiles, pills, tables, buttons, form fields all use the new class vocabulary (`admin-shell.css`'s `.card`/`.stat`/`.pill`/`.tag`/`.table`/`.btn--primary`/`.field`/etc.) throughout the *whole page*, not just the chrome.
- **What's missing:** Phases 1–4 only ever applied the new design system (Source Serif 4 + Public Sans, the `--lc-*`/`--shell-*` tokens, the `.card`/`.stat`/`.pill`/`.table` class vocabulary) to the shell chrome itself (`TopBar`/`Rail`/`WorkspaceSwitcher`/`FeaturePanel`). Every page's actual content — both pre-existing panels (`DirectoryEntriesPanel`, `DirectoryClaimsPanel`, `DirectoryBrandingPanel`, etc., untouched per "move, don't rewrite") and the pages built fresh in Phase 4 (`ClientHome`, `DirectoriesDashboard`, `DirectoryOverviewRoute`, `DirectoryAnalyticsRoute`) — still renders with the old look: Poppins/DM Sans instead of the new fonts, `admin.css`'s `--lc-brand`/`.admin-card`/`.btn`/`.admin-table` classes (or Mantine components, or one-off inline styles) instead of the new component vocabulary. The result is a visible seam: new nav around old-styled content. This is distinct from — and a larger, more visible problem than — the "Admin/client token unification" entry below, which is only about CSS custom property *names* coexisting, not about page bodies never adopting the new visual language at all.
- **Compounding issue:** `ClientLayout.jsx` still wraps most page content in the old `.page-main` (max-width 1230px, its own padding, centred) *inside* the new shell's own `.main`/`.main--wide` (which also pads) — doubling up padding and narrowing content more than the reference design intends.
- **Existing pieces:** the class vocabulary and tokens already exist and are proven in the shell itself (`src/styles/admin-shell.css`, `admin-shell-tokens.css`) — this is a rollout/migration job across existing pages, not new design work. `BUILD_BRIEF.md`'s "Shared parts used across pages" (`StatTile`, `ActionList`, `Pill`, `Tag`, `Card`, `DataTable`, `Tabs`) were never actually built as reusable components; only ad hoc `.admin-card`/inline-style equivalents exist per page today.
- **Shown meanwhile:** every page works, just visually inconsistent with its own surrounding shell.
- **Size guess:** L (touches most page files in `src/pages/{client,admin}/` and `src/components/directories/`; best done incrementally, page-by-page or panel-by-panel, not as one sweep)
- **Status:** To do

### [ADMIN-SHELL] Admin/client token unification
- **Where in the design:** `tokens.css` header comment ("port into the global stylesheet or theme")
- **What's missing:** a single token system. Today `src/style.css` (`--brand-*`), `src/pages/admin/admin.css` (its own separate `--lc-brand`/`--lc-border`), and the new `src/styles/admin-shell-tokens.css` (`--lc-teal`/`--shell-*`) all coexist with overlapping but different names.
- **Existing pieces:** none — deliberately deferred; see the Phase 1 plan's "explicit non-goals"
- **Shown meanwhile:** three token systems coexist; new shell components only ever reference `admin-shell-tokens.css`'s names
- **Size guess:** L
- **Status:** To do
