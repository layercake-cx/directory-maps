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

### Public landing page

The site root (`/`) is a public, unauthenticated marketing page pitching the Founding Partner beta programme to prospective association customers — it is separate from the app shell. It links to a live example map (`/layercake/uk-associations-sample-map`) and to **Log in** / **Sign up**. Its "Apply for a founding partner spot" form is a HubSpot embedded form (portal `148819421`, form `9ab8dd2b-9c9d-4b98-af17-cadbc978a3a7`) — this is a pre-account lead-capture form, distinct from an in-app listing contact form. Submissions go directly to HubSpot, not to Directory Maps. The **Leads** admin page (`/admin/leads`) still shows leads captured before this change via the `beta_signups` table, but no longer receives new submissions — treat it as a historical record; current leads live in HubSpot.

### Event demo page

`/memcom-maps-demo` is a chromeless, full-screen embed of the `layercake/uk-associations-sample-map` sample map, built for display on a conference/event screen (e.g. memcom). It reuses the same map-embed rendering as `/embed` and the `/:clientSlug/:mapSlug` published-map URLs (no site header/footer, resolves the map via the `get_map_id_by_slugs` RPC), with a fixed white rounded overlay in the bottom-left corner containing a QR code (`src/assets/founding-partner-qr.png`) and a "Become a founding partner" CTA linking to `/#signup`. The overlay position is not configurable; if the underlying sample map's own publish settings change (e.g. list panel shown/hidden), the overlay may visually overlap it — this was a known, accepted trade-off when the page was built.

### Sign up

1. Open the site homepage and choose **Sign up** (or go to `/signup`).
2. Enter your **Organisation name** (must be unique). A **client slug** is generated automatically (e.g. `acme-ltd`) for URLs.
3. Enter your **Email** and **Password**.
4. Click **Create account**.

If the organisation name is taken, choose another. **Confirm your email** when prompted — you must verify before accessing the client portal.

### Sign in

1. Go to `/login`.
2. Enter **Email** and **Password**.
3. Click **Sign in**.

Forgot your password? Use **Forgot password** on the login page.

---

## Client portal navigation

After sign-in you’ll see:

| Section | Path | Who can access |
|---------|------|----------------|
| **My Maps** | `/client` | All team members |
| **Directories** | `/client/directories` | All team members *(beta — only if enabled for your organisation)* |
| **Categorisations** | `/client/categorisations` | Owners and managers *(beta — only if enabled for your organisation)* |
| **Team** | `/client/team` | Owners and managers |
| **Email** | `/client/email` | Users who can manage maps |

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

Your plan may cap how many maps you can create — the **New map** page shows "X of Y maps used" when a limit applies. Contact Layercake to upgrade if you've reached it.

---

## Directories

> **Beta feature.** Directories and Categorisations are still in development, so they're hidden by default. You'll see them only if your organisation has been given early access. If the **Directories** and **Categorisations** menu items aren't showing, ask your Layercake contact to enable them for your account. (Layercake staff see them automatically.)

**Directories** are separate from your maps — a browsable, structured list of entries (e.g. accredited suppliers, member firms) that isn't tied to a location on a map. Publishing, branding, and custom domains are available (see [Domains](#domains) below); categorisation-driven filtering on the published site is not built yet (see `docs/DIRECTORIES.md` for the full roadmap). A map can now use a directory as its live pin data source, including in its published embed (see [Directory as data source](#directory-as-data-source) below).

### Creating a directory

1. From **Directories**, click **New directory** (owners and managers only).
2. Fill in:
   - **Directory name** — e.g. "Accredited Suppliers".
   - **Web address (short name)** — used in the directory's future public URL; auto-suggested from the name.
   - **Description** (optional).
3. Click **Create directory**.

### Managing entries

Open a directory to see its entries table:

- **+ Add entry** / **Edit** — opens a full-page entry editor (no longer a modal), with tabs: **Basic Info** (name, address, postcode, country, group, website, email, phone, logo, active flag, and which contact fields show publicly once published), **Categories**, **Content** (notes plus evidence/media/accreditations/prominent links/product tiles), **Search & Metadata** (meta title/description/keywords/canonical URL/structured data type/sitemap priority/noindex, plus a **Social & AI** section for the social share title/description/image, Twitter card type, and an AI-facing summary), **Panel Style** (an optional image and background colour override for this entry's card on the directory homepage — e.g. a white logo that needs a dark background — with a live preview; leave blank to keep using the logo and the directory's own theme), and **Preview & Publish**. The last one is still a placeholder — a single-entry "publish just this entry" action is coming in a later phase; publish the whole directory from its own Publish panel to push Panel Style changes live in the meantime. Coordinates (latitude/longitude) aren't shown or editable — they're calculated automatically from the address.
- **Search** — filters entries by name or address (server-side, so it works across directories of any size).
- **Delete** — requires typing **DELETE** to confirm, since it can't be undone.
- **Group** — a simple, single-value category per directory (add new groups inline from the Basic Info tab). This is distinct from the richer, reusable categorisation model planned for a later phase.
- **Logo** — paste a hosted image URL, or (once the entry has been saved once) upload a PNG/JPG/WebP file directly (max 2 MB); uploading replaces any previous file-based logo.
- **Notes** use a rich text (WYSIWYG) editor — bold/italic/underline, headings, bullet/numbered lists, quotes and links. Anything else (scripts, embeds, other formatting) is stripped automatically when the entry is saved.

**Bulk actions:** tick entries' checkboxes (or the header checkbox to select everything on the current page) to reveal a bulk action bar — **Archive**/**Restore** several entries at once, or **Bulk tag…** to add or replace a categorisation's term(s) across the selection.

**CSV import:** click **Download CSV template** for a starter file with the seed columns plus one `category_<key>` column per categorisation that applies to entries (pipe-separate multiple term slugs, e.g. `healthcare|retail`). Click **Import CSV**, choose your file, review the preview, then import — this always adds to existing entries (matching on `id` when your file includes one); it never deletes what's already there. Unrecognised group names are created automatically; unrecognised categorisation terms are skipped with a warning rather than failing the import.

**Member access:** Owners and Managers always have full access. A Member can only open a directory's entries if an Owner/Manager has granted them access on the **Team** page (see below); otherwise they'll see a "you don't have access" message instead of the entries table.

### Publishing a directory

> **Beta within a beta.** Publishing makes your directory's pages generate as a real, crawlable public website. It currently only reaches customers who also have this specific piece enabled.

From a directory's page, the **Publish** panel (visible to everyone with access; only owners and managers can actually publish) shows whether the directory has been published, when, and a link to the live public page once it has been. Click **Publish** (optionally add a note) to make the directory and its entries live — this snapshots the directory's own settings and your categorisation taxonomy, but always shows the entries as they currently stand, so editing an entry after publishing goes live immediately without needing to publish again. Publishing history is kept as a list of versions; **Restore** on an earlier version publishes a new version with that version's settings back — it never deletes anything.

The published homepage has a real keyword search (matches by entry name or location — no account or API key needed) and, when entries have coordinates set, a pins-only map. Full natural-language search and clickable filter chips are planned but not built yet — the filter chips shown on the homepage don't do anything yet.

**If publishing succeeds but the public page doesn't work:** the panel will now tell you directly if page generation was skipped or failed (previously this failed silently). The most likely reason: Layercake staff can see and use the Directories UI for any customer without it being explicitly turned on for them, but generating a real public page still requires the **Directories** toggle under that customer's **Feature access (beta)** section in the admin console to be switched on for that specific customer. Turn it on, then publish again.

### Branding

From a directory's page, the **Branding** panel (owners and managers only) sets the colours and fonts applied to the directory's published pages — the header, homepage, and every entry page now share one consistent, full-width design.

- **Theme preset**: pick a starting point — **Natural** (earthy sage & terracotta, the default), **Midnight** (dark, premium), **Coastal** (airy blues & teal), **Heritage** (warm burgundy & gold, serif-forward), or **Slate** (minimal neutral grey). Choosing a preset fills in every colour and font field below it.
- **Primary colour**, **accent colour**, **background colour**, and **logo URL** are shown up front; click **Advanced colours…** to fine-tune every individual colour (surfaces, text, borders, badge colours) and the heading/body fonts — a preset is a starting point, not a limit, so any field can be changed afterward.
- Click **Save branding**, then **Publish** again for it to appear on the live site — saving branding doesn't publish automatically.

Font, corner radius, and favicon controls beyond the heading/body font pickers aren't built yet.

### Entry layout

From a directory's page, the **Entry layout** panel (owners and managers only) controls the order of the sections (blocks) on every entry's published page: logo, name, address, contact details, hero image, photo gallery, accreditation badges, notes, evidence, product tiles, links, and one block per categorisation that applies to entries (shown as clickable tag chips).

- **Drag a block** to reorder it, or click **Remove** to leave it out entirely — removing a block only hides that section; the underlying data (e.g. notes) is kept and reappears if you add the block back later.
- **+ Add a block** adds one you've previously removed, or a categorisation's tag block.
- The **live preview** on the right shows a real entry from the directory (or a placeholder if it has none yet) reflecting your unsaved changes.
- Click **Save layout**, then **Publish** again for it to reach the live site.
- **Additional templates**: click **+ New template** to create a layout that only applies to a specific **group** or **category term** — e.g. a different page layout for entries tagged "Healthcare". Only one template can target a given group or term; entries with no matching template use the **Default** layout. Switch between templates using the tabs above the block list.

A directory that has never opened this panel keeps its original section order — nothing changes until you save a layout here.

### Archiving or deleting a directory

From a directory's page (owners and managers only):

- **Archive** — hides the directory from your list; entries are kept. If a map uses this directory as its live pin source, archiving does **not** remove it from that map's public embed — you'll see a warning naming the map(s); archive or delete the map itself to take it out of public view.
- **Delete** — permanently removes the directory and all its entries. Requires typing **DELETE** to confirm. If a map uses this directory as its live pin source, you'll see a warning naming the map(s) — deleting the directory removes that link and the map reverts to being manually-edited data, rather than losing its pins with no explanation.

### Categorisations

**Categorisations** (`/client/categorisations`, owners and managers only) are reusable taxonomies — e.g. "Sector" or "Region" — shared across every directory you own. They're separate from a directory's simple **Group** field:

- **Group** is per-directory, single-value, and drives the CSV import `group_name` column.
- A **categorisation** can apply to directory entries, whole directories, or both, and an entry/directory can carry any number of terms from it.

Create a categorisation, give it a label and a set of terms (each with an optional colour), and choose what it applies to. **Applies to** can't be changed after creation — delete and recreate it if you need to. Archiving hides a categorisation without losing its tags; permanent deletion (typing **DELETE** to confirm) removes the categorisation, its terms, and every tag using it.

Once a categorisation exists, its terms appear as a checkbox picker:
- On a directory's page, to tag the whole directory.
- On an entry's create/edit form, to tag that entry.

Filtering a published directory by these terms, and other publishing/branding features, are not built yet (see `docs/DIRECTORIES.md`).

### Entry details: evidence, media, accreditations, links and product tiles

Open an existing entry (**Edit**) to see these below the main form — they're not available until the entry has been saved once, since they attach to the entry's own record:

- **Evidence** — record a claim (e.g. "No riding") with an optional value, source URL, date checked, confidence (Verified / Unverified / Disputed), and note. Where something couldn't be verified, record that rather than leaving it blank.
- **Media** — upload gallery photos (PNG/JPG/WebP, max 5MB). Alt text is required before you can upload. Mark one image as the **hero** image.
- **Accreditations** — a checkbox list of the accreditation schemes your directory has defined (see below); tick to grant, untick to remove. Nothing to check if the directory hasn't defined any schemes yet.
- **Prominent links** — this entry's own link tiles (distinct from the directory-level ones below), e.g. a booking page or brochure. Primary/secondary styling, open-in-new-tab, and a sponsored/affiliate flag are all set per link.
- **Product tiles** — external booking cards (e.g. a Viator listing): title, image, price, currency, rating, provider, and a destination URL. These never affect where an entry appears in search or listings.
- **Show publicly** checkboxes (in the main form) control which contact fields — phone, email, website, address — will appear once the entry is published; there's no public page yet, so these have no visible effect today.

### Directory-level accreditation schemes and prominent links

From a directory's page (owners and managers only), above the entries table:

- **Accreditation schemes** — define the badges entries can hold (name, issuing body, badge image, description, verification note). Archiving a scheme hides it without losing which entries hold it; deleting it removes it from every entry that holds it.
- **Prominent links (directory homepage)** — link tiles for the directory as a whole, separate from any single entry's own links.

---

## Map designer

The designer shows a **live preview** of your map. Use the header buttons to open settings panels. The preview omits the visitor zoom/fullscreen control so it doesn’t cover **Map Settings**; a small zoom-level readout stays bottom-left while you set the default centre and zoom. Published embeds still show the full zoom controls for visitors.

| Panel | What you can change |
|-------|---------------------|
| **General** | Name, slug, **description**, default center/zoom, list panel, map title, clustering (saves automatically as you edit) |
| **Pin Design** | Marker style (pin, rounded pin, dot, custom icon), size, colour, border, favicon overlay, drop shadow — previews match the actual map size |
| **Panels** | Listing side panel layout and behaviour |
| **Groups** | Categories for listings; per-group style overrides (style, colour, border, icon) — drop shadow always inherits from Pin Design |
| **Map Style** | Presets, base map type, land/water/road colours, map detail levels, and map overlays |
| **Filters** | Create custom, filterable fields (e.g. Sector, Languages spoken); manage their options; choose which appear in the published search bar and how |
| **Publish Map** | Publish, view history, rollback, embed URL, subscription |
| **Search** | Upload a **logo**, style the search panel (background colour & transparency, **font colour**, listing background, border, and transparency), and set **Display options** (continent filter, Key). Shows a read-only summary of your custom filter fields with a link to the **Filters** panel |

**Custom Icon pins:** upload your own SVG or PNG (max 200KB) instead of a built-in shape. It's shown exactly as uploaded — colour, border and drop shadow don't apply to it, and small/medium/large sizing still works. Groups can upload their own custom icon too, independent of the map's default.

Use the **Publish** button in the top navigation bar when you’re ready to go live. The button turns amber when there are unpublished draft changes. Publishing creates a snapshot visitors see on the embed; you can roll back to earlier versions from the publish panel.

### Map Style panel

Inside **Map Style** you can now customise the map in five sections:

1. **Presets** — Pick a ready-made style (Roadmap, Silver, Dark, Muted, Atlas, Satellite, Hybrid, Terrain).
2. **Base type** — Switch between Roadmap, Satellite, Hybrid, and Terrain.
3. **Colours** — Set **Land**, **Water**, and **Roads** colours.
4. **Map detail** — Tune visibility for places, businesses, transport, road labels, and administrative labels.
5. **Overlays** — Turn **Traffic**, **Public transport routes**, **Bike lanes**, and **Terrain & contours** on/off (**Traffic is off by default**).

Changes appear in the live preview immediately and are saved as part of your map draft.

### Filters panel

**Filters** let you add your own filterable metadata to a map — separate from Groups. For example a supplier directory might add **Sector**, **Languages spoken**, or **Membership tier**. Visitors can then narrow the map and list by those values.

1. **Create a field** — click **New filter field**, enter a **Label**, and pick a **type**:
   - **Single choice** — the listing has exactly one value (shown to visitors as a dropdown, checkbox list, or typeahead).
   - **Multiple choice** — the listing can have several values; visitors can select more than one.
   - **Free text** — a free-text tag visitors filter with a type-to-search box.
2. **Key** — each field has a short **key** (auto-generated from the label). This is the column name used in CSV/Sheet imports (`filter_<key>`). The key can't be changed once options exist, so imports keep matching.
3. **Options** — for single/multiple choice fields, add the option list (each with an optional colour). You can also let them build themselves: importing via CSV or Google Sheets **creates any new option automatically** from the values in the sheet, so you don't have to type every category by hand. Option labels can be renamed freely; the underlying import value stays stable. In the published search bar, only options that at least one listing actually uses are shown — empty options (and any select field with no populated options) are hidden automatically.
4. **Show in search bar** — turn this on for each field you want visitors to see, and choose the **control** (dropdown, checkbox list, or typeahead). Only valid combinations are offered (e.g. dropdown isn't available for multiple-choice fields).
5. **Order** — use the up/down arrows to set the order fields appear in the search bar.
6. **Archive / Delete** — archive hides a field without losing its data; delete (type-to-confirm) permanently removes the field, its options, and all listing tags.

Filter fields, options, and display settings follow the **draft → publish** cycle: they appear in your live preview immediately but only reach visitors when you **Publish**. Matching within one field is "any of" (OR); across different fields a listing must match **all** active filters (AND) — the same behaviour as group and continent filters.

Tag listings with filter values in three ways: individually (the **Data → Manual entry** editor), in bulk (select rows in the manual table, then **Bulk edit filters**), or via **CSV / Google Sheets** using `filter_<key>` columns.

### Co-located pins (same address)

When two or more listings share the exact same address, the map handles them automatically:

- At lower zoom levels they appear as a **cluster** showing the count.
- Clicking the cluster **zooms to level 17** and then **fans the pins out** in a circle with connecting lines so each one is individually clickable.
- If you are already at zoom 17 or above, clicking the cluster fans them out immediately.
- Click any spread pin to open its listing. Click the map background or zoom out to collapse the fan.

### Search panel (published map)

The search panel sits flush to the **top-left** of the published map, full height, and is laid out top to bottom as:

1. **Logo** — the image you upload in the **Search** settings panel (optional).
2. **Title** — your map name.
3. **Description** — the text from the **General** panel's Description field (only shown if set).
4. **Search & filter** — a search box (find listings or jump to a place/location), plus **filter lozenges** for each group. Tap a lozenge to show only that group on the map and in the list; tap again to clear. Lozenges use each group's colour and border. When the **continent filter** is enabled, a second row of continent chips appears (derived automatically from each listing's country); these combine with the group filters. Any **custom filter fields** you set to show in the search bar (see **Filters panel**) appear here too, as dropdowns, checkbox lozenges, or type-to-search boxes.
5. **Key** *(optional)* — every group listed in your chosen group order with a colour square.
6. **Listings** — all listings in **alphabetical order**, each showing the logo (left), organisation name, city and country, and its group label. This list scrolls to the bottom of the screen.

**Styling the panel (Search settings):**

- **Logo** — Upload an SVG, PNG, JPG or WebP (max 500 KB) with a live preview; use **Remove** to clear it.
- **Background colour** and **Background transparency** — the panel's background.
- **Font colour** — text colour for the title, description, section labels, filter labels, inactive filter tabs (lozenges), and the Key. Does **not** change listing card text (those stay dark on the listing background).
- **Search listing background colour**, **Search listing border**, and **Search listing transparency** — the appearance of each listing card.
- **Display options** — toggle **Display continent filter** (off by default) and **Display Key** (on by default) on or off.

All Search and Description settings save automatically to your draft and go live when you **Publish**.

**Sub-navigation** (when editing a map):

- **Design** — Map designer (this page)
- **Data** — CSV upload and Google Sheets
- **Stats** — Visitor analytics (published embed only)

---

## Importing data

Open **Data** from the map sub-nav (`/client/maps/<id>/data`).

### CSV upload

1. **Download template** — CSV with expected columns.
2. Fill columns such as:  
   `name`, `address`, `postcode`, `country`, `lat`, `lng`, `website_url`, `email`, `phone`, `logo_url`, `notes_html`, `allow_html`, `group_name`, `is_active`.  
   **name** is required; leave `lat`/`lng` blank to geocode addresses (if enabled).  
   If the map has custom **filter fields**, the template also includes a `filter_<key>` column per field. Enter the option value(s) for each listing; separate multiple values with a pipe (`|`). You don't need to pre-create the options first — any value that isn't already an option is **added automatically** on import (the import summary tells you how many new options were created).
3. **Upload CSV** and choose your file.
4. Optionally enable **Geocode rows missing lat/lng**.
5. Click **Import**.

### Google Sheets

Connect a Google account, then click **Choose a file from Google Drive** to open Google's own file picker and select a Sheet, CSV, or Excel file from your Drive. The app only gets access to the file you pick — not your whole Drive. Validate columns, then sync. To import a CSV from your computer without Drive, use the **Spreadsheet / CSV** tab instead.

Under **Auto-sync schedule**, choose **Off** (manual only) or **Daily**, then pick the time of day (shown in your local time) when the sync should run each day. See [GOOGLE_SHEETS_SYNC.md](./GOOGLE_SHEETS_SYNC.md).

### Manual entry

On **Data** (`/client/maps/<id>/data`), open **Manual entry** to add, edit, or delete individual listings. Use the **Filter by name or address…** field above the table to narrow a long list. If Google Drive sync is connected, disconnect it first — manual editing is locked while sync is active.

When you change the **Address** (and leave the field, or save), latitude and longitude update automatically from geocoding. You can still override the coordinates manually if needed.

### Directory as data source

*(Requires the Directories beta — see above.)* On **Data**, the **Directories** tab lets a map read its pins live from one of your directories instead of its own listings — pick a directory and click **Use this directory**, or click **Build a directory from this map** to copy this map's own groups and listings into a brand-new directory first (you'll review and publish it, then come back here to attach it). The Directories tab is always open, even if a Google Sheets sync is currently active — attaching a directory automatically disconnects that sync, since a map is either self-authored or directory-sourced, never both. There's no separate sync step once attached: the map's published embed shows the directory's published entries as they currently stand, and updates automatically the next time the directory is published — not on every draft edit. **Manual entry**, **Upload CSV**, and **Sync data** lock while a directory is linked; click **Disconnect** on the Directories tab to revert the map to its own listings. Note: custom filter fields aren't available for a directory-sourced map yet, since directory entries don't have an equivalent to map filter fields.

### Loaded Data (logo + logo background per listing)

In **Data** (`/client/maps/<id>/data`), open the **Map data** tab to set a logo and its background for each listing:

1. Use the search field to filter by listing name or address.
2. Review each listing’s **ingestion method** (**Integration**, **CSV**, or **Manual**) and logo thumbnail preview.
3. Pick a swatch per row (**None**, **Light**, **Mid**, **Dark**) or use the custom colour picker for the logo background.
4. If the listing has no logo yet, the **Logo** column shows an **Upload** control — pick an SVG, PNG, JPG or WebP (max 500 KB) to use as that listing's logo. If the listing already has a logo URL (e.g. from a CSV import or Google Sheets sync, or a URL typed in **Manual entry**), that URL always takes precedence and the upload control is hidden; clear the URL in **Manual entry** first if you want to upload a file instead.
5. Changes save immediately and appear in the listing details panel on your map preview and published map.

### Listings table

**Listings** (`.../listings`) shows all entries with search and filters.

### Sync History tab

If your map has had at least one Google Sheets sync attempt, a **Sync History** tab appears on the Data page (`/client/maps/<id>/data`).

The table shows each sync run with:

| Column | Description |
|--------|-------------|
| Started | When the sync began |
| Duration | How long it took (e.g. "3s", "1m 12s") |
| Status | Success, Warning, Error, or Running |
| Provider | Always "google_sheets" for now |
| Total rows | Rows imported |
| Inserted | New rows added |
| Updated | Existing rows updated |
| Error | First 80 characters of any error message |

Click a row to expand it and see the full error code, message, and raw error detail.

Pagination: 100 rows per page, with Prev / Next controls and a "Page X of Y" indicator.

### Sync error alert on the dashboard

If any sync run has failed for your organisation, a red **Sync errors detected** alert appears at the top of **My Maps** (`/client`). Each line shows the map name, how long ago the failure occurred, and a link directly to the Sync History tab for that map.

---

## Publishing and embedding

1. Open the map designer and click **Publish** in the top navigation bar (turns amber when changes are pending).
2. Add an optional publish note and confirm **Publish**.
3. Copy the **embed URL** from the publish panel (e.g. `/your-org/your-map` or `/embed?map=<MAP_ID>`). The live embed shows only the map — no Layercake header or footer.
4. Use **Launch map** to open the live embed in a new tab.
5. Paste the **embed code** on your site. Include `allowfullscreen` on the `<iframe>` so visitors can expand the map to the full browser window (without it, fullscreen only fills the iframe box).

Only **published** maps are visible on the embed.

**Fullscreen zoom:** Normally the map ignores mouse-wheel/trackpad scrolling so the surrounding page can still scroll (visitors zoom with the +/− buttons, or Ctrl/⌘ + scroll). When a visitor enters **fullscreen** (the ⛶ button), the standard Google Maps gestures take over — scroll-to-zoom, pinch-to-zoom and one-finger pan all work — and revert automatically on exit.

---

## Analytics (Stats)

Open **Stats** from the map sub-nav for visitor engagement on your published embed. The dashboard includes daily charts, a conversion funnel, **Top listings** (interactions per listing), and **Top search queries**. See [MAP_ENGAGEMENT.md](./MAP_ENGAGEMENT.md).

---

## Team

Owners and managers can open **Team** (`/client/team`) to:

- View members and roles (Owner, Manager, Member), plus anyone with an **Invite pending**
- See each person’s **status** (Active, Invite pending, Awaiting verification, etc.) and **last logged in**
- **Send invitation email** to a colleague’s address
- **Cancel** a pending invitation if needed
- For **Members**, choose which maps they can access, and — if Directories is enabled for your organisation — which directories they can access (checkboxes granting entry-level view and edit access; there's no view-only tier yet)
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

## Messaging

The **Messaging** page (`/client/email`) has two tabs: **Settings** and **Sent messages**.

### Settings

Use **Settings** to control whether visitors can send messages to directory listings, and which sender address those messages come from.

Messaging requires the **Professional plan or above**. On the Basic plan, the toggle is disabled with a note to upgrade; contact Layercake to change your plan.

#### Enable messaging

At the top of the tab there is an **Enable messaging** toggle.

- **Off (default):** the "Send message" button is hidden on all your published maps, regardless of what email addresses your listings contain.
- **On:** the button appears on listings that have an email address.

When you turn messaging on you must also set a **prompt message** — a short line of text shown above the contact form in the map (e.g. *"Complete the form below and we’ll pass your message on."*). This field is required before you can save.

#### Email subject and opening message

Under **From address**, you can customise the subject line and the plain-text opening line of contact emails sent to listing addresses.

**Email subject** (required)
- Use `{listing}` where you want the listing name to appear.

**Email opening message** (optional)
- Shown at the top of the email body, above the visitor’s name and message.
- Use `{listing}` for the listing name.
- Leave blank to omit an opening line from the email.

Click **Save** with your display name and email address to store both fields.

#### Test mode

Use **Test mode** when you want to try the contact form without emailing real listing addresses.

- **On (default for new organisations):** the Send message form on your published embed shows a test banner and sends messages to the **test recipient email** you enter, not to the listing’s address.
- **Off:** messages go to each listing’s email address. Turn test mode off when you are ready to go live.

Click **Save test mode settings** after changing the toggle. The change applies on published embeds immediately — you do not need to republish the map.

#### Custom sending domain (optional)

By default, messages are sent from the platform’s address. To send from your own address (e.g. `hello@yourcompany.com`):

1. Under **From address**, enter your display name and email address. Click **Save**, or skip Save — **Set up domain** saves the address automatically.
2. Under **Domain & DNS**, click **Set up domain**. Resend registers your domain and generates DNS records. If something goes wrong, a message appears directly under the button.
3. **Add the DNS records** shown to your DNS provider (where you registered or host your domain — often Cloudflare, GoDaddy, Namecheap, etc.):
   - Use the **copy button** next to each value to avoid transcription errors.
   - DNS propagation can take up to 48 hours, though it’s usually minutes.
4. Click **Verify DNS settings**. When the status badge turns green ("Verified"), messages will send from your address.

If someone else manages your DNS (IT support, web agency, etc.), click **Setup instructions** (shown while verification is pending) to copy a ready-made email with all required DNS records.

**DMARC (recommended):** For the strongest deliverability, also add a `TXT` record at `_dmarc` with value `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`. DMARC is not required for verification but protects your domain from spoofing.

Until your domain is verified, messages send from the platform email address. If you have set a **Display name**, that name is shown as the sender instead of the platform default.

### Sent messages

Open the **Sent messages** tab to review contact form submissions from all your maps, newest first. Each row shows when the message was sent, which map and listing it relates to, the visitor’s details, the listing email it was sent to, and delivery status.

Click a message preview to expand the full text. If email delivery failed, the row is marked **Send failed** and you can view the error detail.

See also: [RESEND_EMAIL.md](./RESEND_EMAIL.md).

---

## Domains

The **Domains** page (`/client/domains`) lets you register your own domain or subdomain and publish a map or a directory to it. Once verified: the root of your domain shows the published entity's landing page — for a map, that's the SEO-friendly listing page, with `/map` showing the full interactive map (also usable as an iframe source elsewhere); for a directory, that's the directory's own landing page. Either way, each listing/entry gets its own page at the root.

Custom domains for **maps** require the **Professional plan or above** — on the Basic plan, that option is unavailable and the section shows a note to upgrade. Custom domains for **directories** are included with early access to the Directories beta — no separate upgrade needed while that feature is in beta.

### Add a domain

1. Choose which **map or directory** this domain will publish, from the **Publishes** dropdown (each domain publishes exactly one map or directory — register a second domain if you want a different address for another one).
2. Enter the **domain or subdomain** you own, e.g. `directory.yourcompany.com` or a root domain like `yourcompany.com`. Don't include `https://` or a trailing path.
3. Click **Add domain**. Two DNS records appear — a `TXT` record (proves you own the domain) and a routing record. **A root/apex domain** (e.g. `yourcompany.com`) gets an `A` record; **a subdomain** (e.g. `directory.yourcompany.com`) gets a `CNAME` record — DNS doesn't allow a literal CNAME on a root domain, so the record type differs depending on which you use.

### Verify a domain

1. Add both records shown to your DNS provider (wherever you manage DNS for that domain — often Cloudflare, GoDaddy, Namecheap, your IT team, etc.). Use the **copy button** next to each value to avoid transcription errors. **If your provider offers a "proxy" toggle for the routing record (Cloudflare calls this the orange cloud), turn it off** — set it to "DNS only." A proxied record hides the real destination from our verification check and it will never succeed.
2. Click **Verify DNS settings**. This checks DNS ownership immediately, then connects the domain to hosting — that second part can take a minute or two the first time. DNS propagation itself can take anywhere from a few minutes to 48 hours depending on your provider.
3. When the status badge turns green ("Active"), your domain is live.

### Remove a domain

Click **Remove** on a domain's card. This can't be undone — you'd need to add it again and re-verify from scratch.

---

## Quick reference

| Action | Where |
|--------|--------|
| Sign up / Sign in | `/signup`, `/login` |
| View your maps | `/client` |
| Create a map | My Maps → New map |
| Add a map description | Map → Design → General → Description |
| Upload search-panel logo & style it (incl. font colour) | Map → Design → Search |
| Create a custom filter field | Map → Design → Filters → New filter field |
| Show a filter field in the search bar | Map → Design → Filters → Show in search bar |
| Tag a listing's filter values | Map → Data → Manual entry → edit listing → Filters |
| Bulk-tag filter values | Map → Data → Manual entry → select rows → Bulk edit filters |
| Search manual listings | Map → Data → Manual entry → Filter by name or address |
| Import CSV / Sheets | Map → Data |
| Publish & embed URL | Map → Publish Map panel |
| View analytics | Map → Stats |
| Review sent contact messages | `/client/email` → Sent messages |
| Enable messaging | `/client/email` → Settings → Enable messaging toggle |
| Customise contact email subject and opening line | `/client/email` → Settings → From address → Email subject / Email opening message → Save |
| Turn test mode off for live contact emails | `/client/email` → Settings → Test mode → Save test mode settings |
| Configure custom sending domain | `/client/email` → Settings → Domain & DNS |
| Copy DNS setup email for IT supplier | `/client/email` → Settings → Domain & DNS → Setup instructions |
| Add a custom domain for a map or directory | `/client/domains` → Add domain |
| Verify a custom domain | `/client/domains` → Verify DNS settings |
| Invite team member | `/client/team` → Send invitation email |
| Accept invite (invitee) | Link in email → create account and set password → automatic sign-in |

---

## Admin users

Users with **admin** access use `/admin` to manage customers and their maps. Each customer is managed from the admin customer pages (`/admin/clients/:id`), which mirror the client portal (maps, directories, categorisations, users, messaging, domains).

**Navigation:** The dark top bar is platform admin only (Customers, Maps, Admin Users, Leads, Logs, and so on). **Logs** is a dropdown containing **User activity**, **Error log**, and **Sync log**. **Leads** lists founding-partner enquiries submitted via the public landing page (name, email, organisation, submission date), newest first; admins can update each lead's status inline (**To be actioned**, **In progress**, **Successful**, **Lost**). When you open a customer (`/admin/clients/:id`), a second strip shows **Maps**, **Customer details**, **Users**, and **Messaging**. When you edit one of that customer’s maps (`/admin/clients/:id/maps/:mapId`), a map sub-nav appears below the breadcrumb trail — **Design**, **Data**, **Stats**, and **Publish Map** — matching the client portal layout.

When an admin creates a customer in `/admin/clients/new`, they only need:

- Customer name
- Customer slug (or leave blank to auto-suggest)

On a customer’s **Messaging** tab (`/admin/clients/:id`), admins have the same controls as the client portal: **Settings** (enable messaging, prompt, test mode, from address, DNS) and **Sent messages** (contact form log for that organisation).

On a customer's **Maps** tab, **New map** now matches the client-portal create-map form exactly (map name, web address/slug, a place search that sets the default centre/zoom, fine-tune lat/lng/zoom, list panel and clustering options). If the customer is already at their plan's map limit, clicking **New map** shows a closeable "Plan limit reached" dialog instead of opening the form — the admin isn't taken to the create-map page at all in that case.

From a customer’s **Users** tab, admins can add a user by entering:

- Email
- Name (required)
- Optional permissions (Manage maps, Manage users)

On submit, Directory Maps sends an invitation email that opens a create-account / set-password screen. The contact is linked to the customer after the invitee completes signup.

Admins can also remove users (including primary contacts) from the same list using the trash icon. Deleting requires typing `delete` to confirm.
If a user is associated with another customer, deletion is blocked and a warning above the table lists those customers.

In **Admin users** (`/admin/users`), open an admin user to see:

- **Details** tab (account and linked contacts)
- **Activities** tab (audit log events performed by that user)

Admins can also reset their own password from the **Admin sign-in** screen:

- Enter your admin email
- Click **Forgot password?**
- Use the reset email link to open `/reset-password` and set a new password

---

## Need help?

Contact your administrator or Layercake support. Ops: [DEPLOY.md](./DEPLOY.md), [RESEND_EMAIL.md](./RESEND_EMAIL.md).
