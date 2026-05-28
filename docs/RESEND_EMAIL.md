# Resend email (map contact form)

Directory map **Send message** uses [Resend](https://resend.com) for transactional email. Submissions are always stored in `map_contact_submissions`; Resend delivers one email to the listing contact with the visitor CC'd.

## Platform setup (you / ops)

On **each** Supabase project (test + production):

1. Create a [Resend](https://resend.com) account and API key.
2. Verify **your platform domain** in Resend (the domain in `RESEND_FROM`).
3. Set Edge Function secrets:
   - `RESEND_API_KEY` — API key (`re_…`)
   - `RESEND_FROM` — e.g. `Directory Maps <noreply@yourplatform.com>`

```bash
supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM="Directory Maps <noreply@yourplatform.com>" --project-ref YOUR_REF
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

Clients with **owner** or **manage maps** permission: **Email** in the client portal (`/client/email`).

1. **From address** — display name + email on their domain (e.g. `Acme <hello@acme.com>`).
2. **Set up domain** — registers the domain in your Resend account and shows DNS records (SPF, DKIM, etc.).
3. **Check verification** — after DNS propagates, status becomes **Verified**.
4. Verified clients send map contact mail **from their address**; others use the platform default.

DNS is added at the client’s DNS host (Cloudflare, etc.). Resend’s [domain docs](https://resend.com/docs/dashboard/domains/introduction) apply.

## Database

| Table / column | Purpose |
|----------------|---------|
| `map_contact_submissions` | Every form submit (analytics + audit) |
| `clients.email_from_name` | Client display name |
| `clients.email_from_address` | Client From email |
| `clients.email_domain` | Domain in Resend |
| `clients.resend_domain_id` | Resend domain id |
| `clients.email_domain_status` | `not_configured`, `not_started`, `pending`, `verified`, … |
| `clients.email_dns_records` | JSON DNS rows for the UI |

## Edge Functions

| Function | Auth | Role |
|----------|------|------|
| `send_contact_message` | Public (anon + JWT) | Send to listing, CC visitor; resolve From via `mapId` → client |
| `manage_client_email` | Logged-in client/admin | `save`, `setup_domain`, `verify` / `refresh` |
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
| Row in DB, no email | `email_error` on second `map_contact_submissions` row; Edge Function logs |
