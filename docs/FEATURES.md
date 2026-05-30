# Directory Maps — feature inventory

This document describes **all major features** in the application: what they do, who can use them, and where they live in the codebase. Use it for onboarding, beta planning, and support.

**Related:** [USER_GUIDE.md](./USER_GUIDE.md) (client how-to) · [BETA_READINESS.md](./BETA_READINESS.md) (launch gaps) · specialist docs linked per section.

---

## 1. Architecture overview

```mermaid
flowchart LR
  subgraph public [Public]
    Home[Marketing]
    Embed[Embed map]
    Pricing[Pricing page]
  end
  subgraph client [Client portal]
    Maps[Map editor]
    Data[CSV / Sheets]
    Stats[Analytics]
    Team[Team]
  end
  subgraph admin [Admin]
    Clients[Customers]
    Impersonate[Impersonate]
  end
  subgraph backend [Supabase]
    DB[(Postgres + RLS)]
    EF[Edge functions]
  end
  Home --> client
  client --> DB
  client --> EF
  Embed --> DB
  Embed --> EF
  admin --> DB
  EF --> Google[Google APIs]
  EF --> Resend[Resend]
  EF --> Stripe[Stripe]
```

**Tenancy model**

- **Organisation** = row in `clients` (name, slug, subscription flags, optional Resend domain).
- **User** = Supabase Auth account, linked via `contacts` (`client_id`, `role`, permissions).
- **Platform admin** = `profiles.role = 'admin'` (cross-tenant access, impersonation).
- **Map** = belongs to one client; **listings** and **groups** belong to a map.

---

## 2. Public & marketing

| Feature | Route | Description | Key files |
|---------|-------|-------------|-----------|
| Landing page | `/#/` | Product overview, links to signup and admin | `src/pages/PublicMap.jsx` |
| Marketing pricing | `/#/pricing` | Static plan cards (Starter / Pro / Agency, GBP monthly) | `src/pages/Pricing.jsx` |
| Terms & conditions | `/#/terms` | Renders legal markdown | `src/pages/Terms.jsx`, `docs/MARKDOWN/...` |
| Site chrome | — | Header nav, footer, brand | `src/components/SiteHeader.jsx`, `SiteFooter.jsx` |
| Global error boundary | — | Catches uncaught React errors | `src/components/ErrorBoundary.jsx` |

**Note:** Marketing pricing (`Pricing.jsx`) is **not** the same as checkout plans in the publish flow (`PricingPlans.jsx` — Standard / Premium / Unlimited, yearly GBP). Align copy and plan IDs before public launch.

---

## 3. Authentication & account lifecycle

| Feature | Route | Description | Key files |
|---------|-------|-------------|-----------|
| Sign in | `/#/login` | Email/password; redirect after login; banners for verification / unlinked account | `src/pages/Login.jsx`, `AuthForm.jsx` |
| Sign up | `/#/signup` | Organisation name, auto slug, email/password; provisions `clients` + `contacts` | `src/pages/SignUp.jsx`, `provisionClientSignup.js` |
| Team invite signup | `/#/signup?invite=<uuid>` | Join existing org (no new org); email prefilled; password + verification | `inviteHelpers.js`, RPC `get_team_invitation_preview` |
| Team invite login | `/#/login?invite=<uuid>` | Existing users accept invite with password | `Login.jsx`, `acceptPendingInvitation` |
| Slug availability | — | RPC `is_client_slug_available` (timeout-tolerant) | `src/lib/authHelpers.js` |
| Forgot / reset password | `/#/forgot-password`, `/#/reset-password` | Supabase password recovery | respective pages |
| Email verification gate | `/client/*` | Portal blocked until `email_confirmed_at` | `src/components/ClientGate.jsx` |
| Session & admin role | — | Auth context, token refresh, signup provisioning mutex | `src/context/AuthContext.jsx`, `src/lib/auth.js` |
| Auth error redirect | — | HashRouter workaround for Supabase auth errors | `src/Root.jsx` |

**Post-signup provisioning:** `provisionClientSignup` creates the organisation and primary contact from `user_metadata` (organisation name, slug). Skipped for team-invite signups (no `signup_org_*` metadata). **Team accept:** `acceptPendingInvitation` runs on every login before provisioning.

**Auth model:** Email + password everywhere. Email verification and password-reset use one-time links; there is no passwordless magic-link login.

---

## 4. Client portal

**Base route:** `/#/client` · **Gate:** signed-in user with verified email and linked `contacts` row.

### 4.1 Navigation & layout

| Feature | Route | Description |
|---------|-------|-------------|
| My Maps | `/#/client` | Dashboard grid of maps, data-source badges, links to stats |
| Team | `/#/client/team` | Manage organisation contacts (requires `can_manage_users` or primary) |
| Email settings | `/#/client/email` | Custom sending domain via Resend (requires map-management permission) |
| Map sub-nav | `/#/client/maps/:id/*` | Design · Data · Stats |

Layout: `src/pages/client/ClientLayout.jsx` · Context: `ClientContext`, `getClientAndContact.js`.

### 4.2 Maps — create & list

| Feature | Description |
|---------|-------------|
| New map | Name, slug, default center/zoom, list panel, clustering |
| Map list | All maps for the organisation; open design, data, or stats |

Files: `ClientDashboard.jsx`, `ClientMapNew.jsx`, `MapsView.jsx`.

### 4.3 Map design & publish

The map editor (`ClientMapDashboard.jsx`) is a **live preview** with overlay panels:

| Panel | Purpose |
|-------|---------|
| **General** | Name, slug, default lat/lng/zoom, list panel, clustering (auto-saved draft) |
| **Pin Design** | Marker style (pin/rounded pin/dot), size, colour, border, favicon overlay, drop shadow; previews rendered at true map proportions |
| **Panels** | Listing panel layout and content options |
| **Groups** | Group definitions and per-group theme JSON |
| **Map Style** | Presets + base type, colours, detail sliders, and overlay toggles |
| **Publish Map** | Publish snapshot, version history, rollback, embed URL, subscription gate |
| **Search** | Embed search behaviour settings |

**Publication system**

- **Publish** calls RPC `publish_map` → stores versioned config in `map_publications`, sets `maps.published_at` and `published_config`.
- **Rollback** via `rollback_map_to` and publication list (`list_map_publications`).
- **Draft state** warns on navigation when unsaved; publish panel open state persists per map in `sessionStorage`.

Files: `mapPublication.js`, `MapDraftContext.js`, `publishPanelStorage.js`.

**Subscription gate (publish / embed):** `hasSubscriptionAccess` in `subscriptionAccess.js` — true if `clients.subscription_active_override`, or user email domain contains `layercake`. Stripe subscription status is **not** checked yet; checkout UI exists via `PricingPlans.jsx` + `create_checkout_session` edge function.

### 4.4 Data — listings

| Feature | Route | Description |
|---------|-------|-------------|
| Data hub | `/#/client/maps/:id/data` | CSV import, Google Sheets connect, sync schedule |
| Listings table | `/#/client/maps/:id/listings` | Search/filter listings; batch geocode |

**CSV import**

- Template download; columns include `name`, `address`, `postcode`, `country`, `lat`, `lng`, `website_url`, `email`, `phone`, `logo_url`, `notes_html`, `group_name`, `is_active`, etc.
- Optional **geocode rows missing lat/lng** (edge function `geocode_listings` / `geocode_address`).

**Google Sheets sync**

- OAuth via edge functions (`google_oauth_start`, `google_oauth_callback`).
- Pick sheet, validate columns (`validate_sheet_source`), sync rows (`sync_sheet_listings`).
- Optional nightly `pg_cron` schedule (see [GOOGLE_SHEETS_SYNC.md](./GOOGLE_SHEETS_SYNC.md)).

**Coming soon (UI only):** OneDrive / iCloud badges on data page.

Files: `ClientMapData.jsx`, `ClientMapListings.jsx`.

### 4.5 Analytics (engagement)

| Feature | Route | Description |
|---------|-------|-------------|
| Map stats | `/#/client/maps/:id/stats` | Sessions, funnel, charts, search terms, date range |
| Listing stats | `.../stats/listings/:listingId` | Per-listing engagement breakdown |

Data source: `map_engagement_events` (recorded on **public embed only**). See [MAP_ENGAGEMENT.md](./MAP_ENGAGEMENT.md).

Files: `MapStats.jsx`, `ListingStats.jsx`, `src/hooks/useListingEngagement.js`, `src/components/engagement/*`.

### 4.6 Team & permissions

**Route:** `ClientTeam.jsx` at `/#/client/team` (owners/managers via `canManageOrg`).

| Capability | Description |
|------------|-------------|
| List team | Contacts with roles (owner / manager / member) |
| Invite | Edge `send_team_invitation` — validates 1:1 account rule, emails signup link (Resend) |
| Member map access | Per-map checkboxes; stored in `contact_map_permissions` |
| Accept invite | Invitee signs up/logs in with password; RPC `accept_team_invitation` on session |

Legacy `ClientUsers.jsx` (manual contact insert only) remains in the repo but is not routed.

**Permission model (coexisting)**

- Legacy: `is_primary`, `can_manage_maps`, `can_manage_users` on `contacts`.
- New: `role` (`owner` | `manager` | `member`) + `contact_map_permissions` for member map scope.

### 4.7 Custom email (Resend)

| Feature | Route | Description |
|---------|-------|-------------|
| Domain setup | `/#/client/email` | Add DNS records, verify domain, set from-address for contact form emails |

Edge function: `manage_client_email`. See [RESEND_EMAIL.md](./RESEND_EMAIL.md).

---

## 5. Public embed (visitor experience)

| Feature | Route | Description |
|---------|-------|-------------|
| Embed map | `/#/embed?map=<MAP_ID>` | Full-screen published map; requires `published_at` |
| Search | — | Places + listing search; engagement events logged |
| Directory groups | — | Expandable groups in side panel |
| Listing detail | — | Panel from marker, list, or search |
| Contact visitor | — | “Send message” → `map_contact_submissions` + email via Resend |
| Marker clustering | — | Configurable cluster radius; same-address clusters auto-spiderfy (fan out) on click |

Files: `EmbedMap.jsx`, `PublishedMapView.jsx`, `DirectoryMap.jsx`, `contactMessage.js`, `mapEngagement.js`.

**Engagement:** Anonymous insert-only RLS on `map_engagement_events` for published maps. Failures are non-blocking (`console.warn`).

---

## 6. Admin console

**Base route:** `/#/admin` · **Gate:** `profiles.role = 'admin'`.

| Feature | Route | Description |
|---------|-------|-------------|
| Customers | `/admin/clients` | Search, create, delete clients; **impersonate** into client portal |
| Customer detail | `/admin/clients/:id` | Edit org, contacts, maps; `subscription_active_override` |
| New customer | `/admin/clients/new` | Create organisation (name + slug) |
| Add customer user | `/admin/clients/:id` (Users tab) | Send invite to create account/set password; contact links after invite acceptance |
| Contact detail | `/admin/clients/:id/contacts/:contactId` | Per-contact admin view |
| All maps | `/admin/maps` | Cross-tenant map search |
| Per-client maps | `/admin/clients/:id/maps/...` | Same tools as client portal (design, data, listings) — **no Stats tab** |
| Legacy listings | `/admin/listings` | Global listing browser (limit 1000) |
| Admin users | `/admin/users` | List admin users; open profile with Details and Activities tabs |
| User activity | `/admin/user-activity` | Filterable audit log (`admin_events`: type, subtype, client, map) |
| Error log | `/admin/error-log` | Client-reported errors in `error_logs` |
| Deployments | `/admin/deployments` | Trigger Vercel deploy hooks or copy shell commands |

**Impersonation:** Admin sets `dm_impersonated_client_id` in `localStorage`; crimson banner in `Root.jsx`; `getClientAndContact` resolves impersonated client.

Files: `src/pages/admin/*`, `AdminGate.jsx`, `clientAuth.js`.

---

## 7. Backend (Supabase)

### 7.1 Core tables

| Table | Purpose |
|-------|---------|
| `clients` | Organisations (slug, subscription override, Resend fields) |
| `contacts` | Users linked to clients (role, permissions) |
| `profiles` | Auth user metadata; `role = admin` for platform admins |
| `maps` | Map config, publish timestamps, theme, pins, clustering |
| `groups` | Listing groups + theme JSON |
| `listings` | Locations / directory entries (geocode status, `geocoded_at`) |
| `map_data_sources` | Google Sheet binding + sync schedule |
| `map_publications` | Versioned publish snapshots |
| `map_engagement_events` | Embed analytics |
| `map_contact_submissions` | Visitor contact form archive |
| `invitations` | Pending team invites |
| `contact_map_permissions` | Member → map access |
| `error_logs` | Client-side error reports |

View: `public_listings` for anon-safe listing reads on embed.

### 7.2 Security (RLS)

| Migration | Purpose |
|-----------|---------|
| `20260315100000_enable_rls_policies.sql` | Initial RLS |
| `20260520100000_tenant_scoped_rls.sql` | **Tenant-scoped** policies via `current_user_client_id()` |
| `20260521100000_fix_profiles_rls_recursion.sql` | `is_admin()` security definer helper |
| `20260522100000_data_api_grants.sql` | Explicit API grants; RLS remains enforcement |

**Pre-launch:** Ensure tenant-scoped RLS and profile recursion fix are applied on **production** Supabase (migrations may exist only locally until pushed).

### 7.3 RPCs

| Function | Purpose |
|----------|---------|
| `is_client_slug_available` | Signup slug check |
| `get_team_invitation_preview` | Public invite details for signup/login pages (anon) |
| `create_team_invitation` | Owner/manager creates pending invite |
| `accept_team_invitation` | Links logged-in user to org from pending invite |
| `current_user_client_id` | RLS helper |
| `is_admin` | RLS helper |
| `publish_map` | Create publication + update published config |
| `rollback_map_to` | Restore a prior publication |
| `list_map_publications` | Version history for UI |

### 7.4 Edge functions

| Function | Purpose |
|----------|---------|
| `geocode_address` | Single-address geocode |
| `geocode_listings` | Batch geocode for a map |
| `google_oauth_start` / `google_oauth_callback` | Sheets OAuth |
| `google_get_access_token` | Token refresh for sync |
| `google_list_sheets` / `google_set_sheet_file` | Sheet picker |
| `validate_sheet_source` | Column validation |
| `sync_sheet_listings` | Import + geocode from sheet |
| `send_contact_message` | Resend email from embed form |
| `manage_client_email` | Resend domain CRUD |
| `create_checkout_session` | Stripe Checkout |
| `admin_create_client_user` | Admin user invite: create invitation + onboarding email to signup flow |
| `admin_delete_client_user` | Admin user removal: delete contact + auth user (blocked if linked to other clients) |

Shared utilities: `supabase/functions/_shared/`.

---

## 8. Integrations summary

| Service | Used for | Config |
|---------|----------|--------|
| **Google Maps JS** | Map display, embed | `VITE_GOOGLE_MAPS_API_KEY` |
| **Google Geocoding** | CSV/Sheets/listings | `GOOGLE_GEOCODING_API_KEY` (edge) |
| **Google Drive/Sheets** | Live data sync | OAuth secrets on edge functions |
| **Supabase** | Auth, DB, functions | `VITE_SUPABASE_*` |
| **Resend** | Contact emails, custom domains | `RESEND_API_KEY`, per-client domain |
| **Stripe** | Checkout sessions | Stripe secrets on `create_checkout_session` |
| **Vercel** | Hosting, deploy hooks | `vercel.json`, optional hook env vars |

---

## 9. Operational & developer features

| Feature | Description |
|---------|-------------|
| Client error logging | `errorLogger.js` → `error_logs` (global handlers, recursion guard) |
| Deploy scripts | `npm run deploy:test`, `deploy:live` |
| Geocode test script | `scripts/test-geocode.mjs` |
| Environments | [ENVIRONMENTS_SETUP.md](./ENVIRONMENTS_SETUP.md) |
| Deploy guide | [DEPLOY.md](./DEPLOY.md) |

---

## 10. Feature maturity matrix

| Area | Status | Notes |
|------|--------|-------|
| Map design & publish | **Production-ready** | Versioned publications, rollback |
| CSV import & geocode | **Production-ready** | Depends on edge deploy + API keys |
| Google Sheets sync | **Production-ready** | Documented; cron optional |
| Public embed | **Production-ready** | Requires publish + keys |
| Engagement recording | **Production-ready** | Best-effort inserts |
| Engagement dashboards | **Production-ready** | Client portal Stats routes |
| Team (invitations + roles) | **Production-ready** | `ClientTeam` + `acceptPendingInvitation` on login |
| Stripe subscription enforcement | **Incomplete** | Checkout exists; `hasSubscriptionAccess` ignores Stripe |
| Marketing vs checkout pricing | **Misaligned** | Two plan catalogs |
| Admin user management | **Stub** | Page is placeholder |
| OneDrive / iCloud | **Not started** | UI placeholders only |
| Tenant RLS migrations | **Deployed** | Production + test; smoke-test cross-tenant access |

---

## 11. Route reference

| Path | Component |
|------|-----------|
| `/` | `PublicMap` |
| `/pricing` | `Pricing` |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Auth pages |
| `/terms` | `Terms` |
| `/embed` | `EmbedMap` |
| `/client` | `ClientDashboard` |
| `/client/team` | `ClientTeam` |
| `/client/email` | `ClientEmail` |
| `/client/maps/new` | `ClientMapNew` |
| `/client/maps/:mapId` | `ClientMapDashboard` |
| `/client/maps/:mapId/data` | `ClientMapData` |
| `/client/maps/:mapId/listings` | `ClientMapListings` |
| `/client/maps/:mapId/stats` | `MapStats` |
| `/client/maps/:mapId/stats/listings/:listingId` | `ListingStats` |
| `/admin/clients` | `AdminClients` |
| `/admin/maps` | `AdminMaps` |
| `/admin/clients/:clientId/maps/:mapId` | `AdminMapDashboard` |
| `/admin/user-activity` | `AdminUserActivity` |
| `/admin/error-log` | `AdminErrorLogs` |
| `/admin/deployments` | `AdminDeployments` |

Full route tree: `src/App.jsx`.
