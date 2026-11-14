# Discover UI rollout: build brief for Claude Code

Apply the Layercake Discover UI system to every screen of the admin application: the **client portal** (`/client/*`) and the **staff admin** (`/admin/*`). This is a large, multi-phase job. Work in the phases below, one branch and one PR per phase, and **stop for review at the end of each phase**.

Read this whole brief before writing any code. Then read, in this order: `README.md` (decisions), `COMPONENTS.md`, `PATTERNS.md`, `tokens.css`, `discover-ui.css`, `MIGRATION_INVENTORY.md`, and open the HTML files in `reference/` in a browser. The earlier shell brief in `docs/design/admin-shell/` still describes the shell structure; this brief builds on it and wins where they differ.

---

## 0. Ground rules

These apply to every phase. If any instruction below seems to conflict with one of these, stop and ask.

1. **Follow `AGENTS.md` and `CLAUDE.md` first**: opening checks for open branches/PRs, branch naming, commit little and often, PR (never push to `main`, never merge yourself), `docs/DEPLOYMENTS.md` entry, `docs/USER_GUIDE.md` updates for user-facing behaviour, admin event instrumentation.
2. **Presentation, not behaviour.** Change how things look and how state is communicated. Do not change data fetching, Supabase queries, RPCs, Edge Functions, routes, permissions, feature flags, entitlements, or event names. Keep every existing `recordEvent` / `recordAdminEvent` call exactly as it is.
3. **The only new behaviour** allowed: the processing pattern (JobCard, TaskIndicator, KeepOpenBanner, disabling conflicting actions while a job runs), ConfirmDialog in place of `window.confirm`, the Ask Pip UI preview (mocked, no network), Toasts confirming existing actions, and the saving rules in PATTERNS.md §3 **only where a page already saves that way** (do not convert autosave to explicit save or vice versa without listing it in the phase report).
4. **No database migrations and no Edge Function deploys** as part of this work. If admin event instrumentation for the assistant needs a migration (e.g. an event-type check constraint), stop and ask before writing it.
5. **No new dependencies.** No Tailwind, no new component library, no animation library. Mantine stays installed for now and is themed to the tokens; new code doesn't import Mantine directly (only `src/components/ui/` wrappers may).
6. **Tokens only.** No hard-coded colours, font sizes, radii or shadows in pages. Inline styles only for genuinely dynamic values (a computed width, a user-chosen colour swatch, a map position).
7. **Don't invent features.** Where a reference shows something that isn't built (e.g. "Getting started" checklist, "Search & AI" rename, time-left estimates without data), don't build it: add a `BACKLOG.md` entry (format below).
8. **Labels stay as they are** in `src/config/navConfig.js` and on pages, unless this brief names a change. Proposed renames go to BACKLOG.
9. **Brand chrome is unchanged**: keep the Layercake Maps logo and product name in the top bar and page titles. The reference files show a provisional "layercake discover" wordmark: ignore it. Pip appears only as the assistant and in empty/error states.
10. **Out of scope** (do not restyle): published directory sites and their generator (`supabase/functions/generate_directory_site`), embedded/public maps (`PublicMap`, `EmbedMap`, `CustomDomainMap`, `SlugMap`, `PublishedMapView`, `DirectoryMap`), marketing/legal pages (`Pricing`, `Terms`, `Privacy`, `MemcomMapsDemo`, `PricingPlans`, `SiteHeader`, `SiteFooter`), auth pages (`Login`, `SignUp`, `ForgotPassword`, `ResetPassword`, `AuthForm`), claimant pages (`pages/claim/*`, `components/claim/*`, which render in the client's own directory brand), and anything that previews a client's site in their theme (`experience/SitePreview`, `EntryPreviewBlock`, `EntryCardPreview` contents). Restyle the admin chrome around those previews, not the previews. `MIGRATION_INVENTORY.md` marks these `out`.

### BACKLOG.md entries

Add to `BACKLOG.md` at the repo root, one per item:

```
### [DISCOVER-UI] <short title>
- Source: docs/design/discover-ui/<file> (<section or reference page>)
- What the design shows: <one or two sentences>
- Why not built now: <not in scope / needs data / needs product decision>
- Suggested next step: <one sentence>
```

### Phase report (end of every phase)

Post in the PR description and in chat: files changed (grouped), components added, BACKLOG entries added, deviations from the brief and why, acceptance checks run with results (including the grep counts in §9), screenshots of the reference-equivalent pages at 1440px and 390px, and anything you need a decision on.

---

## 1. Phase 1: tokens, type and theme

Branch: `feat/<date>-discover-ui-tokens`

1. Merge `tokens.css` into `src/styles/admin-shell-tokens.css`. Overrides replace existing values; new tokens are added in the matching group. Keep the file's two-layer comment structure.
2. Fonts: add Bricolage Grotesque (opsz 12..96, weights 600/700/800) to the Google Fonts request the shell uses; set `--font-display` to Bricolage. Remove Source Serif 4 from the request once no shell style references it. Do not change fonts on out-of-scope pages.
3. Typography rules from `discover-ui.css` "Typography in the shell": `.page-title`, `.card-title`, `.panel-title` use `--fw-display` (700) and `--tracking-display`; `.stat-value` uses 800. Check that titles still fit the panel width (`--panel-w` 272px): truncate long directory names with ellipsis and a `title` attribute.
4. Port `discover-ui.css` into `src/styles/admin-shell.css` (or `src/styles/discover-ui.css` imported by `AppShell.jsx` after admin-shell.css). Keep the `.shell` scoping so nothing leaks onto public pages.
5. Mantine theme in `src/main.jsx`: replace `primaryColor: "dark"` with a custom 10-shade palette generated from `--shell-accent` (#0f5e63) with shade 6 = #0f5e63; `defaultRadius` 10px; `fontFamily` `var(--font-body)`; `headings.fontFamily` `var(--font-display)`; Button default height 44; Input radius 10 and border `#e3dfd8`. This makes unmigrated Mantine pieces look closer immediately; it doesn't replace migrating them.
6. Remove the global `.btn-primary` near-black (#111827) look by pointing `.btn`, `.btn-primary`, `.btn-sm`, `.btn-danger` in `pages/admin/admin.css` at the shell tokens (teal primary, 44px, radius 10) **as a temporary bridge**, so pages are visually consistent while they wait for migration. Leave a `/* DISCOVER-UI bridge: delete in phase 7 */` comment. Do the same for `.xp-btn*`, `.xp-input`, `.admin-card`, `.panel-section` and `.admin-table` (map to `.shell-btn`, `.input`, `.section`, `.table` looks).

Done when: the app builds, every in-scope page renders with Bricolage titles and teal primaries, no public page changed (spot-check `PublicMap`, a generated directory preview and `Login`), screenshots attached.

---

## 2. Phase 2: shared UI kit

Branch: `feat/<date>-discover-ui-kit`

Build every component in `COMPONENTS.md` in `src/components/ui/`, with `index.js` exports:

`Button`, `AIButton` (re-skin in place in `components/ai/`, re-exported from `ui/`), `SparkIcon` and icon set (`ui/icons.jsx`), `Section`, `SettingRow`, `Tabs`, `OverflowMenu`, `Field`, `TextInput`, `Select`, `Textarea`, `Checkbox`, `CheckboxGroup`, `FieldGrid`, `Switch`, `SegmentedControl`, `RadioCards`, `ColourField`, `TagPicker`, `Pill`, `Callout`, `Toast` + `ToastProvider` + `useToast`, `EmptyState`, `ErrorState`, `Skeleton`, `Toolbar`, `BulkBar`, `DataTable`, `StatTile`, `StatGrid`, `ActionList`, `Dialog`, `ConfirmDialog` + `useConfirm`, `SaveBar` + `useUnsavedGuard`.

- **Move, don't duplicate**: `SegmentedControl`, `ColourField`, `ContrastBadge`, `OptionalColourField`, `Dialog`, `ConfirmDialog`, `NameDialog`, `OverflowMenu`, `SaveBar`, `useUnsavedGuard`, `useTabKeys` move from `components/experience/ui.jsx` into `ui/`. Leave `experience/ui.jsx` re-exporting from `ui/` until phase 7 so imports keep working.
- Engagement's `MetricCards`, `Panel`, `EmptyChart`, `LoadingState`, `DataTable` (`components/engagement/EngagementShared.jsx`) become thin wrappers over `StatGrid`, `Section`, `EmptyState`, `Skeleton`, `DataTable`; keep the charts as they are but put them inside `Section`.
- Copy the Pip SVGs from `docs/design/discover-ui/assets/pip/` to `src/assets/pip/` and `assets/spark.svg` to `src/assets/spark.svg`; import them (Vite) rather than linking into `docs/`. `EmptyState`/`ErrorState` use `pip-welcome`, `pip-encouraging`, `pip-searching`, `pip-apology` at 88px max with `alt=""`.
- `ToastProvider` mounts in `AppShell`.
- **UI kit page**: add a staff-only route `/admin/ui-kit` (inside the existing `AdminGate`, linked from nowhere in the nav) that renders every component in every state, matching `reference/21-in-page-component-library.html`. This is the review surface for this phase and the regression page afterwards. Note it in `docs/FEATURES.md`.

Done when: `/admin/ui-kit` matches the reference closely at 1440px and stays usable at 390px; every component is keyboard-operable with visible focus; no component imports Mantine except an optional searchable-select wrapper; `experience/` pages still work through the re-exports.

---

## 3. Phase 3: shell updates

Branch: `feat/<date>-discover-ui-shell`

Reference: `reference/10-…` to `13-…` (templates). They reproduce today's `AppShell`, `TopBar`, `Rail`, `FeaturePanel` and `PageHead`, plus the new top-bar slots.

1. **TopBar**: add, in order after the search field: `TaskIndicator` slot (renders nothing until Phase 4), `AskPipButton` slot (renders nothing until Phase 5, and only when the assistant flag is on), support link, avatar. Keep logo, switcher and Staff view chip as they are.
2. **PageHead**: add `eyebrow`, `breadcrumb`, `status`, `size` props per COMPONENTS.md. Don't change existing call sites' output except fonts.
3. **FeaturePanel**: Bricolage panel title; truncate long titles; AI items (`ai-enrichment`, `search`) get a 12px spark after the label (`navConfig` gets an optional `ai: true` flag on those two items). No other nav changes.
4. **DirectoryPublishStatus**: restyle per `discover-ui.css` (`publish-status` overrides). Keep logic.
5. **Templates**: introduce layout helpers so pages stop hand-rolling page structure:
   - `PageLayout` (Template 1: optional `summary`, `aside`; aside 320px, stacks below 1100px),
   - `SettingsLayout` (Template 2: `.section-stack` max 880px + optional SaveBar),
   - `RecordLayout` (Template 3: breadcrumb, Tabs, form column max 760px, optional sticky preview aside 360px, SaveBar).
   Template 4 (platform) is the same helpers inside `context="platform"`.
6. Responsive (from the earlier shell brief, confirm it exists, implement if missing): below 1024px the FeaturePanel collapses into a drawer opened by a "Menu" button in PageHead; below 640px the rail becomes a bottom bar or drawer.

Done when: every route still renders inside the right template container, top bar slots exist, publish chip uses tokens.

---

## 4. Phase 4: processing pattern

Branch: `feat/<date>-discover-ui-processing`

Implement PATTERNS.md §1 exactly: `JobsProvider` (in AppShell), `useJob`, `JobCard`, `TaskIndicator` + popover, `KeepOpenBanner`, PublishStatus running state. Then wire every job in the table in §1.3 and make the page changes in §1.5, using the copy in §1.6.

Specific must-dos:
- `DirectoryPublishPanel`: remove the three stacked status lines and the ⏳ emoji; JobCard with three steps; Publish and Restore disabled with reason while running; ConfirmDialog for restore.
- AI content and SEO backfill: determinate JobCards with processed/total and percentage.
- Sheets sync: indeterminate JobCard with elapsed timer.
- CSV import and geocoding in the browser: KeepOpenBanner + `useUnsavedGuard(true)` while running, Stop button where the loop can be stopped (add a cancel flag to the loop; it's presentation-adjacent but required by the pattern; list it in the report).
- Announcements: start, each 25%, end. Not every poll.
- Reduced motion verified (no stripes, slide or spin; text still updates).
- Update `docs/USER_GUIDE.md`: publishing and AI runs now show progress cards and a top-bar task indicator; you can leave the page for server jobs; geocoding/import need the tab open.

Done when: triggering each job shows the JobCard and TaskIndicator, navigating away keeps the indicator, finishing elsewhere raises a Toast, failure persists, reload mid-job restores the running state (server jobs).

---

## 5. Phase 5: Ask Pip UI preview

Branch: `feat/<date>-discover-ui-assistant-preview`

Implement PATTERNS.md §2 exactly, using `assistant-mock.json`. Recap of the non-negotiables:

- Flag `ASSISTANT_PREVIEW_FLAG`, default on for staff only. Document it in `docs/FEATURES.md`.
- **No network calls, no LLM, no writes.** Apply and job actions only show Toasts / a local fake JobCard labelled Preview.
- Preview notice on first open per session and "Preview" pill in the header.
- Triggers: top bar button, ⌘J/Ctrl+J, `Section askPip`, `EmptyState`/`ErrorState askPip`. Add `askPip` to at least: directory Overview "Needs attention", Search & Discovery's first section, AI enrichment's first section, Entries empty state, and Publishing's failed JobCard.
- Drawer layout, focus management, scrim breakpoints, reduced motion, sessionStorage persistence, live region, fallback reply, `/error` and `/unavailable` staff test commands.
- Admin events `admin_assistant_opened` and `admin_assistant_prompt_selected` per PATTERNS.md §2.5 and AGENTS.md (ask first if a migration is needed).
- `docs/USER_GUIDE.md`: short "Ask Pip (preview)" section for staff.

Done when: the drawer matches `reference/31-…` and every state in `reference/32-…` is reachable; keyboard-only and screen reader (VoiceOver quick pass) work; nothing is sent over the network when using it (check the browser network panel and say so in the report).

---

## 6. Phase 6: migrate every page

Branches: one per wave, e.g. `feat/<date>-discover-ui-wave-a-directory`.

Use `MIGRATION_INVENTORY.md` as the checklist (tick the Done column in the same PR). Order:

**Wave A: directory workspace** (`components/directoryPanel/*` routes and the panels they render in `components/directories/*`)
Overview → Entries (`DirectoryEntriesPanel`, `BulkCategoryEditModal`) → Entry editor tabs (`entryEdit/*`, `DirectoryEntryEditor`, `RichTextEditor` chrome) → Publishing (`DirectoryPublishPanel`) → Search & Discovery (`DirectorySearchSettingsPanel`, `DirectoryAiSearchPanel`) → AI enrichment (`DirectoryAiContentPanel`, `DirectoryAiSeoMetadataPanel`, `DraftingPromptModal`, `components/ai/*`) → SEO (`DirectorySeoSettingsPanel`) → Claims (`DirectoryClaimsPanel`, `ClaimBannerSettings`) → Insights (`DirectoryAnalyticsPanel`, `components/engagement/*`) → Email settings / log (`DirectoryEnquiryPanel`, `DirectoryEmailTemplatesEditor`) → General settings (`DirectoryGeneralSettingsPanel`) → Domain (`DomainSettings`) → Web analytics (`components/integrations/*`) → Pages (`DirectoryContentPagesPanel`) → Categories (`CategorisationsPanel`, `CategoryTagPicker`, `CategorisationAttachmentPicker`) → Accreditations (`AccreditationSchemesPanel`, `AccreditationsEditor`, `EvidenceItemsEditor`) → Look & feel and Entry pages (`components/experience/*` except `SitePreview` internals) → editors (`MediaAssetsEditor`, `ProductTilesEditor`, `ProminentLinksEditor`, `TeamMembersEditor`).

**Wave B: client workspace**
`ClientHome`, `ClientDirectories` / `DirectoriesDashboard`, `ClientDirectoryNew`, `ClientDashboard` / `MapsView`, `ClientMapNew`, `ClientMapDashboard`, `ClientMapData`, `ClientMapListings`, `MapStats`, `ListingStats`, `MapEditSubNav`, `FilterFieldsPanel`, `ListingFilterValuesEditor`, `BulkFilterEditModal`, `ClientCategorisations`, `ClientTeam`, `ClientUsers`, `ClientEmail` and messaging components (`MessagingPanel`, `MessagingProfiles`, `MessagingProfileEditor`, `MessagingSentMessages`, `EntityMessagingSettings`), `ClientDomains`, `ClientIntegrations`, `SyncHistoryTable`, `MapDataTabs`, `MapTileThumb`, `LogoImage`.

**Wave C: platform**
`AdminClients`, `AdminClientNew`, `AdminClientDetail` (all tabs, `EntitlementsPanel`, `EntitlementLimitModal`), `AdminContactDetail`, `AdminMaps`, `AdminMapNew`, `AdminMapDashboard`, `AdminMapData`, `AdminMapListings`, `AdminMapStats`, `AdminListingStats`, `AdminDirectories`, `AdminDirectoryNew`, `AdminDirectoryEntryEdit`, `AdminListings`, `AdminEditListing`, `AdminUsers`, `AdminUserDetail`, `AdminLeads`, `AdminUserActivity`, `AdminErrorLogs`, `AdminSyncLog`, `AdminDeployments`, `WorkspaceSwitcher` menu content.

`AdminMapDashboard.jsx` and `ClientMapDashboard.jsx` are the largest (≈170 inline styles, ≈50 legacy containers each) and are near-duplicates: extract shared pieces into components while migrating rather than restyling both by hand.

### Per-page checklist (every page, every wave)

1. Correct template helper (`PageLayout` / `SettingsLayout` / `RecordLayout`).
2. `PageHead` first, with at most two actions; extra actions in `OverflowMenu`.
3. Every container is a `Section` (no `.admin-card`, `.panel-section`, `.xp-card`, `.card` hand-assembled in the page, no bordered `div` with inline styles).
4. Every button is `Button` / `AIButton` (no `.btn*`, `.xp-btn*`, Mantine `Button`, styled `<a>` pretending to be a button, or `<div onClick>`).
5. Every input is inside `Field` with a real `<label>`; errors via `error` prop; no placeholder-as-label.
6. Lists of records are `DataTable` with `Toolbar`/`BulkBar`; name cell is the link; row actions in `rowMenu`.
7. Status words use `Pill`; page messages use `Callout`; no coloured `<p>` messages; no emoji.
8. Loading uses `Skeleton`; empty uses `EmptyState` with the next action; failures use `ErrorState` or `Callout danger`.
9. Long work uses the processing pattern; short work uses Button loading.
10. Destructive actions use `ConfirmDialog` (search the file for `window.confirm` and `confirm(`).
11. Saving behaviour matches PATTERNS.md §3 for that page type (or is listed as a deviation).
12. No hard-coded hex, px font sizes or inline layout styles left (dynamic values excepted, with a comment).
13. Copy pass: sentence case, verb-first buttons, British English, no exclamation marks.
14. Keyboard pass: Tab order, visible focus, Esc closes overlays, focus returns to the trigger.
15. Widths: 1440, 1280, 1024, 768, 390. Wide tables scroll inside `.table-wrap`.
16. Tick the file in `MIGRATION_INVENTORY.md`.

---

## 7. Phase 7: clean-up and enforcement

Branch: `feat/<date>-discover-ui-cleanup`

1. Delete the bridge rules added in phase 1 and the now-unused legacy CSS: `.btn*` and `.admin-*` in `pages/admin/admin.css`, `.xp-*` in `components/experience/experience.css`, `--uka-*` in `components/ai/ai.css`, `--lc-card` / `--lc-border` / `--lc-muted` duplicates where unused. Keep anything still used by out-of-scope pages (grep first).
2. Remove the `experience/ui.jsx` re-exports and update imports.
3. Remove direct `@mantine/core` imports outside `src/components/ui/`. If none remain, keep `MantineProvider` only if a wrapper still needs it; otherwise propose removing Mantine in a BACKLOG entry (don't remove the dependency in this PR).
4. Add `scripts/check-ui.sh` running the greps in §9 over in-scope paths and failing on non-zero counts for the "must be zero" checks. Mention it in `AGENTS.md` under Conventions (one line) so future sessions run it.
5. Update `docs/FRONTEND_ARCHITECTURE.md` with a "UI system" section: where tokens live, the `ui/` kit, templates, patterns, and "use `/admin/ui-kit` before adding a component".

---

## 8. Accessibility and quality bar (all phases)

- Text contrast ≥ 4.5:1 (3:1 for 24px+ bold). Never put text in `--spark` (#f47721) or `--progress-fill`; use `--spark-ink` for orange text. White text on `--lc-teal` only at 24px+.
- Status never by colour alone: every pill, chip and job state has words.
- Focus visible everywhere; `--focus-ring-on-dark` on the rail, ink top bar, toasts and KeepOpenBanner.
- Touch targets 44px (36px for `size="sm"` in dense UI).
- `prefers-reduced-motion`: no spin, slide, stripes, pulse or drawer animation; state changes still communicated in text.
- Live regions: JobCard, Toast, SaveBar status, assistant replies. Polite unless failed.
- Decorative images and Pip art `alt=""`; icon-only buttons have `aria-label`.
- No layout shift when a JobCard appears: it pushes content down once; it doesn't flicker between polls.

---

## 9. Acceptance checks

Run over in-scope paths (`src/pages/admin`, `src/pages/client`, `src/components` excluding the out-of-scope files listed in §0.10). Report the numbers at the end of each phase; the final phase must hit the targets.

| Check | Command (from repo root) | Target after phase 7 |
|---|---|---|
| Legacy buttons | `grep -rEn 'className="[^"]*\b(btn\|btn-primary\|btn-sm\|xp-btn)\b' src/pages/admin src/pages/client src/components` | 0 |
| Legacy containers / tables | `grep -rEn 'admin-card\|panel-section\|admin-table\|xp-card' src/pages/admin src/pages/client src/components` | 0 |
| xp-* classes | `grep -rEn '\bxp-[a-z]' src/pages src/components` | 0 |
| Mantine outside ui/ | `grep -rln '@mantine/core' src \| grep -v 'src/components/ui/' \| grep -v 'src/main.jsx'` | 0 |
| window.confirm | `grep -rn 'window.confirm\|[^.]confirm(' src/pages/admin src/pages/client src/components` | 0 |
| Emoji in UI | `grep -rnP '[\x{2300}-\x{23FF}\x{2600}-\x{27BF}\x{1F300}-\x{1FAFF}]' src/pages/admin src/pages/client src/components` | 0 |
| Hex colours in JSX | `grep -rEn '#[0-9a-fA-F]{3,6}\b' src/pages/admin src/pages/client src/components --include=*.jsx` | Only user-data colours (swatches, theme pickers), each with a comment |
| Inline styles | `grep -rEo 'style=\{\{' src/pages/admin src/pages/client src/components \| wc -l` | Under 150 in-scope (from ~1,930), all dynamic |
| Build | `npm run build` | Passes |

Functional checks: every route in `reference/03-admin-sitemap.html` loads for a client manager, a view-only client user and a staff user (in client and platform context); publish, AI run, SEO backfill, sheet sync, CSV import and geocode each show the processing pattern end to end; Ask Pip opens from every trigger and makes no network requests.
