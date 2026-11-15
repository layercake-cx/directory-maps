# Discover by Layercake: rebrand, heading font and top bar clean-up

**Standalone brief for Claude Code. One branch, one PR.** The Discover UI rollout (`BUILD_BRIEF.md`, phases 1–7) is complete and merged. This brief applies four follow-up decisions on top of it. Where this brief and `BUILD_BRIEF.md` / `README.md` disagree, this brief wins.

Decisions (Damian, 2026-11-14):

1. **Heading font is Schibsted Grotesk**, replacing Bricolage Grotesque.
2. **The top bar loses the global search field and the help/support icon.**
3. **The admin is rebranded to "Discover by Layercake"**: new logo in the top bar, new favicon and app icon, product name in admin copy and the browser tab.
4. The logo is final at v2: "discover" in Fredoka SemiBold with the orange spark as the dot of the i, "by Layercake" in Poppins Medium, supplied as outlined SVG.

Visual references: `reference/04-logo-discover-by-layercake.html` (logo and usage), `reference/05-heading-font-options.html` (Option B is the chosen font), and the templates `reference/10-…` to `13-…` (top bar with the new logo and no search/help).

---

## 0. Before you start

1. Read `AGENTS.md` and run its opening checks (open branches/PRs). Then branch from `main`: `feat/<date>-discover-rebrand`.
2. Run `scripts/check-ui.sh` and `npm run build` on `main` first, and note the results so the PR can show nothing regressed.
3. Take "before" screenshots at 1440px of: client Home, a directory Overview, an entry editor, Publishing, platform Customers, and the top bar at 1024px and 390px.

Ground rules (same as the rollout): presentation only; no database migrations, no Edge Function changes or deploys, no new dependencies, no route or permission changes. Out of scope unless listed below: published directory sites and their generator, public/embedded maps, marketing pages (`Pricing`, `SiteHeader`, `SiteFooter`, `BrandLogo`), and outgoing emails. Those get BACKLOG entries (§6), not changes.

---

## 1. Heading font: Schibsted Grotesk

**Files:** `index.html`, `src/styles/admin-shell-tokens.css`, `docs/FRONTEND_ARCHITECTURE.md` (UI system section), `docs/design/discover-ui/tokens.css` is already updated.

1. `index.html`: in the Google Fonts `<link>`, replace `family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800` with `family=Schibsted+Grotesk:wght@600;700;800`. Keep the Public Sans part and `display=swap`. Keep the existing `preconnect` tags (add them if missing: `fonts.googleapis.com` and `fonts.gstatic.com` with `crossorigin`).
2. `src/styles/admin-shell-tokens.css` (Type group):
   ```css
   --font-display: "Schibsted Grotesk", "Public Sans", system-ui, sans-serif; /* was Bricolage Grotesque (changed 2026-11-14) */
   --fw-display: 700;            /* page titles, card titles, panel title */
   --fw-display-strong: 800;     /* stat numbers only */
   --tracking-display: -0.015em; /* slight tightening at 22px+ */
   ```
   If a `--font-display-settings` token or any `font-variation-settings` / `opsz` rule was added for Bricolage, set it to `normal` or remove it.
3. Search the whole of `src/` for `Bricolage` and `opsz`; there must be no matches afterwards.
4. Check the Mantine theme in `src/main.jsx` (and `src/components/ui/mantine.js`): headings must use `var(--font-display)`, not a family name.
5. Fit checks (Schibsted is a little wider than Bricolage): the feature panel title (`--panel-w` 272px) must still truncate cleanly with ellipsis and a `title` attribute; PageHead titles must wrap without overlapping actions at 1024px; stat tiles must not overflow at 1280px with five-digit numbers; the JobCard title must not collide with the elapsed timer.

---

## 2. Top bar: remove search and help

**Files:** `src/components/shell/TopBar.jsx`, `src/styles/admin-shell.css`, `src/styles/discover-ui.css`, `src/components/icons/shellIcons.jsx`, `src/components/ui/icons.jsx`, `docs/USER_GUIDE.md` if it mentions either.

1. In `TopBar.jsx`, delete the `.topbar-search` block (the disabled placeholder input) and the `.topbar-icon` "Support and documentation" link. Remove `SearchIcon` and `SupportIcon` from its imports. Update the JSDoc comment to the new contents.
2. Final top bar order, left to right: Menu button (below 1024px, when a panel exists) · logo · divider · WorkspaceSwitcher · Staff view chip (staff in client context) · spacer · TaskIndicator · AskPipButton · AvatarMenu.
3. CSS: delete `.shell .topbar-search*` and `.shell .topbar-icon` rules in `admin-shell.css` (and the platform-context variants), and the `.topbar-search` lines in `discover-ui.css` media queries. Remove `.topbar-icon` from the shared focus-visible selector in `discover-ui.css`.
4. Icons: keep `SearchIcon` (WorkspaceSwitcher uses it). Remove `SupportIcon` from `shellIcons.jsx` and from the re-export in `ui/icons.jsx` if nothing else imports it (grep first).
5. Do **not** add a replacement help item to the avatar menu: there is no real help URL yet. Add a BACKLOG entry instead (§6).
6. Check the bar at 1440, 1024, 768 and 390px: nothing wraps onto a second line; the switcher, Ask Pip and avatar keep 44px targets (34px visual height is fine inside the 52px bar, as today).

---

## 3. Rebrand the admin: logo, icon, name

### 3.1 Assets

Copy from `docs/design/discover-ui/assets/logo/` into the app (import through Vite, never link into `docs/`):

| Source | Destination | Use |
|---|---|---|
| `discover-by-layercake-on-teal.svg` | `src/assets/brand/discover-by-layercake-on-teal.svg` | Top bar, client context (teal bar): ink letters, white spark |
| `discover-by-layercake-reversed.svg` | `src/assets/brand/discover-by-layercake-reversed.svg` | Top bar, platform context (ink bar): white letters, orange spark, light-teal "by Layercake" |
| `discover-by-layercake.svg` | `src/assets/brand/discover-by-layercake.svg` | Any light surface inside the admin that shows the full logo (e.g. empty workspace, access-denied, 404 inside the shell) |
| `discover-icon.svg` | `src/assets/brand/discover-icon.svg` | In-app icon use, if any |
| `favicon/favicon.svg` | `public/favicon.svg` | Modern browsers |
| `favicon/favicon-32.png` | `public/favicon.png` (replace) | Fallback favicon (keeps the existing filename) |
| `favicon/favicon-16.png` | `public/favicon-16.png` | Small fallback |
| `favicon/apple-touch-icon-180.png` | `public/apple-touch-icon.png` (replace) | iOS home screen (square, full-bleed) |
| `favicon/favicon-192.png`, `favicon-512.png` | `public/` | Only if a web manifest exists; don't add a manifest just for this |

Do not edit the SVGs (no recolouring, no re-spacing, no retyping in a font). Do not use anything from `assets/logo/explorations/`.

### 3.2 Top bar logo

- `TopBar.jsx`: replace the `layercake-maps-white.png` import with the two SVGs; choose by context: `context === "platform" ? reversed : onTeal`.
- `<img src={…} alt="Discover by Layercake" />` inside the existing home `Link`; set the link's `aria-label` to "Discover by Layercake home" only if the image alt is empty (don't double-announce).
- CSS: `.shell .topbar-logo img { height: 32px; width: auto; display: block; }` (was 24px for the PNG). Below 640px use 28px. The full lockup is legible down to 120px wide; it is never replaced by the icon in the top bar.
- Keep the `.topbar-divider` after the logo.
- Delete `src/assets/layercake-maps-white.png` if nothing else imports it. **Keep** `public/layercake-maps-white.png`: published directory sites load it from `maps.layercake-cx.biz` (the "Built on" panel in the site generator). Note that in the PR.

### 3.3 Favicon and browser tab

- `index.html`: icons become
  ```html
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  ```
- Leave the static `<title>Layercake Maps</title>` in `index.html` alone (public routes share it; see BACKLOG). Instead set the title for admin routes: add a small `useDocumentTitle(title)` hook used by `AppShell` (or `PageHead`), producing `"{page title} · Discover by Layercake"` when PageHead's `title` is a plain string, and `"Discover by Layercake"` otherwise. Restore the previous title on unmount so public routes are unaffected.

### 3.4 Product name in admin copy

Change "Layercake Maps" to "Discover by Layercake" (or "Discover" where the sentence already says Layercake) in admin-facing copy only:

| File | Change |
|---|---|
| `src/components/shell/TopBar.jsx` | logo alt (above) |
| `src/lib/dnsSetupInstructions.js` (2 strings) | "set up the domain in Discover first"; "our Discover by Layercake directory" (this text is copied by customers to their IT team, so keep it plain) |
| `src/components/assistant/constants.js` | comment only: the top bar now shows the Discover logo |
| Any other in-scope match | run `grep -rn "Layercake Maps" src` and fix every match in admin/client portal files |

**Do not change** (BACKLOG instead): `src/lib/clientEmail.js` sender name (outgoing email, deliverability and recipients' filters depend on it), `src/pages/SignUp.jsx`, `src/pages/CustomDomainMap.jsx`, `BrandLogo.jsx` and the marketing pages, `supabase/functions/**`.

"Maps" as a feature stays: "My maps", "All maps", map pages and the map product inside Discover keep their names. Only the platform/product name changes.

---

## 4. Guardrails to add

Extend `scripts/check-ui.sh` with three must-be-zero checks over the same in-scope paths and excludes:

- `Bricolage` anywhere in `src/` and `index.html`.
- `topbar-search` or `Support and documentation` in `src/`.
- `Layercake Maps` in in-scope files (the excludes list already omits marketing/auth/public files; also exclude `src/lib/clientEmail.js` with the comment `# outgoing email sender name: rebrand pending, see BACKLOG`).

---

## 5. Docs

- `docs/USER_GUIDE.md`: a short note near the top: the admin is now **Discover by Layercake**; the top bar no longer has a search box or help icon. Replace "Layercake Maps" with the new name where it refers to the admin (leave references to published sites or emails that still say Layercake Maps).
- `docs/FRONTEND_ARCHITECTURE.md`: heading font is Schibsted Grotesk; brand assets live in `src/assets/brand/`; top bar contents as in §2.2.
- `docs/DEPLOYMENTS.md`: frontend entry per `AGENTS.md` (staging, then production after sign-off), in the same branch.
- `BACKLOG.md`: entries in §6.

---

## 6. BACKLOG entries to add

Use the existing format (`### [DISCOVER-UI] …`, Source, What the design shows, Why not built now, Suggested next step):

1. **Rebrand sign-up, login and marketing pages** (`SignUp`, `Login`/`AuthForm`, `BrandLogo` "Maps by Layercake", `Pricing`, `SiteHeader`, `SiteFooter`, `index.html` title): approved for the admin only on 2026-11-14.
2. **Rebrand outgoing email sender name** (`clientEmail.js` "Layercake Maps <noreply@…>"): check deliverability and customer comms first.
3. **Rebrand the "Built on Layercake Maps" panel on published directory sites** (`supabase/functions/generate_directory_site`, `public/layercake-maps-white.png`): needs an Edge Function deploy and directory republishes; use `discover-by-layercake-reversed.svg` and the chip pattern in `reference/04-…`.
4. **Help and guides link**: removed from the top bar; add as an avatar menu item once a real help URL exists.
5. **Custom-domain "not connected" page copy** (`CustomDomainMap.jsx`).

---

## 7. Acceptance

- `npm run build` passes; `scripts/check-ui.sh` passes including the three new checks.
- Top bar shows the Discover by Layercake logo on teal in client context and reversed on ink in platform context; no search field; no help icon; nothing wraps at 390–1440px.
- Browser tab shows the new favicon and "{Page} · Discover by Layercake" on admin routes; public routes keep their current title.
- All headings, panel titles, stat numbers and JobCard titles render in Schibsted Grotesk (check DevTools computed font, not just the CSS); nothing overflows at the widths in §1.5.
- `grep -rn "Layercake Maps" src` shows only the files deliberately left for BACKLOG.
- PR description: before/after screenshots (§0.3 set), files changed, BACKLOG entries added, check-ui output, and anything you need a decision on.

---

## Addendum A (2026-11-14, after review of the live top bar): white logo on teal, a tad larger

Damian reviewed the deployed top bar: the ink-on-teal logo isn't distinctive enough. Change it to **white on teal** and make it **slightly larger**.

**Branch:** amend the existing `feat/2026-11-14-discover-rebrand` branch and its PR if it isn't merged yet (one piece of work, one PR). If it has been merged, open `feat/<date>-discover-logo-white` instead. Follow AGENTS.md either way, including redeploying and updating the `docs/DEPLOYMENTS.md` entry in the same branch.

1. **New asset.** Copy `docs/design/discover-ui/assets/logo/discover-by-layercake-white-on-teal.svg` to `src/assets/brand/`. It has white "discover", the orange spark and white "by Layercake". Don't edit the SVG.
2. **TopBar.jsx.** In client context (teal bar), use the white-on-teal logo instead of `discover-by-layercake-on-teal.svg`. Platform context (ink bar) keeps `discover-by-layercake-reversed.svg`. Remove the `on-teal` import, and delete `src/assets/brand/discover-by-layercake-on-teal.svg` if nothing else uses it (keep the design copy in `docs/`).
3. **Size.** `.shell .topbar-logo img { height: 40px; }` (was 32px), in both contexts. Keep the 52px top bar height; the logo is centred vertically. Below 640px use 32px (was 28px) in `discover-ui.css`. The logo link keeps a focus ring that fits inside the bar.
4. **Check** at 1440, 1024, 768 and 390px: the switcher, Ask Pip and avatar still fit on one line; the Menu button (below 1024px) still fits before the logo; the divider keeps its 20px gap. At 390px, if the switcher and logo collide, truncate the organisation name in the switcher. Don't shrink the logo below 32px.
5. **Screenshots** in the PR: top bar before and after, in client and platform context, at 1440px and 390px.

Reference: the templates `reference/10-…` to `13-…` and `reference/04-…` now show the white logo at 40px.
