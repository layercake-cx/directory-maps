# Directory Maps – User Guide

This guide explains how to use **Directory Maps** as a client: signing up, creating maps, uploading data, and viewing your map entries.

---

## Overview

Directory Maps lets you build interactive, Google Maps–based directories. You can:

- Create one or more maps per organisation
- Upload listing data (e.g. locations, addresses, contact details) via CSV
- View and filter all map entries in the dashboard
- Embed or launch your map for visitors

---

## Getting started

### Sign up

1. Open the **Client portal** from the homepage (or go to **Client portal** in the header).
2. Click the **Sign up** tab.
3. Enter your **Organisation name** (e.g. “Acme Ltd”). This must be unique across the system.
4. The **Client slug** is generated automatically from your organisation name (e.g. `acme-ltd`). It is used in URLs and cannot be edited.
5. Enter your **Email** and **Password**.
6. Click **Create account**.

If your organisation name is already in use, you’ll see an error and need to choose a different name. After sign-up, confirm your email if required, then **Sign in** with the same email and password.

### Sign in

1. Open the **Client portal**.
2. Use the **Sign in** tab.
3. Enter your **Email** and **Password**.
4. Click **Sign in**.

---

## Your maps

After signing in you’ll see **Your maps**: a list of all maps for your organisation.

- **New map** – Create a new map.
- **Sign out** – Sign out of the client portal.
- Click a **map name** to open its dashboard.

---

## Creating a map

1. From **Your maps**, click **New map**.
2. Fill in:
   - **Map name** – e.g. “UK Office Locations”.
   - **Slug** – Used in embed URLs (e.g. `uk-office-locations`). You can leave it blank to use the suggested value from the map name.
   - **ID** – Optional internal identifier (default is a random ID).
   - **Default lat / lng / zoom** – Starting map position and zoom level.
   - **Show list panel** / **Enable clustering** – Display and behaviour options.
3. Click **Create map**.

You’ll be returned to **Your maps**; click the new map to open its dashboard.

---

## Map dashboard (tabs)

Each map has a dashboard with four tabs. Use **Save** (top right) to save changes before switching tabs if you’ve edited settings.

### Map details

- Edit **name**, **slug**, and **default** latitude, longitude, and zoom.
- Toggle **Show list panel** and **Enable clustering**.
- Click **Save changes** to update the map.

### Design

- **Marker style** – Pin, Dot, or Circle.
- **Marker colour** – Default colour for map pins (groups can override).

### Embed

- Copy the **Embed URL** to use this map in iframes or links.
- Use **Launch map** (in the header) to open the live map in a new tab.

### Data

- **Map entries** – Table of all listings on this map.
- **Search** – Filter by name, postcode, country, group, or ID.
- **All groups** – Filter by a specific group (if you use groups).
- **Active only** – Show only active entries (default on).
- **Refresh** – Reload entries from the server.
- **Upload data** – Go to the CSV upload page to add or update listings.

---

## Uploading data (CSV)

1. From the map dashboard, click **Upload data** (header or Data tab).
2. **Download template** – Get a CSV template with the expected columns.
3. Fill your spreadsheet with columns such as:  
   `name`, `address`, `postcode`, `country`, `lat`, `lng`, `website_url`, `email`, `phone`, `logo_url`, `notes_html`, `allow_html`, `group_name`, `is_active`.  
   **name** is required; leave `lat`/`lng` blank to have addresses geocoded (if geocoding is enabled).
4. **Upload CSV** – Choose your file.
5. Optionally enable **Geocode rows missing lat/lng** (requires a Google Maps API key to be configured).
6. Click **Import** to load the rows into the map.
7. Use **Done** to return to the map dashboard.

After importing, use the **Data** tab to search and filter entries.

---

## Quick reference

| Action              | Where to do it                          |
|---------------------|------------------------------------------|
| Sign up / Sign in   | Homepage → Client portal                 |
| View your maps      | Client portal (after sign in)            |
| Create a map       | Your maps → New map                      |
| Edit map settings   | Map dashboard → Map details / Design     |
| View all entries    | Map dashboard → Data tab                 |
| Search/filter       | Map dashboard → Data tab                 |
| Upload CSV          | Map dashboard → Upload data              |
| Open live map       | Map dashboard → Launch map               |
| Copy embed URL      | Map dashboard → Embed tab                |

---

## Admin users

If you have **admin** access, you can manage all clients and their maps via the **Admin** link in the header. The client portal remains for clients to manage their own maps and data.

---

## Need help?

If something isn’t working or you need a different organisation name or access, contact your administrator or the support contact provided by your organisation.
