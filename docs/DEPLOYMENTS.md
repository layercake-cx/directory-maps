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
