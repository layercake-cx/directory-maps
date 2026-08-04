# Frontend architecture

This document describes how the **Directory Maps** frontend (the `src/` tree) is put together: app shell, routing, state management, styling, and the map rendering engine. For external integrations and secrets, see [INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md). For the database, see [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md).

**Stack:** Vite 7 · React 19 · React Router 7 (`BrowserRouter`) · Mantine 9 (`@mantine/core`) · Supabase JS client · Google Maps JavaScript API · Recharts.

> **Note on routing:** older docs and comments in this repo (`AGENTS.md`, `docs/README.md`, `docs/FEATURES.md`, `docs/INTEGRATION_ARCHITECTURE.md`) describe the app as using `HashRouter` with `/#/...` routes. That was true historically but the app migrated to `BrowserRouter` with clean paths (see `docs/DEPLOYMENTS.md`, commit `a377a8c`, 2026-05-29). **This document reflects the current, correct state.** `index.html` still ships a small redirect shim so old `#/...` bookmarks resolve to the clean-path equivalent.

---

## 1. App shell — entry point

```
main.jsx
 └─ MantineProvider (theme)
     └─ Root.jsx
         ├─ React.StrictMode
         └─ ErrorBoundary
             └─ BrowserRouter
                 └─ AuthProvider (AuthContext)
                     └─ Layout (internal to Root.jsx)
                         ├─ ImpersonationBar
                         ├─ SiteHeader
                         ├─ App.jsx   ← route tree lives here
                         └─ SiteFooter
```

- **`src/main.jsx`** — calls `installGlobalErrorHandlers()` ([`lib/errorLogger.js`](../src/lib/errorLogger.js)) before mounting, imports Mantine's stylesheet then the app's global `src/style.css`, and renders `<Root />` inside a Mantine `theme` (`primaryColor: "dark"`, `primaryShade: 9`, `defaultRadius: "md"`).
- **`src/Root.jsx`** — owns the router, the auth provider, and page chrome (`SiteHeader`/`SiteFooter`). Its internal `Layout` component toggles an `embed-map-page` class on `<body>`/`<html>` when the current route is a chromeless embed (via [`lib/embedRoutes.js`](../src/lib/embedRoutes.js)'s `isEmbedPath()`), and resets scroll position on navigation.
- **`src/App.jsx`** — the actual route table (below). Everything under it renders inside `Root.jsx`'s chrome.

---

## 2. Routing

React Router 7, `BrowserRouter`. `vite.config.js` sets `server.historyApiFallback: true` so deep-linked routes don't 404 in dev/preview, and `base: process.env.VITE_BASE_PATH || "/"` supports a GitHub Pages sub-path deploy alongside the primary Vercel root deploy.

### Public routes (no gate)

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `PublicMap` | Marketing landing page |
| `/pricing` | `Pricing` | Uses shared `PricingPlans` |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | `Login`, `SignUp`, `ForgotPassword`, `ResetPassword` | Auth pages |
| `/terms`, `/privacy` | `Terms`, `Privacy` | Static legal pages |
| `/embed` | `EmbedMap` | Public map renderer (`?map=<id>`) |
| `/memcom-maps-demo` | `MemcomMapsDemo` | Bespoke demo/embed variant |
| `/:clientSlug/:mapSlug` | `SlugMap` | Resolves slugs → `mapId` via RPC `get_map_id_by_slugs`, then renders `EmbedMap` |
| `*` | `<Navigate to="/" replace />` | Fallback |

### Client portal — `/client/*`, wrapped in `<ClientGate><ClientLayout /></ClientGate>`

`ClientLayout` is a **route-level layout** (renders `<Outlet>`). Nested routes:

| Path (relative to `/client`) | Component |
|---|---|
| *(index)* | `ClientDashboard` |
| `team` | `ClientTeam` |
| `email` | `ClientEmail` |
| `maps/new` | `ClientMapNew` |
| `maps/:mapId` | `ClientMapDashboard` |
| `maps/:mapId/data` | `ClientMapData` |
| `maps/:mapId/listings` | `ClientMapListings` |
| `maps/:mapId/stats` | `MapStats` |
| `maps/:mapId/stats/listings/:listingId` | `ListingStats` |
| `directories` | `ClientDirectories` |
| `directories/new` | `ClientDirectoryNew` |
| `directories/:directoryId` | `ClientDirectoryEntries` |
| `categorisations` | `ClientCategorisations` |

### Admin console — `/admin/*`, each route individually wrapped in `<AdminGate>`

Unlike the client portal, admin has **no route-level layout**. Instead, `AdminLayout` (`src/pages/admin/AdminLayout.jsx`) is shared chrome that ~20 admin pages import and render themselves as `<AdminLayout>...</AdminLayout>`.

| Path | Component |
|---|---|
| `/admin` | `<Navigate to="/admin/clients" replace />` |
| `/admin/clients`, `/admin/clients/new`, `/admin/clients/:clientId` | `AdminClients`, `AdminClientNew`, `AdminClientDetail` |
| `/admin/clients/:clientId/contacts/:contactId` | `AdminContactDetail` |
| `/admin/clients/:clientId/maps/new` | `AdminMapNew` |
| `/admin/clients/:clientId/maps/:mapId` | `AdminMapDashboard` |
| `/admin/clients/:clientId/maps/:mapId/data` | `AdminMapData` |
| `/admin/clients/:clientId/maps/:mapId/listings` | `AdminMapListings` |
| `/admin/clients/:clientId/maps/:mapId/stats` | `AdminMapStats` |
| `/admin/clients/:clientId/maps/:mapId/stats/listings/:listingId` | `AdminListingStats` |
| `/admin/clients/:clientId/directories/new`, `/admin/clients/:clientId/directories/:directoryId` | `AdminDirectoryNew`, `AdminDirectoryEntries` |
| `/admin/maps` | `AdminMaps` (searchable, cross-client) |
| `/admin/listings`, `/admin/listings/:id` | `AdminListings`, `AdminEditListing` — legacy listings view |
| `/admin/users`, `/admin/users/:userId` | `AdminUsers`, `AdminUserDetail` |
| `/admin/deployments` | `AdminDeployments` — in-app viewer for `docs/DEPLOYMENTS.md`-style entries |
| `/admin/error-log` | `AdminErrorLogs` — viewer for `lib/errorLogger.js` captures |
| `/admin/user-activity` | `AdminUserActivity` |
| `/admin/sync-log` | `AdminSyncLog` — Google Sheets sync history |
| `/admin/leads` | `AdminLeads` — pre-account `beta_signups` management |

### Route guards

Only two guard components exist, each independently calling `useAuth()`:

- **`ClientGate`** (`src/components/ClientGate.jsx`) — redirects to `/login?redirect=<path>` if no `user`; redirects to `/login?needsVerification=1` if `!user.email_confirmed_at`. Renders nothing while auth is resolving.
- **`AdminGate`** (`src/components/AdminGate.jsx`) — renders an inline admin sign-in form (with its own `signInWithPassword` + forgot-password flow) if there's no `user`; shows "Admin access required" if signed in but `role !== "admin"`.

---

## 3. Directory layout

| Path | Role |
|------|------|
| `src/pages/` | Public/marketing/auth pages, `EmbedMap`, `SlugMap` |
| `src/pages/client/` | Client portal pages, wrapped by `ClientLayout` |
| `src/pages/admin/` | Admin console pages, wrapped page-by-page by `AdminLayout` |
| `src/components/` | Shared UI: map engine, gates, panels, forms |
| `src/components/directories/` | Directories feature (peer concept to Maps — see [DIRECTORIES.md](./DIRECTORIES.md)) |
| `src/components/engagement/` | Analytics/engagement charts and shared stat UI |
| `src/context/` | `AuthContext`, `ClientContext`, `MapDraftContext` |
| `src/hooks/` | `useAuth`, `useClient`, `useMapEngagement`, `useListingEngagement` |
| `src/lib/` | The app's data/service layer — Supabase calls, auth, publication, engagement, map styling, edge function invocation |

The largest single files are `ClientMapDashboard.jsx` and `AdminMapDashboard.jsx` (the map design/editor surfaces, ~3,000 lines each) — these are the busiest screens in the app, combining detail/design/panels/groups/style/publish/search/filter tabs.

**Client vs admin parity:** most user-facing surfaces exist in both a client portal version (`src/pages/client/`) and an admin version (`src/pages/admin/`), sharing components (`PublishedMapView`, `FilterFieldsPanel`, `MapEditSubNav`, `MessagingPanel`, etc.) and CSS (`src/pages/admin/admin.css` is imported by both `AdminLayout` and `ClientLayout`). Per `AGENTS.md`, changes to shared UI should be assumed to apply to both unless clearly one-sided.

### Context

Each context splits its `createContext()` call (lowercase file, e.g. `authContext.js`) from its Provider component (PascalCase, e.g. `AuthContext.jsx`) — a Fast-Refresh-friendly pattern.

| Context | Exposes | Set up by |
|---|---|---|
| `AuthContext` | `initializing`, `user`, `session`, `role`, `roleLoading`, `isAuthed`, `isAdmin`, `reloadRole()`, `provisionVersion`, `signupProvisionError` | `Root.jsx` (app-wide) |
| `ClientContext` | `client`, `contact`, `loading`, `error`, `refetch` | `ClientLayout.jsx` (client portal only) |
| `MapDraftContext` | `hasDraft`, `setHasDraft`, `publishPanelOpen`, `setPublishPanelOpen`, `openPublishRef`, `closePublishRef` | `ClientLayout.jsx` / map dashboard pages, coordinates the unsaved-draft indicator and publish panel |

### The map engine

Two components form the shared "map engine" used by the public embed and both editors:

- **`DirectoryMap`** (`src/components/DirectoryMap.jsx`) — loads the Google Maps JS API ([`lib/loadGoogleMaps.js`](../src/lib/loadGoogleMaps.js)), builds marker icons ([`lib/markerIcons.js`](../src/lib/markerIcons.js)), and configures `MarkerClusterer`/`SuperClusterAlgorithm` (`@googlemaps/markerclusterer`) plus custom map style presets (silver/dark/muted/atlas, via [`lib/mapStyleSettings.js`](../src/lib/mapStyleSettings.js)).
- **`PublishedMapView`** (`src/components/PublishedMapView.jsx`) — wraps `DirectoryMap` with the full public UI: search (indexes name/email/phone/website/address/postcode/country/city/group), continent filtering ([`lib/continents.js`](../src/lib/continents.js)), the listing list panel, and logo rendering (`LogoImage`). Used by `EmbedMap.jsx` (live public embed) and in "preview" mode inside both map editors.

`EmbedMap.jsx` creates its **own anon-only Supabase client**, separate from the shared singleton, so an authenticated admin/client session browsing their own map preview never leaks a real JWT into anonymous engagement-event inserts (RLS on `map_engagement_events` only grants `insert` to the `anon` role).

---

## 4. State management

There is **no global store library** (Redux/Zustand/Jotai/etc.) and **no data-fetching library** (React Query/SWR) — check `package.json` dependencies to confirm this hasn't changed. The pattern is a deliberate three-tier mix:

1. **React Context for cross-cutting session state only** — `AuthContext` (app-wide) and `ClientContext` (client-portal-wide). `MapDraftContext` is a narrower single-feature context.
2. **Local component state + direct Supabase calls** is the dominant pattern everywhere else. Most pages call `supabase.from(...)` (or RPCs / edge functions) directly inside `useEffect`, tracking their own `loading`/`error`/data state. `src/lib/*.js` modules are plain async functions, not hooks or a query cache — e.g. `lib/directories.js` exports `listDirectoryEntries()` that pages call straight from `useEffect`.
3. **Two hand-rolled data-fetching hooks** — `useMapEngagement` and `useListingEngagement` (`src/hooks/`) follow a "fetch in `useEffect`, track loading/error, derive memoized metrics" convention. This is the closest thing to a shared query-hook pattern, but it's bespoke per-hook, not a library.

There is no caching/dedup layer or normalized client-side store. Each page independently fetches and owns its own slice of server state — when adding a new data-heavy page, follow the existing per-page `useEffect` + local state convention rather than introducing a new abstraction.

---

## 5. Styling

Primary UI library is **Mantine** (`@mantine/core` v9 + `@mantine/hooks`), provided app-wide via `MantineProvider` in `main.jsx`. Beyond Mantine, styling is a hybrid:

- **`src/style.css`** (~1,900 lines) — global CSS custom properties for brand colors (`--brand-teal`, `--brand-coral`, etc.), resets, and the bulk of hand-written component/page CSS. This is the dominant styling mechanism for custom UI, not Mantine.
- **CSS Modules** — used selectively for newer/self-contained pieces: `MapEditSubNav.module.css`, `EngagementShared.module.css`, `ListingSearchDropdown.module.css`, `PublicMap.module.css`, `MemcomMapsDemo.module.css`, `ClientEmail.module.css`, `ListingStats.module.css`, `MapStats.module.css`, `MapsView.module.css`.
- **Page-specific plain CSS**, imported directly: `src/pages/admin/admin.css` (shared client + admin), `src/pages/auth-signup-split.css`, `src/pages/pricing.css`.
- **Inline styles** appear in a few places (`AdminGate`'s sign-in form, `Root.jsx`'s `ImpersonationBar`).
- No Tailwind, no styled-components/emotion, no Sass/Less.

New UI should default to Mantine primitives (`Group`, `Stack`, `Button`, `Alert`, `Badge`, `Loader`, `Text`) for layout/controls, and either extend `style.css` (for globally-shared look-and-feel) or add a co-located CSS Module (for a self-contained page/component) — match whichever pattern the surrounding code already uses.

---

## 6. `src/lib/` reference

The service/data layer. Grouped by concern:

**Auth & session**
| File | Responsibility |
|---|---|
| `supabase.js` | Shared Supabase client singleton; `hasSupabaseConfig`; `invokeFunction()` (injects session JWT manually — needed because newer `sb_publishable_...` anon keys aren't JWTs) |
| `auth.js` | `getSession()`, `getMyRole()`, `signOut()`; serializes concurrent auth calls to avoid Supabase client mutex errors; `hardClearSupabaseAuthStorage()` last-resort fallback |
| `authHelpers.js` | Auth redirect URL builders, OTP/sign-in retry logic |
| `clientAuth.js` | Admin impersonation (`startImpersonatingClient`/`stopImpersonatingClient`), `canManageOrg`-style permission helpers |
| `getClientAndContact.js` | Resolves the session's client + contact record for the client portal |
| `provisionClientSignup.js` | Idempotent post-signup client/contact provisioning |
| `inviteHelpers.js` | Team invitation flow (build URLs, preview, accept) |
| `adminClientUsers.js` | Admin-side client-user CRUD via edge functions |
| `subscriptionAccess.js` | `hasSubscriptionAccess()` — gates publish/embed access (Stripe subscriptions not fully wired yet; internal `@layercake` email bypass) |

**Map, publication & engagement**
| File | Responsibility |
|---|---|
| `mapPublication.js` | Publish snapshot model — listings stay live, map/group styling is snapshotted at publish time |
| `mapEngagement.js` | Fire-and-forget engagement event recorder for anon embed views |
| `engagementAnalytics.js` | Pure functions deriving map/listing metrics from engagement events |
| `adminEvents.js` | Client-side counterpart of the admin-event-instrumentation spec in `AGENTS.md` |
| `markerIcons.js` | Data-URL SVG marker icon generation |
| `mapStyleSettings.js` | Custom Google Maps style layer (land/water/road/POI detail levels) |
| `loadGoogleMaps.js` | Lazy, memoized loader for the Google Maps JS API script |
| `filterFields.js` | Per-map configurable "filter fields" CRUD |
| `directories.js` | Directories feature CRUD |
| `categorisations.js` | Client-wide taxonomy CRUD |
| `continents.js` | Free-text country → continent mapping for filtering |
| `statsRoutes.js` | Client-vs-admin stats/back-link path builder |
| `teamDirectory.js` | Sorts/labels team member + pending-invite rows |

**Comms / external services**
| File | Responsibility |
|---|---|
| `clientEmail.js` | Custom client email-domain management |
| `dnsSetupInstructions.js` | DNS setup instruction email text |
| `contactMessage.js` | Embed contact-form submission |
| `sheetSyncMessages.js` | Sheet sync response → user-facing message |
| `googleDrivePicker.js` | Loads Google `gapi`/Picker for Sheet/CSV selection |
| `edgeFunctionFetch.js` | `invokeEdgeFunction()` — raw `fetch` to edge functions (more reliable than the SDK for publishable keys / `--no-verify-jwt` functions) |

**Misc utilities**
| File | Responsibility |
|---|---|
| `errorLogger.js` | Global error handlers + `logClientError()` (feeds `AdminErrorLogs`) |
| `hashSearchParams.js` | Reads/writes query params via `history.replaceState` directly, bypassing React Router's `setSearchParams` to avoid remounts |
| `embedRoutes.js` | `isEmbedPath()` — determines chromeless embed rendering |
| `publishPanelStorage.js` | Persists "publish panel was open" across reloads, per map id |
| `url.js` | `appUrl()` — builds absolute app URLs honoring the GitHub Pages base path |

---

## 7. Build & environment

- **`vite.config.js`**: `base: process.env.VITE_BASE_PATH || "/"` (root for Vercel, sub-path for GitHub Pages); `server.historyApiFallback: true` (required for `BrowserRouter` deep links in dev/preview).
- **`index.html`**: preconnects/loads `DM Sans` + `Poppins`; ships the legacy `#/...` → clean-path redirect shim (pre-mount inline script); a `Loading…` fallback in `#root` before React mounts.
- Environment variables are injected at **build time** via `VITE_*` — see [INTEGRATION_ARCHITECTURE.md §7.1](./INTEGRATION_ARCHITECTURE.md#71-frontend-vercel--build-time) for the full list and secrets handling.
- Deploy targets: Vercel (primary, per `INTEGRATION_ARCHITECTURE.md`) and GitHub Pages (automatic via GitHub Actions on push to `main`, per `AGENTS.md`). See [DEPLOY.md](./DEPLOY.md).

---

## 8. Related documentation

| Doc | Topic |
|-----|-------|
| [INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md) | External systems, secrets vault, security pattern |
| [DIRECTORIES.md](./DIRECTORIES.md) | Directories feature spec (data model, user stories) |
| [MAP_ENGAGEMENT.md](./MAP_ENGAGEMENT.md) | Engagement event schema, RLS, querying |
| [FEATURES.md](./FEATURES.md) | Product feature inventory |
| [DEPLOY.md](./DEPLOY.md) / [ENVIRONMENTS_SETUP.md](./ENVIRONMENTS_SETUP.md) | Deploy and environment setup |
| `AGENTS.md` | Git workflow, admin event instrumentation, documentation rules |
