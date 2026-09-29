# Backlog

Gaps identified while building the admin shell redesign (`docs/design/admin-shell/`) — things
the design shows that aren't built yet. One entry per missing capability, per
`docs/design/admin-shell/BUILD_BRIEF.md`'s process: check the codebase and `docs/FEATURES.md`
first; if a piece already exists, wire it up instead of adding a new entry for it.

### [ADMIN-SHELL] Organisation home dashboard
- **Where in the design:** `00-organisation-home.html`
- **What's missing:** aggregate counts (maps, directories, published, enquiries in 30 days, team size), Needs attention feed, Recent activity feed (from `admin_events`)
- **Existing pieces:** `admin_events` table for the activity feed; maps/directories/contacts counts are simple queries
- **Shown meanwhile:** the Home rail item links to `/client` (today's maps grid) until this page is built
- **Size guess:** L
- **Status:** To do

### [ADMIN-SHELL] "My maps" as distinct from Home
- **Where in the design:** `nav.config.json` `contexts.client.rail` (maps item)
- **What's missing:** `/client` currently *is* the maps grid; the design's `/client/maps` route doesn't exist yet
- **Existing pieces:** `ClientDashboard.jsx` (existing maps grid)
- **Shown meanwhile:** Home and My maps both point at `/client`
- **Size guess:** S
- **Status:** To do

### [ADMIN-SHELL] Directories dashboard views, plan box, card preview
- **Where in the design:** `01-directories.html`
- **What's missing:** Published / Not yet published / Archived filtered views; entitlements-derived plan box (plan name, directories used of allowance, features needing a higher plan); directory card preview image; linked map shown on the card
- **Existing pieces:** `ClientDirectories.jsx` (list), `src/lib/entitlements.js` (plan lookups), `is_active`/archive field already exists
- **Shown meanwhile:** today's unfiltered `ClientDirectories.jsx` list carries over unchanged
- **Size guess:** M
- **Status:** To do

### [ADMIN-SHELL] Directory overview page
- **Where in the design:** `02-directory-overview.html`
- **What's missing:** entries changed since last publish; counts of entries missing SEO metadata/page content/logo/coordinates; last published date/user/version; claimed listings and awaiting verification; enquiries in 30 days; visitor feature on/off summary; generated file links
- **Existing pieces:** `DirectoryPublishPanel` (last-published data), `DirectoryClaimsPanel`, `DirectoryEnquiryPanel`, `generate_directory_site` outputs (`sitemap.xml`, `robots.txt`, `llms.txt`)
- **Shown meanwhile:** hidden until Phase 2/4 build the Overview route
- **Size guess:** L
- **Status:** To do

### [ADMIN-SHELL] Entries table "Gaps" column + sector filter
- **Where in the design:** `03-directory-entries.html`
- **What's missing:** a derived "no logo / no page content / no SEO / not geocoded" column and filter; a sector filter sourced from categorisations
- **Existing pieces:** `DirectoryEntriesPanel.jsx`; the underlying fields (logo, content, SEO, coordinates) already exist per entry
- **Shown meanwhile:** today's entries table is unchanged
- **Size guess:** M
- **Status:** To do

### [ADMIN-SHELL] Insights › Analytics for a directory
- **Where in the design:** `INFORMATION_ARCHITECTURE.md` §6 (Insights group)
- **What's missing:** a dedicated route/UI for directory analytics
- **Existing pieces:** `DirectoryAnalyticsPanel.jsx` **already exists and is wired up today** — it's just nested inside the Settings tab, not its own Insights route. This is a promotion of existing UI in Phase 2, not a new build.
- **Shown meanwhile:** stays under Settings for now
- **Size guess:** S
- **Status:** To do

### [ADMIN-SHELL] Workspace switcher: real search + recently viewed
- **Where in the design:** `staff-workspace-switcher.html`
- **What's missing:** anything beyond a trivial client-side substring filter (shipped in Phase 1); per-admin "recently viewed customers" (no storage for this exists today)
- **Existing pieces:** the `clients` table list query (as used by `AdminClients.jsx`) is reused as-is for the full list
- **Shown meanwhile:** plain alphabetical list, no recency, filter is client-side only
- **Size guess:** M
- **Status:** To do

### [ADMIN-SHELL] Customers page: plan filters with counts, "With beta access" view
- **Where in the design:** `platform-customers.html`; `nav.config.json` `panels.customers`
- **What's missing:** filtered views and counts by plan; a "beta access" flag/query
- **Existing pieces:** `AdminClients.jsx` (list), `src/lib/entitlements.js` (plan lookups), feature flag overrides table (candidate source for "beta access")
- **Shown meanwhile:** existing unfiltered `AdminClients.jsx` table
- **Size guess:** M
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

### [ADMIN-SHELL] Staff client workspace inside the client shell
- **Where in the design:** `INFORMATION_ARCHITECTURE.md` §4, §7 (`customerAccount` panel)
- **What's missing:** rendering `/admin/clients/:clientId/...` pages inside the teal client-context shell with the staff chip and a working Customer account rail item, as the brief's Phase 3 specifies. Phase 1 renders every `/admin/*` route (including these) in the platform (ink) shell — the client-shell-for-staff treatment is real design + routing work, explicitly deferred to Phase 3, not a Phase 1 oversight.
- **Existing pieces:** `AdminClientDetail.jsx` + its `clientNavItems` tab strip (Customer details / Entitlements / Feature access) already exist; note there is no separate "Feature access" tab today — it's folded into Entitlements
- **Shown meanwhile:** these routes render in the platform shell like every other admin page
- **Size guess:** L
- **Status:** To do

### [ADMIN-SHELL] Admin/client token unification
- **Where in the design:** `tokens.css` header comment ("port into the global stylesheet or theme")
- **What's missing:** a single token system. Today `src/style.css` (`--brand-*`), `src/pages/admin/admin.css` (its own separate `--lc-brand`/`--lc-border`), and the new `src/styles/admin-shell-tokens.css` (`--lc-teal`/`--shell-*`) all coexist with overlapping but different names.
- **Existing pieces:** none — deliberately deferred; see the Phase 1 plan's "explicit non-goals"
- **Shown meanwhile:** three token systems coexist; new shell components only ever reference `admin-shell-tokens.css`'s names
- **Size guess:** L
- **Status:** To do
