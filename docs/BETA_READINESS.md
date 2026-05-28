# Beta readiness checklist

Target: **beta group launch in ~2 weeks**. This checklist prioritises gaps that block safe multi-tenant use or core client workflows. See [FEATURES.md](./FEATURES.md) for the full inventory.

---

## P0 — Must fix before beta

### 1. Apply tenant-scoped RLS on production — **done**

Migrations `20260520100000_tenant_scoped_rls.sql`, `20260521100000_fix_profiles_rls_recursion.sql`, and `20260522100000_data_api_grants.sql` are applied on:

- **Production** (`gxixwdjfmegxcxfeflro` / layercake-maps-production) — `data_api_grants` pushed May 2026; tenant RLS + `is_admin()` were already present.
- **Test** (`beqejxneehilplrtpntn`, per `.env.local`) — all migrations up to date.

**Still recommended:** smoke-test that client A cannot read client B’s maps on production.

```bash
supabase link --project-ref gxixwdjfmegxcxfeflro
supabase db push
```

### 2. Wire team invitation accept flow — **done**

- `/client/team` routes to `ClientTeam.jsx` (invites, roles, per-map access for members).
- `acceptPendingInvitation` runs in `AuthContext` **before** signup provisioning on every login/session.
- Team nav visible to owners/managers (`canManageOrg`).

### 3. Subscription / publish gate strategy

`hasSubscriptionAccess` does not read Stripe. Today, access is granted via:

- `clients.subscription_active_override` (admin toggle), or
- Email domain containing `layercake`.

**For beta:** Decide explicitly — e.g. set `subscription_active_override = true` for all beta clients in admin, or finish Stripe webhook + status check before allowing publish.

Unblock publish for paying beta users without leaving the gate wide open for everyone.

### 4. Align pricing story

Two catalogs exist:

- Marketing: `/#/pricing` — Starter / Pro / Agency (monthly GBP)
- Checkout: publish panel — Standard / Premium / Unlimited (yearly GBP)

Beta users will be confused if marketing and in-app checkout disagree.

**Action:** Single source of truth for plan names, prices, and limits; update one page or both.

### 5. Production secrets & edge functions

Confirm on **production** Supabase:

- All edge functions deployed (`geocode_*`, Google OAuth/sync, `send_contact_message`, `manage_client_email`, `create_checkout_session`)
- `GOOGLE_GEOCODING_API_KEY`, `RESEND_API_KEY`, Google OAuth client, Stripe keys (if using checkout)
- Supabase Auth: site URL / redirect URLs match `maps.layercake-cx.biz` (or beta domain)
- Email confirmation enabled if `ClientGate` requires it

Use [ENVIRONMENTS_SETUP.md](./ENVIRONMENTS_SETUP.md) and [DEPLOY.md](./DEPLOY.md).

---

## P1 — Strongly recommended for beta

### 6. Onboarding path for first map

Beta users need a clear **first-run** path: sign up → create map → import CSV or connect sheet → publish → copy embed code.

**Gaps today:** No guided wizard; [USER_GUIDE.md](./USER_GUIDE.md) helps but is not in-app.

**Action:** Short checklist email or in-app banner on empty dashboard (“Create your first map → Upload data → Publish”).

### 7. Support & error visibility

- **Error log** (`/admin/error-log`) exists — monitor during beta.
- Contact form and engagement inserts fail silently (`console.warn`) — consider admin alert or Supabase log drain for failed edge calls.
- Document a **single support channel** (email/Slack) for beta cohort.

### 8. Email deliverability

Contact form and invitations depend on Resend and Supabase Auth emails.

**Action:** Verify SPF/DKIM for production domain; test team invite signup/login links and password reset from a non-Layercake mailbox.

### 9. Google Sheets beta playbook

Sheets sync is powerful but setup-heavy (OAuth, column mapping, cron). Provide a one-pager or call for beta clients using Sheets — see [GOOGLE_SHEETS_SYNC.md](./GOOGLE_SHEETS_SYNC.md).

### 10. Map limits enforcement

Plan copy mentions map counts (1–2, 3–5, unlimited) but **enforcement in code** may be incomplete. Decide whether beta is honour-system or block `ClientMapNew` when over limit.

---

## P2 — Can defer until after beta

| Item | Notes |
|------|-------|
| Admin Users page | Stub only; manage admins via Supabase dashboard |
| OneDrive / iCloud | UI placeholders |
| Marketing pricing automation | Static page OK if checkout is manual/override |
| Engagement aggregations / exports | Raw SQL + Stats UI sufficient for beta |
| `client_preview` engagement surface | Not recorded today |
| Root `README.md` | Use `docs/README.md` as index |

---

## Suggested beta launch smoke test

Run as a **non-admin** test user on production-like env:

1. Sign up new organisation → verify email → land on My Maps.
2. Create map → upload small CSV with geocode → confirm listings on Listings page.
3. Design map (pin, groups) → Publish → open embed URL in incognito.
4. On embed: search, open listing, submit contact form → confirm email received.
5. View Stats for map → confirm `session_start` and events appear.
6. Add second team contact (if using team feature) → second user can sign in and see correct maps.
7. Admin: impersonate client → confirm banner and scoped data.
8. Second organisation: confirm **no** cross-tenant data visible.

---

## Summary recommendation

The product core — **map editor, CSV/Sheets data, publish/embed, contact form, analytics** — is suitable for a controlled beta **if** tenant RLS is live, publish access is explicitly granted for beta accounts, and team/onboarding expectations are set.

The highest-risk gaps for a **multi-tenant beta** are:

1. **RLS not deployed to production**
2. **Team invites incomplete** (if multi-user orgs are in scope)
3. **Subscription gate undefined** (Stripe vs manual override)
4. **Pricing mismatch** between marketing and checkout

Address P0 items in the first week; use P1 for polish and support readiness in week two.
