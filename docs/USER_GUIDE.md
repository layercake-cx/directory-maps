# Directory Maps – User Guide

This guide explains how to use **Directory Maps** as a client: signing up, creating maps, importing data, publishing, and embedding your directory.

For a full product feature list (admin, analytics, integrations), see [FEATURES.md](./FEATURES.md).

---

## Overview

Directory Maps lets you build interactive, Google Maps–based directories. You can:

- Create one or more maps per organisation
- Import listing data via **CSV** or **Google Sheets**
- Design pins, groups, panels, and map style with a live preview
- **Publish** versioned snapshots and embed maps for visitors
- View **analytics** on how visitors use your published embed
- Manage **team** members (if you have permission)
- Configure a **custom email domain** for contact-form messages (optional)

**One account, one organisation:** each login can only belong to a single organisation. You cannot invite someone who already has a Directory Maps account to a second organisation.

---

## Getting started

### Sign up

1. Open the site homepage and choose **Sign up** (or go to `/#/signup`).
2. Enter your **Organisation name** (must be unique). A **client slug** is generated automatically (e.g. `acme-ltd`) for URLs.
3. Enter your **Email** and **Password**.
4. Click **Create account**.

If the organisation name is taken, choose another. **Confirm your email** when prompted — you must verify before accessing the client portal.

### Sign in

1. Go to `/#/login`.
2. Enter **Email** and **Password**.
3. Click **Sign in**.

Forgot your password? Use **Forgot password** on the login page.

---

## Client portal navigation

After sign-in you’ll see:

| Section | Path | Who can access |
|---------|------|----------------|
| **My Maps** | `/#/client` | All team members |
| **Team** | `/#/client/team` | Owners and managers |
| **Email** | `/#/client/email` | Users who can manage maps |

Sign out from the header when finished.

---

## Your maps

**My Maps** lists every map for your organisation.

- **New map** — Create a new directory map.
- Click a **map name** to open the **map designer** (live preview).
- From a map card you can open **Data**, **Stats**, or the designer.

---

## Creating a map

1. From **My Maps**, click **New map**.
2. Fill in:
   - **Map name** — e.g. “UK Office Locations”.
   - **Slug** — Used in URLs; can be auto-suggested from the name.
   - **Default lat / lng / zoom** — Starting map position.
   - **Show list panel** / **Enable clustering** — Visitor UI options.
3. Click **Create map**.

You’ll return to **My Maps**; open the new map to configure it.

---

## Map designer

The designer shows a **live preview** of your map. Use the header buttons to open settings panels:

| Panel | What you can change |
|-------|---------------------|
| **General** | Name, slug, default center/zoom, list panel, clustering (saves automatically as you edit) |
| **Pin Design** | Marker style (pin, rounded pin, dot), colour, custom pin image, drop shadow |
| **Panels** | Listing side panel layout and behaviour |
| **Groups** | Categories for listings and group styling (changes save automatically while editing) |
| **Map Style** | Presets, base map type, land/water/road colours, map detail levels, and map overlays |
| **Publish Map** | Publish, view history, rollback, embed URL, subscription |
| **Search** | How search works on the public embed |

Use **Publish Map** in the header when you’re ready to go live. Publishing creates a snapshot visitors see on the embed; you can roll back to earlier versions from the publish panel.

### Map Style panel

Inside **Map Style** you can now customise the map in five sections:

1. **Presets** — Pick a ready-made style (Roadmap, Silver, Dark, Muted, Atlas, Satellite, Hybrid, Terrain).
2. **Base type** — Switch between Roadmap, Satellite, Hybrid, and Terrain.
3. **Colours** — Set **Land**, **Water**, and **Roads** colours.
4. **Map detail** — Tune visibility for places, businesses, transport, road labels, and administrative labels.
5. **Overlays** — Turn **Traffic**, **Public transport routes**, **Bike lanes**, and **Terrain & contours** on/off (**Traffic is off by default**).

Changes appear in the live preview immediately and are saved as part of your map draft.

**Sub-navigation** (when editing a map):

- **Design** — Map designer (this page)
- **Data** — CSV upload and Google Sheets
- **Stats** — Visitor analytics (published embed only)

---

## Importing data

Open **Data** from the map sub-nav (`/#/client/maps/<id>/data`).

### CSV upload

1. **Download template** — CSV with expected columns.
2. Fill columns such as:  
   `name`, `address`, `postcode`, `country`, `lat`, `lng`, `website_url`, `email`, `phone`, `logo_url`, `notes_html`, `allow_html`, `group_name`, `is_active`.  
   **name** is required; leave `lat`/`lng` blank to geocode addresses (if enabled).
3. **Upload CSV** and choose your file.
4. Optionally enable **Geocode rows missing lat/lng**.
5. Click **Import**.

### Google Sheets

Connect a Google account, pick a **file in Google Drive** (Google Sheet or CSV stored in Drive), validate columns, and sync. To import a CSV from your computer without Drive, use the **Spreadsheet / CSV** tab instead. See [GOOGLE_SHEETS_SYNC.md](./GOOGLE_SHEETS_SYNC.md).

### Loaded Data (logo background per listing)

In **Data** (`/#/client/maps/<id>/data`), open the **Loaded Data** tab to set a background behind each listing logo:

1. Use the search field to filter by listing name or address.
2. Review each listing’s **ingestion method** (**Integration**, **CSV**, or **Manual**) and logo thumbnail preview.
3. Pick a swatch per row (**None**, **Light**, **Mid**, **Dark**) or use the custom colour picker.
4. Changes save immediately and appear in the listing details panel on your map preview and published map.

### Listings table

**Listings** (`.../listings`) shows all entries with search and filters.

---

## Publishing and embedding

1. Open the map designer and click **Publish Map**.
2. Add an optional publish note and confirm **Publish**.
3. Copy the **embed URL** from the publish panel (`/#/embed?map=<MAP_ID>`).
4. Use **Launch map** to open the live embed in a new tab.

Only **published** maps are visible on the embed.

---

## Analytics (Stats)

Open **Stats** from the map sub-nav for visitor engagement on your published embed. The dashboard includes daily charts, a conversion funnel, **Top listings** (interactions per listing), and **Top search queries**. See [MAP_ENGAGEMENT.md](./MAP_ENGAGEMENT.md).

---

## Team

Owners and managers can open **Team** (`/#/client/team`) to:

- View members and roles (Owner, Manager, Member), plus anyone with an **Invite pending**
- See each person’s **status** (Active, Invite pending, Awaiting verification, etc.) and **last logged in**
- **Send invitation email** to a colleague’s address
- **Cancel** a pending invitation if needed
- For **Members**, choose which maps they can access
- Change roles or remove members (owners only)

### Inviting someone

1. Enter their **email** and **role** (Manager or Member).
2. Click **Send invitation email**.
3. They receive an email: *“You’re invited to join …”* with a link to **set a password** and create their account.
4. They must sign up with the **same email** you invited.
5. After email verification, they log in and join your organisation automatically.

### When invitation is not allowed

You will see an error instead of sending email if:

| Situation | Message (typical) |
|-----------|-------------------|
| They already have a Directory Maps login | *This user already has an account. Each person can only belong to one organisation.* |
| They are on another organisation’s team | *This user already belongs to another organisation.* |
| They are already on your team | *This email is already on your team.* |
| Invite already pending | *A pending invitation already exists for this email.* |

Invitations expire after **7 days** — send a new one if needed.

---

## Custom email (optional)

Under **Email**, verify a domain so contact-form messages send from your organisation’s address. See [RESEND_EMAIL.md](./RESEND_EMAIL.md).

---

## Quick reference

| Action | Where |
|--------|--------|
| Sign up / Sign in | `/#/signup`, `/#/login` |
| View your maps | `/#/client` |
| Create a map | My Maps → New map |
| Import CSV / Sheets | Map → Data |
| Publish & embed URL | Map → Publish Map panel |
| View analytics | Map → Stats |
| Invite team member | `/#/client/team` → Send invitation email |
| Accept invite (invitee) | Link in email → create account and set password → automatic sign-in |

---

## Admin users

Users with **admin** access use `/#/admin` to manage customers, maps, and impersonation. Use impersonation to view a client’s portal as their organisation.

When an admin creates a customer in `/#/admin/clients/new`, they only need:

- Customer name
- Customer slug (or leave blank to auto-suggest)

From a customer’s **Users** tab, admins can add a user by entering:

- Email
- Name (required)
- Optional permissions (Manage maps, Manage users)

On submit, Directory Maps sends an invitation email that opens a create-account / set-password screen. The contact is linked to the customer after the invitee completes signup.

Admins can also remove users (including primary contacts) from the same list using the trash icon. Deleting requires typing `delete` to confirm.
If a user is associated with another customer, deletion is blocked and a warning above the table lists those customers.

In **Admin users** (`/#/admin/users`), open an admin user to see:

- **Details** tab (account and linked contacts)
- **Activities** tab (audit log events performed by that user)

Admins can also reset their own password from the **Admin sign-in** screen:

- Enter your admin email
- Click **Forgot password?**
- Use the reset email link to open `/#/reset-password` and set a new password

---

## Need help?

Contact your administrator or Layercake support. Ops: [DEPLOY.md](./DEPLOY.md), [RESEND_EMAIL.md](./RESEND_EMAIL.md).
