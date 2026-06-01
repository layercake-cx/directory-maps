# Deployment log

A plain-English record of every deployment to staging and production. Newest entries go at the top.

**Audience:** humans reviewing what changed and when; agents reading context before making further changes.

**Who writes it:** whoever (or whatever agent) implements the change. Write the entry at the same time as the code, before the deployment happens. Update it with the outcome afterwards if anything differed from plan.

---

## How to write an entry

Copy the template below. Fill in every section — use plain English, not jargon. If a section genuinely doesn't apply, write "None" rather than leaving it blank. Entries do not need to be long; clarity matters more than completeness.

```markdown
## YYYY-MM-DD — [Staging | Production]

**Branch/commit:** `branch-name` | `abc1234`
**Deployed by:** Name or agent name (e.g. Claude Code, Cursor)

### What changed
Plain-English bullet list. Write for someone who wasn't in the room:
- what the feature or fix does
- why it was needed or what was broken before
- anything that looks different to users after this deploy

### Database migrations applied
List each migration file name. If none, write "None".
- `20260601120000_add_listings_logo_bg.sql`

### Rollback plan
How to undo this if something goes wrong:
- Run `20260601120000_add_listings_logo_bg.rollback.sql` on the database.
- Revert the frontend by redeploying the previous commit (`git revert` or Vercel rollback).

### Verified on staging
- [ ] Dry-run passed for all migrations
- [ ] Migrations applied and verified (row counts unchanged, RLS intact)
- [ ] Feature smoke-tested on the Preview/staging URL
- [ ] No console errors or broken pages observed

### Issues / notes
Anything that went differently from plan, any workarounds applied, anything the next person should know.
```

---

## Log

---

## 2026-06-01 — Production

**Branch/commit:** `main` | `70ac3ae`
**Deployed by:** Claude Code

### What changed
- **Fixed map title still not appearing in embeds after republish (CDN cache bypass).** Even after fixing the snapshot to include `name` and setting `s-maxage=0` on new uploads, existing CDN edge nodes continued serving year-old snapshots because changing cache headers on a re-upload does not evict already-cached responses. The embed now appends `?t=<timestamp>` to every snapshot fetch, creating a unique cache key per page load that always hits Vercel Blob's origin directly, bypassing any stale edge cache permanently.

### Database migrations applied
None.

### Rollback plan
Revert the `?t=` line in `src/pages/EmbedMap.jsx` — embeds fall back to CDN-cached snapshots (which may be stale after a publish until cache naturally expires).

### Verified on staging
- [x] Map title now appears in published embed after enabling the toggle and publishing

---

## 2026-05-30 — Production

**Branch/commit:** `main` | `ca8b42c`
**Deployed by:** Claude Code

### What changed
- **Disabled CDN caching on snapshot uploads.** Changed `x-cache-control` from `max-age=0, s-maxage=31536000` to `max-age=0, s-maxage=0, must-revalidate` in `generate_map_snapshot` so future snapshot uploads are not cached by Vercel Blob's CDN edge nodes. Deployed to both staging (`beqejxneehilplrtpntn`) and production (`gxixwdjfmegxcxfeflro`) Edge Function projects.

### Database migrations applied
None.

### Rollback plan
Redeploy the previous version of `generate_map_snapshot` to both Supabase projects.

### Verified on staging
- [x] Edge Function deployed successfully to staging and production

---

## 2026-05-30 — Staging

**Branch/commit:** `fix/2026-05-30-map-title-missing-in-embed`
**Deployed by:** Claude Code

### What changed
- **Fixed map title not appearing in published embed views.** When a map had "Show map title" enabled, the title appeared correctly in the design-view preview (which reads directly from draft state) but was invisible in the published embed. The root cause: `buildPublicationConfig` never included the map `name` in the snapshot it writes to `map_publications`. When the embed loads from the CDN static snapshot, it builds the map object entirely from the published config — so `map.name` was always empty, and `PublishedMapView` requires both `showMapTitle` and a non-empty `mapName` to render the title. Fix: `name` is now included in the `map` object inside `buildPublicationConfig`, and both `AdminMapDashboard` and `ClientMapDashboard` pass it in. Maps republished after this deploy will show the title correctly in embeds.

### Database migrations applied
None.

### Rollback plan
Revert `src/lib/mapPublication.js`, `src/pages/admin/AdminMapDashboard.jsx`, `src/pages/client/ClientMapDashboard.jsx`. Existing published configs are unaffected; the fix only applies to configs written at publish time after this deploy.

### Verified on staging
- [ ] Feature smoke-tested on the Preview/staging URL
- [ ] Map title visible in published embed after republishing

### Issues / notes
Maps published before this fix will still have no `name` in their snapshot config. They need to be republished once to populate the name.

---

## 2026-05-30 — Staging

**Branch/commit:** `fix/2026-05-30-map-controls`
**Deployed by:** Claude Code

### What changed
- **Removed "Locate me" button from map controls.** The ◎ locate-me button has been removed from the zoom slider control panel in all map views (embedded, public, design). Only fullscreen, +, slider, and − remain.
- **Fixed fullscreen hiding the list panel, title, and search.** When the map was expanded to fullscreen (pseudo-fullscreen fallback), only the inner Google Maps canvas was fullscreened, leaving the list panel, map title, and search box behind at their original position. The fullscreen now targets the `PublishedMapView` root container (via a `data-map-fullscreen-root` attribute) so that the list panel is included inside the fullscreen view.
- **Fixed map controls blocked in design/panels/groups/mapstyle views (admin and client).** A semi-transparent backdrop overlay (z-index 5) was sitting above the map whenever a settings panel was open, intercepting all clicks including the zoom slider, fullscreen, and +/− buttons. The backdrop is now `pointer-events: none` so map controls work while the panel is open. The close button (×) on the panel is the way to dismiss it.

### Database migrations applied
None.

### Rollback plan
Revert `src/components/DirectoryMap.jsx`, `src/components/PublishedMapView.jsx`, `src/pages/admin/AdminMapDashboard.jsx`, `src/pages/client/ClientMapDashboard.jsx`, `src/pages/admin/admin.css`, and `src/style.css`.

### Verified on staging
- [ ] Feature smoke-tested on the Preview/staging URL
- [ ] No console errors or broken pages observed

---

## 2026-05-30 — Staging

**Branch/commit:** `feat/2026-05-30-map-title-general-settings-tidy`
**Deployed by:** Claude Code

### What changed
- **Show map title toggle in client portal General tab.** The "Show map title" checkbox was present in the admin map General tab but missing from the client portal equivalent. It is now shown in the Display section alongside "Show list panel" and "Enable clustering", giving clients control over whether the map title appears on their embed.
- **Removed delete map button from client portal General tab.** The "Danger zone" section containing the delete map button has been removed from the client portal General tab. Map deletion is an admin-only operation.

### Database migrations applied
None.

### Rollback plan
Revert `src/pages/client/ClientMapDashboard.jsx` to the previous commit.

### Verified on staging
- [ ] Feature smoke-tested on the Preview/staging URL
- [ ] No console errors or broken pages observed

### Issues / notes
None.

---

## 2026-05-30 — Production

**Branch/commit:** `main` | `9cc9a9e`
**Deployed by:** Claude Code

### What changed
- **Co-located pin spiderfy.** When two or more listings share the same address, clicking their cluster now fans the pins out in a circle with thin connecting legs so each one is individually clickable. At zoom < 17 the cluster zooms to level 17 first then auto-fans; at zoom ≥ 17 it fans immediately. Clicking the map, zooming, or selecting a listing collapses the spider. Works with clustering on or off.
- **Pin style previews match map size.** The pin style selector grid in Pin Design now renders each option at its true proportional size (using `MARKER_ANCHORS` dimensions) so what you see in the preview matches what appears on the map.
- **Group colour legend in search panel.** A small rounded square showing each group's marker colour (with border colour as an outline) appears right-aligned next to each group name in the embedded search/list panel.
- **Search panel checkbox fix.** Clicking the show/hide checkbox for a group no longer also expands or collapses the group's listing list.
- **Group edit drawer redesign.** The per-group design drawer now uses the same `panel-section` layout as Pin Design — sections for Style, Colours, and Icon, with consistent grey-box grouping and spacing.
- **Drop shadow inheritance.** Group design overrides no longer have their own drop shadow controls; they inherit the global drop shadow configured in Pin Design.
- **Search panel dividers and gradient.** Subtle divider lines now separate each group/category in the search panel. When a group's listings are revealed, a 20 px dark gradient fades in at the top.
- **Pin z-index above clusters.** Individual pins render at z-index 2000; cluster bubbles at z-index 3000+. Clusters sit on top for correct click handling.
- **Zoom level indicator.** Admin and client map designers now show a small "zoom N" badge at the bottom-left of the map for debugging. Hidden on the public embed.
- **Dot pin shadow fix.** The dot-style pin SVG canvas was widened to 48×44 px to prevent the drop shadow ellipse from clipping horizontally.

### Database migrations applied
None.

### Rollback plan
No database changes. Frontend rollback: redeploy the previous Vercel build (`5cd5a04`) or `git revert 9cc9a9e`.

### Verified on staging
- [x] No migrations — not applicable
- [x] Feature smoke-tested on the production URL
- [ ] No console errors or broken pages observed

### Issues / notes
The spiderfy implementation went through several iterations to resolve: stale click-listener accumulation (fixed with `clearListeners` before re-adding), cluster markers hiding individual markers when managed by MarkerClusterer (fixed by temporarily removing markers from clusterer during fan-out and re-adding on collapse), and the zoom-then-fan sequencing (achieved with a one-shot `idle` listener).

---

## 2026-05-30 — Production

**Branch/commit:** `main` | `9cc9a9e`
**Deployed by:** Claude Code

### What changed
- **Co-located pin spiderfy.** When two or more listings share the same address, clicking their cluster now fans the pins out in a circle with thin connecting legs so each one is individually clickable. At zoom < 17 the cluster zooms to level 17 first then auto-fans; at zoom ≥ 17 it fans immediately. Clicking the map, zooming, or selecting a listing collapses the spider. Works with clustering on or off.
- **Pin style previews match map size.** The pin style selector grid in Pin Design now renders each option at its true proportional size (using `MARKER_ANCHORS` dimensions) so what you see in the preview matches what appears on the map.
- **Group colour legend in search panel.** A small rounded square showing each group's marker colour (with border colour as an outline) appears right-aligned next to each group name in the embedded search/list panel.
- **Search panel checkbox fix.** Clicking the show/hide checkbox for a group no longer also expands or collapses the group's listing list.
- **Group edit drawer redesign.** The per-group design drawer now uses the same `panel-section` layout as Pin Design — sections for Style, Colours, and Icon, with consistent grey-box grouping and spacing.
- **Drop shadow inheritance.** Group design overrides no longer have their own drop shadow controls; they inherit the global drop shadow configured in Pin Design.
- **Search panel dividers and gradient.** Subtle divider lines now separate each group/category in the search panel. When a group's listings are revealed, a 20 px dark gradient fades in at the top.
- **Pin z-index above clusters.** Individual pins render at z-index 2000; cluster bubbles at z-index 3000+. Clusters sit on top for correct click handling.
- **Zoom level indicator.** Admin and client map designers now show a small "zoom N" badge at the bottom-left of the map for debugging. Hidden on the public embed.
- **Dot pin shadow fix.** The dot-style pin SVG canvas was widened to 48×44 px to prevent the drop shadow ellipse from clipping horizontally.

### Database migrations applied
None.

### Rollback plan
No database changes. Frontend rollback: redeploy the previous Vercel build (`5cd5a04`) or `git revert 9cc9a9e`.

### Verified on staging
- [x] No migrations — not applicable
- [x] Feature smoke-tested on the production URL
- [ ] No console errors or broken pages observed

### Issues / notes
The spiderfy implementation went through several iterations to resolve: stale click-listener accumulation (fixed with `clearListeners` before re-adding), cluster markers hiding individual markers when managed by MarkerClusterer (fixed by temporarily removing markers from clusterer during fan-out and re-adding on collapse), and the zoom-then-fan sequencing (achieved with a one-shot `idle` listener).

---

## 2026-05-30 — Production

**Branch/commit:** `feat/2026-05-30-map-title-general-settings-tidy`
**Deployed by:** Claude Code

### What changed
- **Show map title option added.** General settings now includes a "Show map title" toggle. When on, the map's name appears above the search bar inside the list panel on the published embed. Stored in `theme_json.showMapTitle`; flows through to `buildPublicationConfig`, EmbedMap, and both admin/client dashboards.
- **General settings tab restructured.** The flat form is now grouped into three `panel-section` boxes matching the Pin Design tab style: "Map details" (name, slug), "Default view" (centre, zoom), and "Display" (list panel, map title, clustering). The Save and Delete buttons are removed — the tab now auto-saves like all other design tabs, with a "✓ Draft saved" indicator.
- **Publish button moved to top nav bar.** "Publish Map" is removed from the admin sidebar and now appears as a "Publish" button in the admin top navigation bar (between Data and the right actions), matching client portal behaviour. The button turns amber when unpublished draft changes exist. Wired via `MapDraftContext.Provider` wrapping the admin dashboard.

### Database migrations applied
None. `showMapTitle` is stored inside the existing `theme_json` jsonb column — no schema change required.

### Rollback plan
No database changes. Frontend rollback: revert to previous Vercel build or revert the branch.

### Verified on staging
- [x] No migrations — not applicable
- [ ] Feature smoke-tested on the production URL
- [ ] No console errors or broken pages observed

### Issues / notes
None expected. `showMapTitle` defaults to `false` so all existing maps are unaffected.

---

## 2026-05-29 — Production

**Branch/commit:** `main` | _(current working session)_
**Deployed by:** Claude Code

### What changed
- **Map settings panel — "Groups & Content" section renamed to "Groups"** — the tab/section label was updated in both the admin and client map dashboards.
- **Group design editor — cluster colour option removed** — when editing a group's pin design, the "Cluster colour" colour picker is no longer shown. Cluster colour remains configurable at the global map level.

### Database migrations applied
None.

### Rollback plan
Revert the two label changes in `AdminMapDashboard.jsx` and `ClientMapDashboard.jsx` and redeploy.

### Issues / notes
None.

## 2026-05-31 — Staging

**Branch/commit:** `feat/2026-05-28-static-map-snapshots` | _(current working session)_
**Deployed by:** Claude Code

### What changed
- **Static map snapshots** — on every publish, a new `generate_map_snapshot` Edge Function builds a self-contained JSON bundle (map config + all listings + groups) and uploads it to Vercel Blob at a deterministic path: `maps/<map_id>/snapshot.json`. The embed now tries this CDN URL first (3 s timeout); if it loads, Supabase is not queried at all for display data. If the snapshot is missing or times out, the embed falls back to the existing live Supabase queries — no change in behaviour for unpublished maps or maps without a snapshot yet.
- **Why**: protect published maps from database outages and data disasters. Even if Supabase is completely down, visitor-facing embeds continue to render from the CDN copy. Contact forms and engagement analytics still require Supabase and degrade gracefully.
- **`generate_map_snapshot` Edge Function** — accepts `{ map_id }` (one map) or `{ all: true }` (all published maps, for nightly cron). Uploads JSON to Vercel Blob, writes `snapshot_url` and `snapshot_generated_at` back to `maps`.
- **Publish flow wired** — both `ClientMapDashboard` and `AdminMapDashboard` call the Edge Function fire-and-forget after a successful publish. Does not block the publish UX.
- **Migration** — `20260531120000_add_maps_snapshot_url.sql` adds `snapshot_url text` and `snapshot_generated_at timestamptz` (both nullable) to `maps`.
- **Env var** — `VITE_SNAPSHOT_BASE_URL` (Vite/Vercel env, public): base URL of the Vercel Blob store. `BLOB_READ_WRITE_TOKEN` (Supabase Edge Function secret only): write token for blob uploads.

### Database migrations applied
- `20260531120000_add_maps_snapshot_url.sql`

### Rollback plan
- Run `20260531120000_add_maps_snapshot_url.rollback.sql` to drop the two columns.
- Remove `VITE_SNAPSHOT_BASE_URL` from Vercel env and redeploy, or revert `EmbedMap.jsx` — the fallback path is identical to the previous behaviour, so removing the snapshot URL simply means every embed falls through to Supabase as before.

### Verified on staging
- [ ] Dry-run passed for all migrations
- [ ] Migrations applied and verified (row counts unchanged, RLS intact)
- [ ] Feature smoke-tested on the Preview/staging URL
- [ ] No console errors or broken pages observed

### Issues / notes
- Existing published maps will not have a snapshot until the next publish (or until a manual `{ all: true }` call to the Edge Function). During the transition window those maps continue to use live Supabase queries.
- Vercel Blob must be enabled on the Vercel project before deploying. `BLOB_READ_WRITE_TOKEN` must be added to Supabase Edge Function secrets (Dashboard → Edge Functions → Secrets).
- Nightly cron to call `{ all: true }` is not yet wired — recommended next step.

---

## 2026-05-28 — Staging

**Branch/commit:** `main` | _(current working session)_
**Deployed by:** Claude Code

### What changed
- **BETA homepage** — `src/pages/PublicMap.jsx` completely rewritten. The old generic "Directory Maps" page is replaced with a BETA-positioning page: animated "Now in BETA" badge, new hero ("Beautiful map directories, built for your business"), two mailto CTAs ("Enquire now" → `info@layercake-cx.biz` and "Become a BETA user"), three pillar cards (Highly customisable / Connect your data / Publish anywhere), and a 7-item feature checklist with teal tick circles.
- **Pricing and Sign up removed from header nav** — `src/components/SiteHeader.jsx` updated: the Pricing link and the Sign up button are no longer shown to logged-out visitors. Only "Log in" appears. The `/pricing` and `/signup` routes still exist and remain accessible directly; they are just not linked from the nav.
- **New CSS classes added** — `src/style.css` extended with `.beta-badge`, `.beta-badge__dot` (with pulsing keyframe), `.landing__ctas`, `.landing__ctaSecondary`, `.landing__pillars`, `.pillar`, `.pillar__icon`, `.pillar__title`, `.pillar__desc`, `.landing__featuresLabel`, `.feature-list`, `.feature-list__item`, `.feature-list__check`, `.feature-list__text`, and a responsive breakpoint collapsing pillars to single-column below 560 px.

### Database migrations applied
None

### Rollback plan
No database changes. Frontend rollback: revert the three changed files (`src/pages/PublicMap.jsx`, `src/components/SiteHeader.jsx`, `src/style.css`) or redeploy the previous Vercel build.

### Verified on staging
- [ ] Dry-run passed for all migrations
- [x] No migrations — not applicable
- [ ] Feature smoke-tested on the Preview/staging URL
- [ ] No console errors or broken pages observed

### Issues / notes
The `/pricing` and `/signup` routes are intentionally kept — they will be revisited when BETA opens more broadly. Direct links to those pages continue to work.

---

## 2026-05-28 — Staging

**Branch/commit:** `main` | _(current working session)_
**Deployed by:** Claude Code

### What changed
- **Rounded Pin shape corrected.** The "teardrop" pin style (renamed Rounded Pin) was using the old sharp-tipped teardrop path. Replaced with the correct SVG shape from the design asset: a circle head (r=13, centre 16,14) joined to a quadratic-bezier U-tail. The rounded bottom sits at group y=31.
- **White spot removed from Rounded Pin.** Cursor had added a white circle element as a favicon background inside the pin head. Removed it — the favicon image now clips directly onto the pin colour with no white backing.
- **Map pin anchor updated.** The Google Maps anchor point for the Rounded Pin was updated from SVG natural y=54 (old sharp tip) to y=39 (new rounded tail tip), so the pin points to the correct map coordinate.
- **Drop Shadow panel added to Pin Design drawer.** Both Admin and Client dashboards now have a standalone "Drop Shadow" panel (below Colours) with three controls: Size, Distance from pin, and Transparency. Previously Size was buried in the Colours panel; Distance and Transparency did not exist.
- **Drop shadow settings persisted.** `pinShadowDistance` and `pinShadowOpacity` are saved to theme JSON and loaded back on both dashboards, and flow through to the map preview and the embed.
- **Listing panel address display fixed.** Full address (address + postcode + country) now shows as plain text. Previously only the `address` field showed and it was a clickable map link.
- **Favicon size maximised on pin heads.** The icon placed inside pin and teardrop heads was increased to fill the available circle area.
- **Drop shadow clipping fixed.** The bottom edge of pin drop shadows was clipped straight. The SVG canvas was expanded (height 70→98) and the shadow Y-clamp corrected to account for the `translate(8,8)` group transform.
- **Shadow repositioned.** Default shadow offset increased from 10 to 20 SVG units so the pin tip sits closer to the centre of the shadow ellipse.
- **Rounded Pin label.** The "Teardrop" label in both Admin and Client dashboards was renamed to "Rounded Pin" to match the product intent.

### Database migrations applied
None

### Rollback plan
No database changes. Frontend rollback: revert commits or redeploy the previous Vercel build.

### Verified on staging
- [ ] Dry-run passed for all migrations
- [x] No migrations — not applicable
- [ ] Feature smoke-tested on the Preview/staging URL
- [ ] No console errors or broken pages observed

### Issues / notes
Shape and anchor changes to the Rounded Pin only affect the "teardrop" style key. The "pin" style is unchanged. Existing maps using the teardrop style will see the corrected shape on next load without any data migration.

---
