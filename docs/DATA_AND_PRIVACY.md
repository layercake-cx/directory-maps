# Data & Privacy — Third-Party Systems

This document describes every external system that Layercake Maps sends data to, what personal data is involved, where it is processed, and what agreements govern it. It is written for the legal/compliance team to keep the **privacy policy** and any **DPAs** with clients accurate and up to date.

**Keep this document current** whenever an integration is added, changed, or removed.

**Audience:** Privacy officer, legal counsel, client DPO enquiries.  
**Technical detail:** [INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md)

---

## People whose data this document covers

| Person | Who they are | How they interact |
|--------|--------------|-------------------|
| **Platform user** | A client organisation's staff member — owner, manager, or member | Logs in to the client portal to manage maps and listings |
| **Map visitor** | A member of the public viewing an embedded directory map | Browses the map; may submit a contact form |
| **Listing subject** | A business or individual whose details appear in a directory listing | Does not interact with the platform directly |
| **Platform admin** | Layercake Maps internal staff | Accesses the admin area |

---

## 1. Supabase

**Role:** Primary database, authentication, and serverless compute.

**What it is:** Supabase is a managed Postgres database platform. It handles all user accounts (auth) and stores all application data.

### Data stored

| Category | Examples | Who it belongs to |
|----------|----------|-------------------|
| Account credentials | Email address, bcrypt password hash | Platform users |
| Profile & contact records | Name, email, organisation, role, permissions | Platform users |
| Listing content | Business name, address, phone, email, website, notes | Listing subjects |
| Map contact form submissions | Visitor name, email, phone, message, timestamp | Map visitors |
| Map engagement events | Event type (pin click, search, message sent), approximate timestamp — **no IP address stored** | Map visitors (pseudonymous) |
| Map engagement search queries | Search text typed by visitor | Map visitors |
| Google OAuth tokens | Refresh token for a connected Google Sheet (encrypted at rest by Supabase) | Platform users |
| Team invitations | Invitee email, invite status, expiry | Platform users |
| Admin audit events | User action type, metadata — no sensitive payloads | Platform users / admins |

### Processing location

Supabase projects are hosted on **AWS**. The region is chosen at project creation. Current environments:

| Environment | Region |
|-------------|--------|
| Staging | *[Record actual region — e.g. eu-west-1]* |
| Production | *[Record actual region — e.g. eu-west-2]* |

> **Action item:** Confirm and record your Supabase project region here. If EU data residency is required, ensure the project is in an AWS EU region.

### Legal basis & agreements

- Supabase is a **data processor** on behalf of Layercake Maps.
- Supabase provides a **Data Processing Agreement (DPA)** at [supabase.com/legal/dpa](https://supabase.com/legal/dpa).
- Supabase is **SOC 2 Type II** certified.
- Data in transit: TLS. Data at rest: AES-256 encryption.

---

## 2. Resend

**Role:** Transactional email delivery.

**What it is:** Resend is a US-based email API service used to send three types of email from the platform.

### Emails sent and data involved

| Email type | Trigger | Personal data in the email |
|------------|---------|---------------------------|
| **Contact form message** | A map visitor submits the contact form on a listing | Visitor name, visitor email, visitor phone (optional), message body; sent to listing's email address |
| **Team invitation** | A client owner or manager invites a colleague | Invitee email address; invite link |
| **Custom domain verification** (internal) | Client sets up a custom sending domain | No personal data — only domain name and DNS record metadata |

### Processing location

Resend processes email in **AWS us-east-1 (Northern Virginia, USA)**. The MX bounce-handling endpoint (`feedback-smtp.us-east-1.amazonses.com`) confirms this.

- Email content is in transit through Resend's infrastructure.
- Resend does not persistently store email body content beyond delivery.
- **There is no EU-region option with Resend.** If a client requires EU-only email processing, an alternative provider (e.g. Mailgun EU, Postmark EU, Brevo) would need to be evaluated.

### Legal basis & agreements

- Resend is a **data processor** on behalf of Layercake Maps.
- Resend provides a **DPA** — request via [resend.com/security](https://resend.com/security).
- Transfer mechanism for EU personal data: Standard Contractual Clauses (SCCs) via Resend's DPA.
- API keys: one **sending-only** key (`RESEND_API_KEY`) and one **full-access** key (`RESEND_ADMIN_API_KEY`) for domain management. Neither is stored in the browser.

### Client-facing note

When a client configures a **custom sending domain**, Resend registers that domain on its infrastructure. The domain name (not any personal data) is sent to Resend. DNS records are stored on Resend's servers for verification purposes.

---

## 3. Google Maps JavaScript API

**Role:** Rendering interactive maps in the browser.

**What it is:** Google's browser-side mapping library. It is loaded directly in visitors' browsers when they view an embedded map.

### Data involved

When the Google Maps JS library loads, Google receives:

- The visitor's **IP address** (standard HTTP request)
- The **referrer URL** (the page the map is embedded on)
- Usage metered against Layercake Maps' **API key**

**Layercake Maps does not send any user-supplied personal data to Google Maps.** Map coordinates, marker positions, and listing data are held in our own database and passed to the Google Maps library for rendering only.

### Processing location

Google Maps is a global service operated by **Google LLC (US)**. Data is processed under Google's standard infrastructure, which spans multiple regions including the EU.

### Legal basis & agreements

- Google is an **independent data controller** for usage data it collects from API requests.
- Governed by [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms).
- Google is certified under the **EU-US Data Privacy Framework**.

---

## 4. Google Geocoding API

**Role:** Converting a text address into latitude/longitude coordinates.

**What it is:** A server-side Google API called from Supabase Edge Functions (never from the browser). Used when a client imports listings via CSV or Google Sheets and addresses need to be geocoded.

### Data involved

Each geocoding request sends:

- A **street address string** from a listing (e.g. `"10 Downing Street, London"`)
- No name, email, or personal identifier is included in the request

If listing addresses belong to identifiable individuals (residential addresses), this constitutes processing personal data. For business directories, addresses are typically non-personal.

### Processing location

Google Geocoding API is operated by **Google LLC (US)**. Requests are made server-side from Supabase Edge Functions (not from visitor browsers).

### Legal basis & agreements

- Google is a **data processor** for geocoding requests under the [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms) and Google's DPA (available via Google Cloud Console).
- The API key used is server-side only (restricted by IP / Supabase function environment).

---

## 5. Google OAuth & Google Sheets

**Role:** Reading listing data from a client's connected Google Sheet for live sync.

**What it is:** An optional integration. A client can connect a Google Sheet as a data source for their directory. Layercake Maps obtains an OAuth access token and stores a refresh token to periodically re-sync the sheet.

### Data involved

| Data | What it is | Where stored |
|------|------------|--------------|
| **OAuth refresh token** | Long-lived credential allowing Layercake Maps to read the connected Sheet | Supabase database (`map_data_sources.refresh_token`); encrypted at rest |
| **Sheet content** | Listing data rows (name, address, phone, email, etc.) | Read at sync time; written into Supabase `listings` table |

The **client authorises** Layercake Maps to read their specific sheet. The OAuth scope is read-only for Google Drive/Sheets. No Google account personal data (name, profile picture, etc.) is stored beyond what is needed to identify the connected file.

### Processing location

Google OAuth and Sheets API requests are processed by **Google LLC (US)**, with infrastructure in multiple regions.

### Legal basis & agreements

- The **client is the data controller** for listing data in their Google Sheet.
- Layercake Maps acts as a **data processor** reading that data under the client's instruction.
- Governed by [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
- The refresh token must be treated as a credential. It is stored encrypted and is scoped only to the files the client explicitly authorised.

---

## 6. Stripe

**Role:** Subscription billing and checkout.

**What it is:** Stripe is used to initiate subscription checkout sessions. The billing flow is partially implemented.

### Data involved

When a client initiates checkout:

- Layercake Maps creates a **Stripe Checkout Session** server-side
- The client's browser is redirected to a **Stripe-hosted checkout page**
- Payment card data is entered directly on Stripe's page — **Layercake Maps never sees card numbers**
- Stripe returns a session result (success / cancel) to Layercake Maps

Stripe may collect: cardholder name, billing email, billing address, card details, and IP address — all governed directly by Stripe's privacy policy.

### Processing location

Stripe, Inc. is a **US company** with EU operations via Stripe Payments Europe, Ltd (Ireland). European card transactions are typically processed within the EU.

### Legal basis & agreements

- Stripe is an **independent data controller** for payment data.
- Stripe is **PCI DSS Level 1** certified.
- Stripe provides a DPA at [stripe.com/legal/dpa](https://stripe.com/legal/dpa).
- Stripe is certified under the **EU-US Data Privacy Framework**.

---

## 7. Vercel / GitHub Pages

**Role:** Hosting the frontend application.

**What it is:** The React SPA (browser app) is served as a static build from either Vercel or GitHub Pages. No application logic or user data is processed by the host — they serve static files.

### Data involved

The hosting provider receives:

- Visitor **IP addresses** (standard HTTP server logs)
- **User-agent** strings
- **Request paths** and **referrer URLs**

Layercake Maps does not have access to these server logs on GitHub Pages. On Vercel, logs are available in the Vercel dashboard and are governed by Vercel's data retention policy.

**No personal data submitted by users (forms, logins) passes through Vercel/GitHub Pages** — those requests go directly to Supabase.

### Processing location

- **Vercel:** Edge network, globally distributed including EU PoPs. HQ: San Francisco, USA. DPA available at [vercel.com/legal/dpa](https://vercel.com/legal/dpa).
- **GitHub Pages:** GitHub Inc. (US). Static file serving only. GitHub Privacy Statement applies.

---

## 8. Supabase Auth (email verification & password reset)

**Role:** Sending account verification and password reset emails.

**What it is:** Supabase Auth sends transactional emails (email verification link, password reset link) using either its built-in mailer or a configured custom SMTP provider.

### Data involved

- User **email address** is sent to the mail provider to deliver the verification or reset email.
- The email contains a **one-time token link** (no password).

### Processing location

Depends on the SMTP configuration in Supabase Auth settings:

| Config | Provider | Location |
|--------|----------|----------|
| Default (Supabase built-in) | Supabase's mail service | US |
| Custom SMTP | *[Record your SMTP provider here]* | *[Record region]* |

> **Action item:** Document your Auth SMTP configuration here.

---

## Summary table — personal data by third party

| Third party | Personal data shared | EU data processing | DPA available |
|-------------|---------------------|--------------------|---------------|
| **Supabase** | All platform user data, listing data, contact form submissions, engagement events | Depends on project region *(confirm)* | Yes |
| **Resend** | Contact form content (visitor name/email/message), invitee email | No — US only | Yes (via request) |
| **Google Maps JS** | Visitor IP, referrer URL (by browser) | Partial (Google global infra) | Google's standard terms |
| **Google Geocoding** | Listing addresses | No — Google global, US-routed | Via Google Cloud DPA |
| **Google OAuth/Sheets** | OAuth refresh token, sheet listing content | No — Google global, US-routed | Via Google Cloud DPA |
| **Stripe** | Billing email, payment card data (Stripe-hosted) | Yes — EU entity for EU transactions | Yes |
| **Vercel** | Visitor IP, user-agent, request paths | Partial (global CDN, EU PoPs) | Yes |
| **GitHub Pages** | Visitor IP, user-agent | No — GitHub US | GitHub Privacy Statement |

---

## Data not sent to any third party

The following data stays within Supabase (Layercake Maps infrastructure) and is not shared with external systems:

- User passwords (stored as hashes; never transmitted)
- Map design configuration (colours, pin styles, layout)
- Publication history and rollback data
- Admin audit event logs
- Team invitation records (beyond the invitee email sent via Resend)
- Sync history logs

---

## Retention

| Data | Default retention | Controlled by |
|------|------------------|---------------|
| User accounts & contacts | Until client account deleted | Layercake Maps admin |
| Listing data | Until client deletes or overwrites | Client |
| Contact form submissions | Indefinite (for client reporting) | Layercake Maps / client agreement |
| Map engagement events | Indefinite | Layercake Maps |
| Google OAuth refresh tokens | Until client disconnects the sheet | Client (via client portal) |
| Stripe session records | Per Stripe's policy | Stripe |
| Resend delivery logs | Per Resend's policy (typically 30 days) | Resend |

> **Action item:** Agree retention periods with legal counsel and encode them as deletion policies where necessary.

---

## When to update this document

Update this document when:

- A new third-party integration is added or removed
- An existing integration changes what data it receives
- A provider changes their data processing region or DPA terms
- A client requests details of sub-processors
- The privacy policy is being reviewed or updated

---

*Last updated: 2026-06-02. Maintained by the Layercake Maps engineering and privacy team.*
