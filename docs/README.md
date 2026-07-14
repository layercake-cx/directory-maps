# Directory Maps — documentation

Directory Maps is a multi-tenant SaaS for building **Google Maps–based location directories**: clients manage maps and listings in a portal, visitors use embeddable public maps with search, groups, and contact forms.

**Stack:** Vite + React (HashRouter) · Supabase (Auth, Postgres, Edge Functions) · Google Maps / Geocoding / Sheets · Resend · Stripe (partial)

---

## Documentation index

| Document | Audience | Contents |
|----------|----------|----------|
| [**FEATURES.md**](./FEATURES.md) | Product, engineering, beta planning | Full feature inventory across app, API, and integrations |
| [**DIRECTORIES.md**](./DIRECTORIES.md) | Product, engineering | Draft spec: Directories feature — epics, user stories, data model, existing-patterns audit |
| [**USER_GUIDE.md**](./USER_GUIDE.md) | Client users | Sign-up, maps, data import, publish, embed, team |
| [**BETA_READINESS.md**](./BETA_READINESS.md) | Launch team | Pre-launch checklist and known gaps |
| [**INTEGRATION_ARCHITECTURE.md**](./INTEGRATION_ARCHITECTURE.md) | Ops / security | System integrations, dependencies, vault secrets inventory |
| [**DEPLOY.md**](./DEPLOY.md) | Ops | Vercel deploy, env vars, custom domain |
| [**ENVIRONMENTS_SETUP.md**](./ENVIRONMENTS_SETUP.md) | Ops | Test + production Supabase/Vercel |
| [**DATABASE_MIGRATIONS.md**](./DATABASE_MIGRATIONS.md) | Engineering / Ops | Migration policy, rollback, dry-run, integrity checks |
| [**DEPLOYMENTS.md**](./DEPLOYMENTS.md) | Everyone | Plain-English record of every deployment — what changed and why |
| [**GOOGLE_SHEETS_SYNC.md**](./GOOGLE_SHEETS_SYNC.md) | Ops / support | Google OAuth, sheet sync, cron |
| [**MAP_ENGAGEMENT.md**](./MAP_ENGAGEMENT.md) | Engineering / analytics | Embed event schema, RLS, querying |
| [**RESEND_EMAIL.md**](./RESEND_EMAIL.md) | Ops | Contact form + custom client domains |
| [**CONTACTS_TABLE.md**](./CONTACTS_TABLE.md) | Ops | Manual `contacts` table setup if needed |
| [**MARKDOWN/Layercake_Maps_Terms_and_Conditions.md**](./MARKDOWN/Layercake_Maps_Terms_and_Conditions.md) | Legal | Terms source for `/terms` |

**Scripts:** [`scripts/test-geocode.md`](../scripts/test-geocode.md) — geocode edge function testing.

**Agents:** [`AGENTS.md`](../AGENTS.md) · [`CLAUDE.md`](../CLAUDE.md) · [`.cursor/rules/user-guide-documentation.mdc`](../.cursor/rules/user-guide-documentation.mdc) — keep `USER_GUIDE.md` updated when changing features.

---

## Quick links (routes)

| Area | Hash route | Gate |
|------|------------|------|
| Marketing home | `/#/` | Public |
| Pricing | `/#/pricing` | Public |
| Sign up / login | `/#/signup`, `/#/login` | Public |
| Client portal | `/#/client/*` | Authenticated + verified email |
| Public embed | `/#/embed?map=<id>` | Published map only |
| Admin console | `/#/admin/*` | `profiles.role = admin` |

---

## Repository layout

| Path | Role |
|------|------|
| `src/pages/` | Route pages (public, client, admin) |
| `src/components/` | Shared UI (`DirectoryMap`, `PublishedMapView`, gates) |
| `src/lib/` | Auth, Supabase helpers, engagement, publication |
| `supabase/migrations/` | Postgres schema, RLS, RPCs |
| `supabase/functions/` | Edge functions (geocode, Google, Stripe, email) |
| `docs/` | Documentation (this folder) |

For environment variables, see [`.env.example`](../.env.example). For **secrets vault planning**, see [**INTEGRATION_ARCHITECTURE.md**](./INTEGRATION_ARCHITECTURE.md) §7.
