# Directory listing: card layout — feature spec

**Status:** built 2026-11-15 on `feat/2026-11-15-directory-card-layout` (see §14 for where the build differs from this spec) · **Author:** Damian Watson, drafted with Claude · **Date:** 2026-11-15
**Design reference:** Proper Produce brand canvas, the "Directory home" artboard (card grid of suppliers).
**Epic:** DIR-E3 (white-labelling / branding). Update `docs/DIRECTORIES.md` §8 DIR-E3 with a new story when this ships.

> Before you start: read `AGENTS.md` in full (git workflow, docs, deployment log, events). This spec does **not** need a database migration.

---

## 1. Summary

Published directory home pages show entries as one vertical list (`.dir-row`). Add a second **listing layout, "Cards"**: a responsive grid of panels, each with a coloured category stripe, a category badge, the entry name, its location and a "View details →" prompt. The directory owner picks List or Cards in **Look & feel**. List stays the default, so no existing directory changes until someone opts in.

## 2. What exists today (checked against `main`, 2026-11-15)

| Thing | Where | Notes |
|---|---|---|
| Row markup | `supabase/functions/generate_directory_site/builders.ts`, `buildDirectoryLandingPage()` (≈ line 4040–4085) | `<a class="dir-row" data-entry-id data-search data-term-ids [data-lat data-lng]>` → `.dir-row__logo` + `.dir-row__body` (h3, `.dir-row__desc`, `.dir-row__miles`, `.dir-row__meta`, `.dir-row__tags`, `.dir-row__why`) |
| Row containers | same file ≈ line 4178–4183 | `#dir-rows` (main results) and `#dir-also-rows` (secondary matches), both `.dir-rows` |
| Row CSS | `LAYOUT_STYLE` in the same file | `.dir-rows`, `.dir-row*`; desktop puts results at 66% beside the map |
| Client-side search/filter/distance | inline script in the same file (`rowsWrap = document.getElementById('dir-rows')`, `rowTermIds(row)`, `.dir-row__miles`, `.dir-row__why`) | Works purely off the row's data attributes and those child classes |
| Term colour | `category_terms.color` (nullable text), created in `20260714130000_create_categorisations.sql` | **Already editable** in `src/components/directories/CategorisationsPanel.jsx` (colour picker per term) but **not loaded** by the site generator: `generate_directory_site/index.ts` ≈ line 416 selects `category_terms(id, categorisation_id, label, slug, sort_order, …)` without `color`, and `CategorisationTerm` has no `color` field |
| Theme storage | `directories.theme_json` (flat jsonb), typed as `DirectoryTheme` in `builders.ts`, field list mirrored in `src/lib/directoryThemePresets.js` | New keys go here, no migration needed |
| Look & feel editor | `src/components/experience/LookAndFeelPage.jsx` (`TAB_GROUPS`), preview `SitePreview.jsx` | Saves `theme_json` and records `directory_branding_updated` |

## 3. Card anatomy

Top to bottom, inside one `<a>` (the whole card is the link):

1. **Stripe**: 6px full-width bar in the entry's category colour (see §5). Decorative.
2. **Logo band** (optional): only when the entry has `panel_image_url` or `logo_url`. 120px tall, background `panel_background_color` or `var(--surface-2)`, image centred and contained with a 20px inset. Same image rules as `.dir-row__logo` today.
3. **Badge**: the entry's term label from the colour categorisation (or, if none, the first `single_select` term), using the existing `.badge` class (`--sage` / `--sage-ink`). Omit if there is no term.
4. **Name**: `<h3>`, heading font, `calc(var(--fs-h3) * 0.8)` (about 24px at defaults), line-height 1.1, letter-spacing -0.015em, colour `var(--ink)`.
5. **Location**: inline stroke pin icon (15px, `aria-hidden="true"`) plus the same location string the row uses (respects `show_address`). Omit when empty. Colour `var(--muted)`, 14px.
6. **Distance**: keep `<span class="dir-row__miles" hidden>` when location search is on (the existing script fills and reveals it).
7. **Summary** (optional, off by default): `meta_description` clamped to 3 lines. Controlled by `cardShowSummary`.
8. **Tags**: keep `.dir-row__tags` (max 3, as now) but only when `cardShowSummary` is on, so the default card stays as clean as the mockup.
9. **"Why this matched"**: keep `<p class="dir-row__why" hidden>` (AI search fills it).
10. **Prompt**: pinned to the bottom (`margin-top: auto`): `cardCtaLabel` + " →", 14px, weight 700, `var(--primary)`. Use a `<span>`, because the card is already the link.

The mockup values map to theme variables; **do not hard-code Proper Produce colours**. Every preset (Natural, Midnight, Coastal, Heritage, Slate, saved presets) must look right.

## 4. Markup and CSS

Keep the row's root element and data attributes **identical** so the search/filter/distance/AI script keeps working unchanged. Only add modifier classes.

```html
<!-- container: add the modifier to BOTH #dir-rows and #dir-also-rows -->
<div class="dir-rows dir-rows--cards" id="dir-rows">

<a class="dir-row dir-row--card" href="…" data-entry-id="…" data-search="…" data-term-ids="…" data-lat="…" data-lng="…"
   style="--card-stripe:#3E6A2C">
  <span class="dir-card__stripe" aria-hidden="true"></span>
  <!-- optional --> <div class="dir-card__logo" style="background:…"><img src="…" alt="… logo" loading="lazy"></div>
  <div class="dir-card__body">
    <span class="badge">Vegetable boxes</span>
    <h3>Tolhurst Organic</h3>
    <p class="dir-card__loc"><svg …pin… aria-hidden="true"></svg>Oxfordshire</p>
    <span class="dir-row__miles" hidden></span>
    <!-- if cardShowSummary --> <p class="dir-row__desc">…</p><div class="dir-row__tags">…</div>
    <p class="dir-row__why" hidden></p>
    <span class="dir-card__cta">View details →</span>
  </div>
</a>
```

```css
.dir-rows--cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px;
  border: 0; border-radius: 0; background: transparent; overflow: visible; }
.dir-row--card { flex-direction: column; background: var(--surface); border: 1px solid var(--line);
  border-radius: 16px; overflow: hidden; }
.dir-row--card:last-child { border-bottom: 1px solid var(--line); }
.dir-row--card:hover { background: var(--surface); border-color: var(--card-stripe, var(--primary));
  box-shadow: 0 10px 24px -16px rgba(0,0,0,.35); }
.dir-card__stripe { display: block; height: 6px; background: var(--card-stripe, var(--primary)); }
.dir-card__logo { position: relative; height: 120px; background: var(--surface-2); }
.dir-card__logo img { position: absolute; inset: 20px; width: calc(100% - 40px); height: calc(100% - 40px); object-fit: contain; }
.dir-card__body { flex: 1; display: flex; flex-direction: column; gap: 12px; padding: 20px 22px 22px; }
.dir-card__body .badge { align-self: flex-start; }
.dir-card__body h3 { margin: 0; font-size: calc(var(--fs-h3) * 0.8); line-height: 1.1; letter-spacing: -0.015em; color: var(--ink); }
.dir-card__loc { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--muted); }
.dir-card__body .dir-row__desc { margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.dir-card__cta { margin-top: auto; padding-top: 6px; font-size: 14px; font-weight: 700; color: var(--primary); }
```

Check every existing `.dir-row` rule (e.g. `.dir-row:last-child { border-bottom: 0 }`, `.dir-row:hover`, the 901px+ `.dir-row__logo` width) so none leaks into card mode, and check any JS that toggles `display` on rows: hidden cards must leave no grid gaps (`hidden` / `display:none` on a grid item is fine; inline `display:flex` re-shows must not break the grid).

**Columns:** with a map attached, desktop results are 66% wide, so the grid gives 2 columns at typical widths; with no map, 3–4. Under 640px, 1 column. No extra breakpoints needed.

**Order:** the DOM order of cards must stay exactly the row order (relevance/A–Z/distance re-ordering in the script moves the same elements).

## 5. Stripe colour resolution

New theme key `cardColourBy`: a categorisation **key** (`categorisations.key`) or `null`.

1. If `cardColourBy` is set and the entry has a term in that categorisation whose `color` is a valid hex → use that colour.
2. Else if `cardColourBy` is unset (`undefined`, not `null`): auto-pick the first `single_select` categorisation on the directory that has at least one coloured term, then apply rule 1.
3. Otherwise → no inline variable, so the stripe falls back to `var(--primary)`.
`null` means "no category colours": every stripe is the primary colour.

Validate colours with `sanitizeHexColor()` (already in `builders.ts`, ≈ line 775) before writing them into a `style` attribute: `escapeAttr` alone is not enough.

**Generator change:** add `color` to the `category_terms(...)` embed in `generate_directory_site/index.ts`, to `CategorisationTerm` / `TermEmbed`, and to `TermMeta` in `buildTermMetaIndex()`.

**Filter dots (same release, small):** when card mode is on, filter options for the colour categorisation show a 9px dot in the term colour before the label (chips and `.dir-msel__option`), so the stripe colours have a key. Dots are `aria-hidden`; the label carries the meaning.

## 6. Settings (stored in `directories.theme_json`)

| Key | Type | Default (unset) | Meaning |
|---|---|---|---|
| `listingLayout` | `"list" \| "cards"` | `"list"` | Which layout the home page renders |
| `cardColourBy` | `string \| null` | auto (§5) | Categorisation key that drives stripe colour and badge |
| `cardShowSummary` | `boolean` | `false` | Show summary and tags on cards |
| `cardCtaLabel` | `string` (≤ 30 chars, trimmed) | `"View details"` | Bottom prompt text, rendered escaped with " →" appended |

- Add all four to `DirectoryTheme` in `builders.ts` and to the field-reference comment in `src/lib/directoryThemePresets.js` (keep them in sync by hand, as the comments there require).
- Built-in presets **do not** set these keys, so applying a preset never flips the layout. Saved org presets copy `theme_json` whole, so they carry the keys (that's fine and expected).
- Unknown or invalid values fall back to the default silently.

## 7. Look & feel editor

In `LookAndFeelPage.jsx`, add a **"Listings"** tab to the "Page areas" group (`["listings", "Listings"]`, after Hero banner):

- **Layout:** segmented control, List / Cards.
- When Cards is selected:
  - **Colour cards by:** select listing the directory's categorisations (by label) plus "Don't colour (use primary colour)". Default shows "Automatic". If the chosen categorisation has no coloured terms, show a helper line linking to Categories ("Give its terms colours in Categories to see them here").
  - **Show summary on cards:** switch.
  - **Button text:** text input, placeholder "View details", max 30.
- `SitePreview.jsx`: when `listingLayout === "cards"`, the body area of the mini mock shows a 2×2 grid of small cards (stripe + two text lines) instead of rows.
- Saving uses the existing save path, so `directory_branding_updated` fires. Make sure its payload's changed-fields list includes the new keys (see `AGENTS.md` admin event rules). No new admin event name is needed.
- Respect `canManage` / `RequireManage` exactly as the other tabs do.

## 8. Events and analytics

Cards are links to the entry page, like rows, so **no new visitor action** is introduced. Confirm the existing entry-click tracking (if any is attached via `data-entry-id` / row click handlers) fires identically for `.dir-row--card`. No `map_engagement_events` check-constraint change is required. State this explicitly in the PR description, given the CLAUDE.md rule.

## 9. Accessibility

- One link per card; the `<h3>` gives screen readers the entry name. The link's accessible name must not be the whole card text read twice: no `aria-label` override, and decorative pieces (stripe, pin, arrow) `aria-hidden`.
- The badge text must meet 4.5:1 on `--sage` (already true for shipped presets; don't change the badge colours).
- Visible `:focus-visible` outline on the card (the existing global rule covers `a`), and the outline must not be clipped by `overflow: hidden` (use `outline-offset: 3px` on the card or move overflow clipping to the stripe/logo).
- Hover is not the only state change; the card is fully usable by keyboard and touch (card height ≥ 44px trivially).

## 10. Tests

Add `supabase/functions/generate_directory_site/cardLayout_test.ts` (Deno, same style as `claimBanner_test.ts`):

1. `listingLayout` unset → landing HTML is **byte-identical** to today for a fixture directory (guards against regressions).
2. `listingLayout: "cards"` → container has `dir-rows--cards` on both `#dir-rows` and `#dir-also-rows`; each entry renders `class="dir-row dir-row--card"` with the same `data-entry-id`, `data-search`, `data-term-ids` (and `data-lat/lng` when location search is on) as list mode.
3. Stripe colour: explicit `cardColourBy`, auto-pick, `null`, term without colour, and an invalid colour string (must not reach the `style` attribute).
4. `cardCtaLabel` is escaped and truncated to 30 characters; default "View details".
5. `show_address: false` → no location line.
6. `cardShowSummary` on/off toggles `.dir-row__desc` and `.dir-row__tags`.

Manual: on staging, publish a directory in each built-in preset with cards on; check search, facet filters, distance sort, AI search "why" lines and the list/map toggle on mobile (≤640px), tablet (641–900) and desktop.

## 11. Documentation (same PR)

- `docs/USER_GUIDE.md`: Look & feel → new "Listings" tab section (what each setting does, and that term colours come from Categories).
- `docs/DIRECTORIES.md`: new DIR-E3 story ("As an owner I can show my directory's entries as cards…") and add the four keys to §4.6.
- `docs/DEPLOYMENTS.md`: entry for the staging and production deploys of `generate_directory_site` and the frontend.

## 12. Acceptance criteria

- [ ] Existing directories render exactly as before (List) until an owner chooses Cards.
- [ ] Choosing Cards and republishing shows the grid; search, filters, distance, AI search and the map all behave as in list mode.
- [ ] Stripe colours follow §5, including the fallbacks; term colours set in Categories appear after republishing.
- [ ] Works with every built-in preset and with custom fonts/sizes (no hard-coded colours or font sizes).
- [ ] Look & feel "Listings" tab saves and previews the four settings; the change is recorded via `directory_branding_updated`.
- [ ] Keyboard and screen-reader behaviour per §9.
- [ ] Tests in §10 pass; docs in §11 updated.

## 13. Out of scope

- Per-card images other than the existing panel image/logo (e.g. a photo-led card).
- Card layout on the map's own listing panel or embeds (this is the published directory home page only).
- Drag-to-order cards, featured or sponsored cards.
- A per-directory entity noun ("supplier", "member"); the button text setting covers the mockup's "View supplier" for now.

## 14. As built (2026-11-15)

Where the implementation differs from, or settles, the text above:

- **Filter dots on single_select:** a native `<select>` option can't hold a dot, so for a `single_select` colour categorisation (the usual auto-pick) the dot appears on the active-filter chip above the results. `multi_select` options in the dropdown panel show the dot as specified. Both only in card mode.
- **No-map width:** at 901px+ the results column was 66% wide even with no map, which gave 2 columns. In card mode with no map attached it now uses the full width (`.dir-results--full`), giving the 3–4 columns §4 expects. List mode is unchanged.
- **Badge fallback:** when `cardColourBy` names a categorisation the entry has no term in (or is `null`), the badge falls back to the entry's first `single_select` term, as in list mode's aside.
- **`directory_branding_updated`:** it had no changed-fields list, so one was added (`changed_fields`, plus `listing_layout`); AGENTS.md's catalogue is updated.
- **Editor persistence:** `themeFromDirectory()` only copied known keys, so the four keys would have been dropped on load and wiped by the next save. `cardKeysFrom()` in `directoryThemeDraft.js` now carries them through load and save.
- **Preview:** list mode now shows stacked rows in the mini mock (it previously showed two tiles regardless), cards mode a 2×2 striped grid using the chosen categorisation's colours.
- **Golden test:** `testdata/landing_list_golden.html` was generated on `main` before the change (`cardLayout_fixture.ts`), so test 1 is a true byte comparison.

