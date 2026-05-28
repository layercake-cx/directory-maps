# Directory Maps

Multi-tenant SaaS for building embeddable **Google Maps location directories** — client portal, published embeds, CSV/Sheets data, and analytics.

## Documentation

Start here: **[docs/README.md](./docs/README.md)**

**For AI agents:** see **[AGENTS.md](./AGENTS.md)** and **[CLAUDE.md](./CLAUDE.md)** (always update `docs/USER_GUIDE.md` when changing user-facing features).

| Doc | Purpose |
|-----|---------|
| [FEATURES.md](./docs/FEATURES.md) | Full application feature inventory |
| [INTEGRATION_ARCHITECTURE.md](./docs/INTEGRATION_ARCHITECTURE.md) | Integrations, dependencies, secrets for vault |
| [USER_GUIDE.md](./docs/USER_GUIDE.md) | Client user how-to |
| [BETA_READINESS.md](./docs/BETA_READINESS.md) | Pre-launch checklist |
| [DEPLOY.md](./docs/DEPLOY.md) | Vercel deployment |

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set Supabase + Google Maps keys.

```bash
npm run build    # production build
npm run preview  # preview production build
```
