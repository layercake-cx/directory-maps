# Admin information architecture

Read with `nav.config.json`, which holds the same structure as data (labels, icons, routes, what exists today).

## 1. The shell has three navigation layers

| Layer | Element | Scope | Changes when |
| --- | --- | --- | --- |
| 1 | **Top bar** (52px) | Who and where: logo, workspace switcher, global search, support, account | You switch workspace |
| 2 | **Icon rail** (64px, dark) | Global sections of the current context | You switch context (client or platform) |
| 3 | **Feature panel** (272px, white) | Navigation inside the feature you are in | You enter a feature or a record |

A page with nothing to navigate inside (the organisation home) has **no feature panel**; the main area takes the width.

Level 4 record editors (the entry editor) keep the parent's feature panel and use **in-page tabs** for the record's own sections. Tabs are only used at this level.

## 2. Two contexts

| | Client workspace | Platform admin |
| --- | --- | --- |
| Who | Client users; Layercake staff working on a customer | Layercake staff only (`profiles.role = 'admin'`) |
| Top bar | Layercake teal `--lc-teal`. Staff also see a "Staff view" chip | Ink `--lc-ink` with a 3px teal underline |
| Switcher reads | Customer name (staff). Client users: plain text, no dropdown | "Platform admin" with shield icon |
| Rail | Home, My maps, Directories, Categorisations, Team, Messaging, Domains; staff-only **Customer account** at the bottom | Customers, All maps, All directories, Admin users, Leads, Logs, Deployments |

The header colour is the context signal. Never mix them.

## 3. Workspace switcher (staff only)

Opening the switcher shows, top to bottom: a search field (name or slug), a dark **Platform admin** item, the list of customer workspaces (current one ticked, plan shown), and "All N customers".

- Choosing a customer: client context for that customer, landing on its Home.
- Choosing Platform admin: platform context, landing on Customers.
- The Customers table's **Enter workspace** button does the same as choosing that customer.
- This is the only route between contexts. Do not add a second one (the old "Platform admin" shield in the client rail is removed).

## 4. Routing for staff inside a client workspace

Client impersonation was removed on 2026-08-05 and must not return. Today admins use `/admin/clients/:clientId/...` pages that mirror the client portal with shared components.

Keep that model: a staff client workspace is `/admin/clients/:clientId` + the same sub-path the client portal uses (for example `/admin/clients/:clientId/directories/:directoryId/entries`). Render those routes inside the **client** shell with the staff chip and Customer account rail item. Existing admin URLs must keep working (redirect if a path changes).

## 5. Page hierarchy (client context)

```
Level 0  Home (organisation dashboard)                  /client                       no panel
Level 1  Directories                                    /client/directories           panel: directories
Level 2  Directory (e.g. UK Associations) › Overview    /client/directories/:id       panel: directory
Level 3  Directory › Entries (or any other section)     /client/directories/:id/entries
Level 4  Entry editor                                   /client/directories/:id/entries/:entryId[/tab]
```

Entries is not a rail item. It lives inside a directory.

## 6. Directory feature panel

```
‹ All directories
UK Associations            (serif, 24px)
uk-associations.com ↗
──────────────
Overview
CONTENT       Entries (count) · Pages · Categories · Accreditations
EXPERIENCE    Design · Search & Discovery
ENGAGEMENT    Claims · Enquiries
INSIGHTS      Analytics
SETTINGS      General · SEO · Domain & Publishing · Integrations
```

Where today's tabs go:

| Today's tab | New home |
| --- | --- |
| Entries | Content › Entries |
| Pages | Content › Pages |
| (tag picker above entries table) | Content › Categories |
| Accreditations | Content › Accreditations |
| Branding, Entry Layout | Experience › Design |
| AI: Help me choose; Settings: location search | Experience › Search & Discovery |
| AI: content generation prompt, bulk generate | Content › Entries ("AI content" action) |
| AI: backfill missing metadata; Settings: SEO | Settings › SEO |
| Claims | Engagement › Claims (keep its Overview / Claims / Settings sub-tabs) |
| Email | Engagement › Enquiries |
| Settings: title, nav label; Archive, Delete | Settings › General (Archive and Delete in the page's "more" menu) |
| Publish; directory custom domain | Settings › Domain & Publishing |
| Settings: Analytics & Tracking (GA4, GTM) | Settings › Integrations |
| Prominent Links | Not in the nav. Being redesigned. Keep the editor reachable until then |
| (none) | Overview, Insights › Analytics: new |

## 7. Other panels

- **Directories (level 1):** heading + New; views All / Published / Not yet published / Archived; "Your directories" list; plan box at the foot.
- **Customer account (staff only, client context):** Customer details · Entitlements · Feature access (beta).
- **Customers (platform):** heading + New; views All / Founding Partner / Basic / With beta access (with counts); Recently viewed.
- **Logs (platform):** User activity · Error log · Sync log.
- **Map (not designed yet):** same pattern: map name, then Design · Data · Listings · Stats.

## 8. Page anatomy

Every main area follows the same order:

1. Breadcrumb (levels 2 to 4 only), 14px muted.
2. Page head: title (serif 40px) with status pills or a count, and actions on the right. One primary button per page. Destructive actions go in a "more" (⋯) menu.
3. Summary tiles (dashboards only): four across.
4. Content: cards, tables, forms.

## 9. Placeholders in the reference pages

`[N]`, `[DATE]`, `[NAME]`, `[PLAN]`, `[On / Off]` mean "bind real data here". The only real figures are the customer list (platform) and the 329 UK Associations entries. Entry table rows are illustrative.
