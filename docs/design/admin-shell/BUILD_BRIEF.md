# Admin shell redesign: build brief

Put this folder in the Directory Maps repo (for example `docs/design/admin-shell/`) and give Claude Code the prompt below.

## Suggested prompt

> Read `BUILD_BRIEF.md`, `INFORMATION_ARCHITECTURE.md`, `nav.config.json`, `tokens.css`, `admin-shell.css` and the pages in `reference/` in this folder. Rebuild the client portal and admin console shell to match. Use the existing React components, routing, data layer, feature flags and entitlements. Move existing features into the new navigation; do not rewrite them. Wherever the design shows something that is not built, do not invent it: add or update an entry in `BACKLOG.md` at the repo root. Work in the phases below and stop for review at the end of each phase. When done, list the files you changed, the BACKLOG.md entries you added, and check the acceptance criteria.

## What's in the folder

| File | Purpose |
| --- | --- |
| `BUILD_BRIEF.md` | This brief: scope, phases, rules, backlog process, acceptance criteria |
| `INFORMATION_ARCHITECTURE.md` | Contexts, navigation layers, page hierarchy, where every existing tab moves |
| `nav.config.json` | The navigation as data, with today's route/component and a `status` per item (`built`, `partial`, `new`) |
| `tokens.css` | Colour, type, spacing and shape tokens as CSS custom properties |
| `admin-shell.css` | Shell and component styles written against the tokens (the class vocabulary) |
| `reference/*.html` | Static pages at 1440px. Open in a browser. The visual source of truth |
| `assets/layercake-maps-logo-white.png` | Header logo (white, transparent). Use the existing asset if the repo already has one |

Reference pages:

| File | Shows |
| --- | --- |
| `00-organisation-home.html` | Level 0. Client home, no feature panel |
| `01-directories.html` | Level 1. Directories list with its panel |
| `02-directory-overview.html` | Level 2. Directory overview with the directory panel |
| `03-directory-entries.html` | Level 3. Entries table, filters, bulk bar |
| `04-entry-editor.html` | Level 4. Entry editor with in-page tabs |
| `staff-workspace-switcher.html` | Client context as staff, switcher open |
| `platform-customers.html` | Platform context, customers list |

The reference pages use inline styles because they were exported from the design canvas. Build with the tokens and the class vocabulary, not by copying inline styles.

## HTML/CSS approach

- **Keep the current stack** (React + Vite, existing router in `src/App.jsx`). Do not add a CSS or component framework.
- Detect how the repo styles components today and follow it. Port `tokens.css` into the global stylesheet or theme, and translate the `admin-shell.css` classes into that system. If the repo has no convention, use the two files as they are.
- Tokens are variables, never hard-coded values. `--lc-*` tokens are Layercake chrome and never vary by customer. `--accent` and friends share names with the directory entry page pack so they can be themed later.
- Fonts: Source Serif 4 (600) for page titles, card titles, the panel name and stat numbers; Public Sans (400/500/600) for everything else. Google Fonts.
- Icons: inline stroke SVG, 1.8px stroke, `aria-hidden="true"`. Reuse the repo's icon set if it has one with matching weight. No emoji, no icon fonts.
- Desktop first at 1280 to 1440px. Below 1024px, collapse the feature panel into a drawer opened from a "Menu" button in the page head; the rail stays. Below 640px, the rail becomes a bottom bar or a drawer (your call; note it in the PR).

## Shell components to build

1. **`AppShell`** with props `context` (`client` | `platform`), `isStaff`, `panel` (optional). Renders top bar, rail, optional panel and `<main>`.
2. **`TopBar`**: logo (links to the context home), `WorkspaceSwitcher`, global search field, support link, avatar menu (sign out lives here, not as a header button). Shows the "Staff view" chip when `context=client && isStaff`.
3. **`WorkspaceSwitcher`**: staff only. Accessible menu: button with `aria-haspopup`/`aria-expanded`, search input, Platform admin item, customer list (current ticked, plan shown), "All N customers". Esc closes, focus returns to the button. Client users get plain text instead.
4. **`Rail`**: driven by `nav.config.json` for the current context. Icon-only, `aria-label` on each link plus a visible tooltip on hover and focus. `aria-current="page"` on the active section. Hide items whose feature flag or entitlement is off (use the existing `FeatureGate`/`EntitlementGate`). Staff-only items use the `--staff` style and only render for admins.
5. **`FeaturePanel`**: heading, optional back link and subtitle, optional primary action, grouped `NavItem`s with optional counts, optional footer (plan box). Driven by config.
6. **`PageHeader`**: breadcrumb, title, pills or count, actions. One primary action; destructive actions in a "more" menu.
7. Shared parts used across pages: `StatTile`, `ActionList` (Needs attention), `Pill`, `Tag`, `Card`, `DataTable` with toolbar and bulk bar, `Tabs` (level 4 only).

Use real elements: `<a href>` for navigation, `<button>` for actions, `<label>` with every input, `<table>` for tables, `<nav aria-label>` for each navigation layer.

## Phases

Stop for review after each phase.

1. **Tokens and shell.** Tokens, `AppShell`, `TopBar`, `Rail`, `FeaturePanel` with the client and platform rails from config. Wrap existing pages in the shell without changing their content. Switcher shows but may link to existing pages.
2. **Directory navigation.** The directory panel (Overview, Content, Experience, Engagement, Insights, Settings). Split today's directory tabs into the routes in `nav.config.json` and move each panel component unchanged. Redirect old tab URLs. Entry editor keeps its tabs, sits inside the directory panel with Entries highlighted.
3. **Staff and platform.** Workspace switcher, platform context (header, rail, Customers page with panel, Logs panel), Customer account rail item and panel. Staff client workspaces render on the `/admin/clients/:clientId/...` routes inside the client shell (see IA §4). No impersonation.
4. **New pages from built data.** Organisation home, Directories dashboard, Directory overview, and the Entries table updates (gaps column, filters). Build what existing data supports; everything else goes to BACKLOG.md and shows as an empty state or is hidden, never as fake numbers.

## Rules

- **Move, don't rewrite.** Existing panels (`DirectoryEntriesPanel`, `DirectoryPublishPanel`, `DirectoryClaimsPanel`, etc.) move into the new routes as they are. Restyle only through tokens and shared components.
- **Keep permissions exactly as they are.** Owner/manager-only pages stay owner/manager-only; Members still need directory grants; entitlement- and flag-gated items stay gated.
- **Admin/client parity.** Client and admin already share components. Keep one component per page, rendered in either context.
- **No fake data.** `[N]`, `[DATE]`, `[NAME]`, `[PLAN]` and `[On / Off]` in the reference pages are placeholders. Bind them to real queries or backlog them.
- **Prominent links** are not in the new navigation because they are being redesigned. Keep the current editor reachable (for example a link from Settings › General) and add a backlog entry.
- **Leads** is deprecated (historical data only). Keep it in the platform rail for now and add a backlog entry asking whether to move it under Logs or remove it.
- Don't change the public directory pages or the embed. The entry page has its own build pack.

## BACKLOG.md

Create `BACKLOG.md` at the repo root if it doesn't exist; otherwise append. One entry per missing capability. Before adding anything, check the codebase and FEATURES.md: if it exists, wire it up instead.

Entry format:

```md
### [ADMIN-SHELL] <short title>
- **Where in the design:** <reference page + element>
- **What's missing:** <data, query, RPC, UI, or decision>
- **Existing pieces:** <tables, events, components that could be reused>
- **Shown meanwhile:** <hidden | empty state text | link to existing page>
- **Size guess:** S / M / L
- **Status:** To do
```

Candidates to check (verify each; some may already exist):

1. Organisation home: aggregate counts (maps, directories, published, enquiries in 30 days, team size), Needs attention across the organisation, Recent activity feed (possibly from `admin_events`).
2. Directories dashboard: Published / Not yet published / Archived views; plan box (plan name, directories used of allowance, features needing a higher plan) from the entitlements model; directory card preview image; linked map shown on the card.
3. Directory overview: entries changed since last publish; counts of entries missing SEO metadata, page content, logo, or coordinates; last published date, user and version; claimed listings and awaiting verification; enquiries in 30 days; visitor feature on/off summary; generated file links.
4. Entries table: "Gaps" column and filter (no logo, no page content, no SEO metadata, not geocoded); sector filter from categorisations.
5. Insights › Analytics for a directory (events exist; check for a UI).
6. Workspace switcher: customer search, recently viewed customers per admin.
7. Customers page: plan filters with counts, "With beta access" view.
8. Global search in the top bar (customers, maps, directories, entries).
9. Support link destination.
10. Prominent links: new treatment (decision needed from Damian).
11. Leads: move under Logs or remove (decision needed).
12. Responsive behaviour below 1024px.

## Acceptance criteria

- [ ] Every item in `nav.config.json` with status `built` is reachable from the new navigation, and every old URL still resolves (directly or by redirect)
- [ ] Each directory tab listed in IA §6 lives at its new home; nothing from today's tabs is lost
- [ ] Header is teal in client context and ink with teal underline in platform context, on every page
- [ ] Client users never see the switcher dropdown, the staff chip, the Customer account item or platform routes
- [ ] Staff can move client ↔ platform and between customers only through the switcher or Enter workspace, with no impersonation
- [ ] Organisation home renders without a feature panel; levels 1 to 4 render with the right panel and highlighted item
- [ ] Flags and entitlements hide rail and panel items exactly as they hide the pages today
- [ ] Colours, type and spacing come from tokens, not hard-coded values
- [ ] Keyboard: every rail item, panel item, tab and menu reachable by Tab, with visible 2px focus rings; switcher menu closes on Esc
- [ ] Text contrast at least 4.5:1 (the token greys already pass on white and `--ground`)
- [ ] No placeholder or invented figures on screen; every gap has a BACKLOG.md entry
