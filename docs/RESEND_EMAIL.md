# Resend email (map contact form)

Directory map **Send message** uses [Resend](https://resend.com) for transactional email. Submissions are always stored in `map_contact_submissions`; Resend delivers one email to the listing contact with the visitor CC'd and **Reply-To** set to the visitor's address.

## Platform setup (you / ops)

On **each** Supabase project (test + production):

1. Create a [Resend](https://resend.com) account and API key.
2. Verify **your platform domain** in Resend (the domain in `RESEND_FROM`).
3. Set Edge Function secrets:
   - `RESEND_API_KEY` — sending API key (`re_…`)
   - `RESEND_ADMIN_API_KEY` — **full-access** Resend key for domain create/verify (required for **Set up domain**; a send-only key fails)
   - `RESEND_FROM` — e.g. `Directory Maps <noreply@yourplatform.com>`

```bash
supabase secrets set RESEND_API_KEY=re_xxx RESEND_ADMIN_API_KEY=re_xxx RESEND_FROM="Directory Maps <noreply@yourplatform.com>" --project-ref YOUR_REF
```

4. Deploy functions:

```bash
supabase functions deploy send_contact_message --no-verify-jwt --project-ref YOUR_REF
supabase functions deploy manage_client_email --no-verify-jwt --project-ref YOUR_REF
supabase functions deploy send_team_invitation --project-ref YOUR_REF
```

Optional secret for invite links in email (defaults to `https://maps.layercake-cx.biz`):

```bash
supabase secrets set SITE_URL=https://maps.layercake-cx.biz --project-ref YOUR_REF
```

Use `--no-verify-jwt` so the public embed and map preview can call `send_contact_message` without a logged-in JWT. (`manage_client_email` still checks auth inside the function.)

5. Apply DB migration `20260517120000_client_resend_email.sql` (client From + DNS fields on `clients`).

Until a client verifies their own domain, messages use **`RESEND_FROM`**.

## Client setup (per organisation)

Clients with **owner** or **manage maps** permission: **Messaging** in the client portal (`/client/email`). An organisation can have several **sending profiles**; each map and directory chooses one (Messaging tab / directory Email tab) and cannot send until it has.

1. **New profile** — name, display name and an email on their domain (e.g. `Acme <hello@acme.com>`).
2. **Set up domain** — registers the domain in your Resend account and shows DNS records (SPF, DKIM, etc.). Profiles on the same domain reuse one Resend domain.
3. **Verify DNS settings** — after DNS propagates, status becomes **Verified** (for every profile on that domain).
4. Verified profiles send **from their address**; unverified profiles send from the platform address but use the profile's **Display name**.

DNS is added at the client’s DNS host (Cloudflare, etc.). Resend’s [domain docs](https://resend.com/docs/dashboard/domains/introduction) apply.

## Database

| Table / column | Purpose |
|----------------|---------|
| `map_contact_submissions` / `directory_contact_submissions` | Every form submit (analytics + audit) |
| `messaging_profiles` | Sending identities: `name`, `email_from_name`, `email_from_address`, `email_domain`, `resend_domain_id`, `email_domain_status` (`not_configured`, `not_started`, `pending`, `verified`, …), `email_dns_records` (JSON DNS rows for the UI) |
| `maps` / `directories` `.messaging_profile_id` | Chosen profile (NULL = messaging blocked) |
| `maps` / `directories` `.messaging_enabled`, `email_test_mode`, `email_test_recipient`, `message_prompt`, `message_subject`, `message_intro` | Per-entity switch, test mode and message text |
| `map_messaging_settings`, `directory_messaging_settings` (views) | Anon-readable effective settings (toggle AND profile chosen AND entitlement) |
| `clients.email_*`, `clients.messaging_*` | **Legacy** — no longer read; kept until a cleanup migration |

## Edge Functions

| Function | Auth | Role |
|----------|------|------|
| `send_contact_message` | Public (anon + JWT) | Send to listing/enquiry inbox, CC visitor, Reply-To visitor; resolve profile, test mode and message text from the map (`mapId`) or directory (`directoryId`); 403 until a profile is chosen and messaging is enabled |
| `manage_client_email` | Logged-in client/admin | Messaging profiles: `create`, `save`, `delete`, `setup_domain`, `verify` / `refresh` (all but `create` take `profileId`) |
| `send_team_invitation` | Logged-in owner/manager | Create invite + send “join your team” email |

## Auth email (magic links)

Supabase Auth can stay on **SendGrid SMTP** (or move to Resend SMTP later). Map contact mail is independent and uses the Resend API only.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Failed to send request to Edge Function | Deploy `send_contact_message`; `VITE_SUPABASE_URL` matches project |
| Email not configured (503) | `RESEND_API_KEY` + `RESEND_FROM` secrets |
| Sends but From is platform address | Client domain not **verified** in `/client/email` |
| Resend 403 / domain error | From domain must match verified Resend domain |
| Set up domain does nothing / no DNS rows | Deploy latest `manage_client_email`; set `RESEND_ADMIN_API_KEY` (full-access); check browser console and inline message under the button |
