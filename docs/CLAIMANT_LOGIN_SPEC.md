# Spec — Claimant login entry point on published directory sites

Status: revised 2026-11-13 to follow the design brief (`owner-login-magic-link-spec`). The earlier choice of text links (“Manage your listing” / “Listing owner log in”) and a jump to `maps.layercake-cx.biz/claim/login` is withdrawn.

The control is the chosen strip in that brief: a 40px person icon, accessible name **Listing login**, tooltip on hover and focus, last in the desktop nav and beside the menu on mobile. It links to `/login` on the directory’s own host. That page is the two-column “Listing owner login” layout, then the “Check your email” card, using the claim banner colours. With an active custom domain, the emailed magic link returns to `https://<that-domain>/login` and stays on that page. Once the session is stored on that domain, the icon shows the organisation logo or initials and opens the account menu (edit, view, sign out). Verifying the domain registers that URL with Supabase Auth and removing the domain withdraws it. With no custom domain the email opens the Listing Manager on the Layercake address.

## 1. Problem

People who have claimed a directory listing sign in at `/claim/login` (magic link, no password) and land in the Listing Manager. Today the only way to reach that page is the link in an invitation or sign-in email. A claimant who comes back to the directory site later has nowhere obvious to click, so they hunt for the original email or ask the directory admin to resend it.

## 2. Goal

Show a **Log in** link on the published directory site that takes claimants to `/claim/login`. It exists only when claims are on for that directory. If claims are off, there is no link and no trace of one on the site.

## 3. Scope

In scope:
- A claimant login link in the header and footer of published directory pages.
- Gating so the link follows the claims switch.
- Visitor engagement event and docs.

Out of scope (separate work):
- Any change to `/claim/login`'s mechanics (magic link, `link_claim_user_by_email`, activation, ownership transfer).
- Password login, SSO or MFA.
- Branding `/claim/login` per directory (see open question 2).
- The platform's own `/login` for admins and client portal users (already has a header link in `SiteHeader.jsx`).

## 4. Visibility rule (the important bit)

The link renders if and only if the existing claims gate passes at generation time. That gate is already computed in `supabase/functions/generate_directory_site/index.ts` (around the `claimWidgetBase` block):

1. `directory_claim_settings.enabled` is true for the directory, **and**
2. `resolve_claims_entitlement(client_id)` returns true (the `maps.claims` Pro entitlement).

Both conditions are required. Reuse `claimWidgetBase !== null` as the single source of truth. Do not add a second flag or a second check. This keeps the login link, the claim banner and the claim button switching on and off together.

Behaviour matrix:

| State | Header/footer link |
|---|---|
| Claims enabled and entitled | Shown |
| Claims disabled by the admin | Hidden |
| Entitlement lost (plan downgrade, kill switch) | Hidden |
| Claims enabled, no entries claimed yet | Shown (a claimant may have been invited but not yet signed in) |
| Manual-review mode | Shown (approved claimants still sign in by magic link) |

**Staleness.** The site is static HTML, so turning claims off does not remove the link until the directory is republished. This is the same behaviour as the claim banner today. `/claim/login` itself keeps working for existing claimants either way, and a sign-in link is only sent to an email on a live claim, so a stale link leaks nothing. The Claims settings tab should say "Republish to remove the Log in link", matching the banner's existing wording.

## 5. Design

### 5.1 Where it appears

- **Header:** a text link at the right of `.dir-site-header__inner`, after the nav (`siteHeader()` in `builders.ts`, ~line 1220). Label: **Log in**. On mobile it goes inside the existing mobile nav, as the last item, not as a separate control.
- **Footer:** one link in the brand column under "Browse all entries" (`siteFooter()`, ~line 1271), labelled **Listing owner log in**. The footer label is longer because it is a lower-context placement.

Both appear on every page type that uses these helpers (landing, content pages, entry pages).

### 5.2 Link target

`${SITE_ORIGIN}/claim/login`, the same `loginUrl` already built for the claim widget. It opens in the same tab. The platform origin is used even on custom domains because `/claim/login` is part of the platform SPA.

### 5.3 Copy and styling

- Colours come from the existing `--hdr-text` and `--ftr-*` tokens so it follows Look & feel. No new theme fields.
- Plain link style, not a button, so it does not compete with the directory's own calls to action.
- Label is fixed in v1. Make it editable only if a directory asks.

### 5.4 Builder changes

Add one optional field, `claimLoginUrl?: string | null`, to the `siteHeader()` and `siteFooter()` option objects. When falsy, nothing is emitted. Pass it from the three call sites (builders.ts ~2152, ~2325, ~3809 plus footer calls) using `claimWidgetBase ? loginUrl : null`. This needs the value threaded to wherever the landing, content-page and entry-page builders are called from `index.ts`.

**Publishing impact.** This changes markup in `builders.ts`, so bump `ENTRY_TEMPLATE_VERSION` (currently 14) in the same deploy, per `AGENTS.md`, or already-published entry pages will not pick it up on an incremental publish. Also check `preview.ts` (it calls `siteHeader`) still renders.

## 6. Engagement event (required by AGENTS.md §5)

New visitor action, so it needs a `map_engagement_events` row with `surface: directory_site`.

- Event type: **`claim_login_click`**
- Fires when either link is clicked. Uses the existing delegated `data-dm-event` handler (builders.ts ~2701); no new script.
- Markup: `data-dm-event="claim_login_click" data-dm-cta="header"` or `"footer"`.
- `listing_id`: not set on header/footer from landing and content pages; set on entry pages if the handler already supplies it for that page.
- `meta`: `cta_type` (`header` | `footer`), `path`. No personal data.

Work required:
1. Migration adding `claim_login_click` to the `map_engagement_event_type` check constraint, plus rollback file (follow `20261110140000_manual_claim_mode.sql` and its rollback as the template, including the dry-run and integrity-check comments).
2. Row in `docs/MAP_ENGAGEMENT.md` next to the other `claim_*` events.
3. Staging first, production only on explicit sign-off.

No new admin event: nothing is configured by this change. The existing `directory_claim_settings_updated` already covers the toggle.

## 7. Documentation

- `docs/USER_GUIDE.md`: in the Claims section, add that a **Log in** link appears in the directory site header and footer while claims are on, and goes away (after republish) when they are off.
- `docs/FEATURES.md`: one line under the Claims epic.
- `docs/MAP_ENGAGEMENT.md`: the new event.
- `docs/DEPLOYMENTS.md`: staging and production entries in the same PR.
- `docs/DATA_AND_PRIVACY.md`: no change (no new integration or data flow).

## 8. Acceptance criteria

1. With claims enabled and entitled, a freshly published landing page, content page and entry page each show **Log in** in the header (desktop and mobile nav) and **Listing owner log in** in the footer, linking to `/claim/login`.
2. With `directory_claim_settings.enabled = false`, a freshly published site contains neither link, and the HTML has no `claim_login_click` markup.
3. With the entitlement removed and claims still enabled in settings, the same: no link after republish.
4. Clicking either link records one `claim_login_click` row with the correct `cta_type`, `surface = directory_site`, and no personal data.
5. A directory published before this change gets the link after its next publish (confirms the `ENTRY_TEMPLATE_VERSION` bump worked).
6. Header layout does not break with a long directory title or a tall logo on a 375px viewport.
7. `/claim/login` behaviour is unchanged: unknown email still shows the same "check your email" message.

## 9. Test plan

- Staging: publish a directory with claims on, then off, then on with the entitlement removed; inspect the generated HTML for each.
- Click-through as a real claimant (the previous claims phases were never exercised with real credentials, so this is a good moment): link, enter email, receive magic link, land in the Listing Manager.
- `npm run build` and `deno check` on the Edge Function.
- Browser console clean on `/claim/login` and on a generated page.

## 10. Rollout and rollback

1. Migration (event constraint) to staging, then verify.
2. Deploy `generate_directory_site` to staging (`--project-ref beqejxneehilplrtpntn`), republish a test directory, verify.
3. User sign-off, then production migration and function deploy.
4. Rollback: revert the commit and redeploy the function, and run the rollback migration. Already-published pages keep the link until republished, which is harmless.

## 11. Open questions

1. **Label.** "Log in" in the header is unclear to ordinary visitors, who may think they need an account to browse. Alternative: "Listing owners" or "Manage your listing". Recommendation: **Manage your listing** in the header, **Listing owner log in** in the footer.
2. **Directory branding on `/claim/login`.** The page is currently the platform's unbranded card. Passing `?directory=<id>` to show the directory's logo and name would make the jump from a branded site less jarring. Recommendation: do it as a follow-up, not in v1.
3. **Header or footer only.** The header is the most discoverable, but adds visual weight to every directory. Footer-only is the lowest-risk start. Recommendation: both, with the header link subtle, unless a directory owner objects.
4. **Should the link also be hidden until at least one claim is active?** Spec says no (see matrix), because invited claimants need it before any claim is active. Confirm.
