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
- **Status:** Done (2026-10-04). Settings › Publishing (`DirectoryPublishPanel`) and Settings › Domain (`DomainSettings.jsx` with the new optional `directoryId` scope: only that directory's domains, new domains always publish it) are separate pages, in both the client portal and admin views.

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
- **Where in the design:** every reference page — cards, stat tiles, pills, tables, buttons, form fields all use the new class vocabulary (`admin-shell.css`'s `.card`/`.stat`/`.pill`/`.tag`/`.table`/`.field`/etc.) throughout the *whole page*, not just the chrome.
- **What's missing:** Phases 1–4 only ever applied the new design system (Source Serif 4 + Public Sans, the `--lc-*`/`--shell-*` tokens, the `.card`/`.stat`/`.pill`/`.table` class vocabulary) to the shell chrome itself (`TopBar`/`Rail`/`WorkspaceSwitcher`/`FeaturePanel`). **Fixed:** every page-level wrapper in both the client portal and the admin console — all of `src/pages/client/*.jsx` (Home, Directories dashboard, Directory overview/analytics, My Maps, Categorisations, Messaging — including removing `ClientEmail`'s outer white-card wrapper entirely, per Damian's direct feedback — Domains, Team, new-directory/new-map forms, map listings) and all of `src/pages/admin/*.jsx` except `AdminMapData.jsx`, plus all 9 `directoryPanel/*.jsx` route-wrapper files. Each of these got its own `.admin-card`/`.page-main`/inline-style wrapper swapped for `.card`/`.card-title`/`.page-head`/`.field`/`.shell-btn`, and the delete/create modals within them left on their own separate old modal styling (`.admin-modal`, out of scope — a distinct, self-contained system, not a page body). **Still open (deliberately deferred, "move don't rewrite"):** every genuinely deep pre-existing panel a page *renders* — `DirectoryEntriesPanel`, `DirectoryClaimsPanel`, `DirectoryBrandingPanel`, `CategorisationsPanel`, `MessagingSettings`, `MessagingSentMessages`, the `entryEdit/*` tabs, `DirectoryContentPagesPanel`, `DirectoryEnquiryPanel`, `DirectoryAiContentPanel`, `BulkFilterEditModal`, `BulkCategoryEditModal`, `PricingPlans`, and the rest of `src/components/directories/*Panel.jsx` — plus `ClientMapData.jsx`/`ClientMapDashboard.jsx`/`AdminMapData.jsx` (1700–3300 lines each, genuinely deep map-editing UIs). These are qualitatively different work: rewriting complex existing feature UIs, not swapping a wrapper's class names. Distinct from the "Admin/client token unification" entry below, which is only about CSS custom property *names* coexisting.
- **Compounding issue:** `ClientLayout.jsx` still wraps not-yet-migrated page content in the old `.page-main` (max-width 1230px, its own padding, centred) *inside* the new shell's own `.main`/`.main--wide` (which also pads) — doubling up padding. Fixed pages no longer use `.page-main`. Shared spacing tokens (`--main-pad-x`/`--main-pad-top`) were also tightened app-wide to match a more economical (HubSpot-style) top/left margin, per Damian's direct feedback.
- **Existing pieces:** the class vocabulary and tokens now exist in `src/styles/admin-shell.css` (ported the pack's Buttons/Pills/Surfaces/Tabs/Forms/Toolbar+table sections — note buttons are `.shell-btn`/`.shell-btn--*`, not the pack's bare `.btn`, to avoid colliding with `admin.css`'s existing global `.btn`) — the rollout onto every remaining deep panel is a migration job, not new design work. Broadly-shared old classes (`.admin-table`, `.admin-controls`, `.admin-map-tabs`, `.admin-modal`) are deliberately left alone, same reasoning as `.btn` — they're used on dozens of not-yet-migrated components, so restyling them now would be a much bigger, separate, riskier piece of work than migrating one page's own wrapper. `BUILD_BRIEF.md`'s "Shared parts used across pages" (`StatTile`, `ActionList`, `Pill`, `Tag`, `Card`, `DataTable`, `Tabs`) still aren't reusable React components, just CSS classes applied inline per page — worth building as real components if/when this rollout continues into the deep panels.
- **Follow-up fix:** `AdminLayout.jsx` (the shared chrome every admin page renders inside — breadcrumbs, per-page right-side actions, the client-detail tab bar) still had its own pre-shell markup/CSS never migrated: a translucent-white-on-dark `.admin-actions` "Sign out" button rendering as a stray floating button on the new light background (redundant anyway — `AvatarMenu` in the TopBar already covers sign-out, "replacing the ~20 ad hoc per-page buttons" per its own doc comment, just never actually removed from the pages), and a small gray `.admin-breadcrumbs` bar standing in for the page title. Fixed: the redundant sign-out button removed from all ~20 admin pages (kept `AdminMapDashboard`'s real "Save" action, dropped only its bundled sign-out); breadcrumbs now render as a proper `.page-head`/`.page-title`, with any earlier crumbs as a small trail above it.
- **Follow-up fix 2:** even after the above, `AdminClientDetail` (the "Maps/Directories/Categorisations/Entitlements/Customer details/Users/Messaging/Domains" workspace) still looked structurally different from the client portal — its section nav was a horizontal tab bar under the breadcrumb, where the client portal (and the directory workspace, via `DirectoryFeaturePanel`) puts section nav in a dedicated white left-column panel next to the black rail. Damian flagged this directly ("the page navigation should be put into the left hand column... like in other screenshot"). Fixed: new `CustomerWorkspaceFeaturePanel.jsx` (mirrors `DirectoryFeaturePanel`'s pattern) renders all 8 sections as a flat left-column list via the shell's existing `panel` slot; `AdminClientDetail` passes it instead of the old `clientNavItems`/tab-bar props, which were removed from `AdminLayout.jsx` entirely (along with the now-superseded `CustomerAccountFeaturePanel`, deleted). Found and fixed a real bug in the shared `FeaturePanel.jsx` while doing this: its active-route detection marked a group's base item (e.g. "Overview"/"Maps") active *simultaneously* with whatever deeper sub-route was actually open, since the base route is always a path-prefix of every sibling route — fixed to prefer the most specific (longest) matching route, benefiting `DirectoryFeaturePanel` too, not just the new panel.
- **Shown meanwhile:** every page works; every page's own wrapper/shell and the shared admin chrome around it now match the new design system. The content *inside* deep panels (forms, tables, editors within `DirectoryEntriesPanel` etc.) and the 3 big map-data/dashboard files don't yet.
- **Size guess:** L (touches ~20 deep `*Panel.jsx`/`entryEdit/*` files plus 3 very large map-editing pages; best done incrementally, panel-by-panel, not as one sweep — each is a real rewrite, not a class-name swap)
- **Status:** In progress — every page wrapper done; deep panels and the 3 large map-data pages remain

### [ADMIN-SHELL] Admin/client token unification
- **Where in the design:** `tokens.css` header comment ("port into the global stylesheet or theme")
- **What's missing:** a single token system. Today `src/style.css` (`--brand-*`), `src/pages/admin/admin.css` (its own separate `--lc-brand`/`--lc-border`), and the new `src/styles/admin-shell-tokens.css` (`--lc-teal`/`--shell-*`) all coexist with overlapping but different names.
- **Existing pieces:** none — deliberately deferred; see the Phase 1 plan's "explicit non-goals"
- **Shown meanwhile:** three token systems coexist; new shell components only ever reference `admin-shell-tokens.css`'s names
- **Size guess:** L
- **Status:** To do
