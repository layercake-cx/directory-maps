# Patterns: processing, Ask Pip, behaviour rules

Visual references: `reference/30-pattern-processing.html`, `reference/31-pattern-ask-pip-drawer.html`, `reference/32-pattern-ask-pip-states.html`. The "before" screenshot is `assets/before-publishing.png`.

---

## 1. Processing and progress

### 1.1 The problem

Background work (publishing, page generation, AI bulk runs, metadata backfill, Google Sheets sync, CSV import, geocoding) is shown today as 12px, 70%-opacity text with an hourglass emoji, often next to a green "success" line that reads as finished, while the trigger button stays enabled. Users can't tell that work is happening, how far along it is, or whether they can leave.

### 1.2 Rules

1. **Timing decides the surface.**
   - Under ~1s: no indicator.
   - ~1–10s and tied to one control (Save, single AI draft): the control's loading state only (`Button loading`, `AIButton` loading).
   - Over ~10s, unknown length, or server-side: **JobCard** on the owning page **and** the **TaskIndicator** in the top bar. Directory jobs also update **PublishStatus** in the side panel.
2. **Say whether people can leave.** Server jobs: "You can leave this page; we'll keep going." Work running in the browser: KeepOpenBanner with "Keep this tab open" plus a leave guard.
3. **Block conflicting actions, with a reason.** While a job runs, the action that would start another conflicting job is disabled with text: "Publishing is paused until version 120 is live." Unrelated editing stays available.
4. **Always show elapsed time** from the start. Show "about N min left" only when there is a real basis (processed/total with a measured rate after at least 10% or 20s). Never invent estimates.
5. **Finish loudly, fail persistently.** Done: the JobCard turns green with the outcome and next step; if the user is elsewhere in the app, also a Toast and the TaskIndicator flashes green. Failed: red JobCard that says what is still live and offers Try again; stays until dismissed or retried; TaskIndicator turns red.
6. **No emoji, no colour-only status, no 12px status text.**

### 1.3 Architecture

Add to `src/components/jobs/` (or `src/lib/jobs/` for non-UI):

- **`JobsProvider`** (mounted inside `AppShell`): holds the list of active and recently finished jobs for the current workspace (client id or platform). Exposes `useJobs()` → `{ jobs, register(job), dismiss(id) }`.
- **`useJob(kind, directoryId)`**: wraps the polling that each panel does today, returning a normalised job object. Polls every 3s while running (the existing interval), stops when not running. Registers itself with `JobsProvider` so the top bar can show it from any page. Server status is the source of truth, so jobs survive reloads and appear for jobs started in another tab.
- **Job kinds and their sources** (all exist today):

| `kind` | Status function | Fields | Determinate? | Steps |
|---|---|---|---|---|
| `publish` (also restore, regenerate) | `getDirectorySiteGenerationStatus` (`lib/directoryPublications.js`) | `site_generation_status`, `site_generation_started_at`, `site_generation_error`, `site_generated_at` | No | Settings saved → Generating pages → Live on {domain} |
| `ai-content` | `getDirectoryAiContentStatus` (`lib/directories.js`) | `ai_content_generation_status`, `_processed`, `_total`, `_started_at`, `_error` | Yes | none |
| `seo-backfill` | `getDirectorySeoMetadataBackfillStatus` | `seo_metadata_backfill_status`, `_processed`, `_total`, `_started_at`, `_completed_at`, `_error` | Yes | none |
| `sheet-sync` | `ClientMapData` / `AdminMapData` `syncNow` (client-awaited) | local `syncing` state | No | none |
| `csv-import`, `geocode` | `ClientMapData` / `AdminMapData` / `DirectoryEntriesPanel` (browser loops) | local counts | Yes when count known | none; uses KeepOpenBanner |

Normalised job shape:

```js
{
  id: `${kind}:${directoryId}`, kind, scopeLabel: "UK Associations",
  status: "running" | "done" | "failed",
  title: "Publishing version 120",        // see copy table
  detail: "Generating your public pages. You can leave this page; we'll keep going.",
  processed, total,                        // null when indeterminate
  startedAt, finishedAt, error,
  steps: [{ label, state: "done" | "active" | "todo" }] | null,
  canLeave: true,                          // false for browser-bound work
  href: "/client/directories/:id/publishing", // the page that owns it
  isAi: false,                             // AI kinds show the spark icon
}
```

### 1.4 Components

**`JobCard`** (`.job-card`): props `job`, `onRetry`, `onDismiss`, `primaryAction` (e.g. "View live site"), `compact`. Placed **first after PageHead** on the owning page (Publishing, AI enrichment, SEO, map Data), and inside the Ask Pip drawer when Pip starts a job (compact).

- Running, determinate: icon (spinner, or rotating spark for AI) · title · detail · big percentage · striped moving bar (`.progress--striped`) · "191 of 329 entries done" · optional time left.
- Running, indeterminate: same, with sliding bar (`.progress--indeterminate`) and elapsed timer; steps row when the job has steps.
- Done: green, check icon, outcome ("Version 120 is live", "48 entries drafted · Review drafts"), duration, primary next step, Dismiss.
- Failed: red, says what is still live ("The live site still shows version 119"), `<details>` with the technical error, Try again, Contact support.
- `role="status" aria-live="polite"` while running/done; `role="alert"` when failed. Announce start, each 25% boundary and the end, not every poll. Progress bar has `aria-valuenow/min/max` or `aria-valuetext` ("Step 2 of 3, generating pages").

**`TaskIndicator`** (top bar, between search and Ask Pip): hidden when there are no jobs this session. Pill "1 running" with spinner; turns green ("Done") for 8s after a finish, red ("1 failed") until opened. Click opens `.task-popover` listing jobs with mini progress bars; each item links to `job.href`. Accessible: `button aria-haspopup="dialog" aria-expanded`, Esc closes, focus returns.

**`PublishStatus`** (side panel): while publishing, spinner + "Publishing…" + elapsed + 4px indeterminate bar; otherwise the existing states on the new tokens.

**`KeepOpenBanner`** (`.keep-open-banner`): sticky at the top of `<main>` for browser loops: "Finding map locations · 37 of 120", bar, "**Keep this tab open.** This runs in your browser and stops if you leave.", Stop button. Use with `useUnsavedGuard(true)` while active.

### 1.5 Page changes (do these exactly)

- **`DirectoryPublishPanel.jsx`**: delete `genStatusLine` and the green `msg` line for generation; render `<JobCard job={useJob("publish", directory.id)} />` above the publish form. Disable "Publish update" and "Restore" while running with the reason text. Replace `window.confirm` in `handleRollback` with ConfirmDialog. Keep `recordEvent` calls unchanged. Keep version history list; restyle as a DataTable or ActionList with "Current" pill.
- **`DirectoryAiContentPanel.jsx`** and **`DirectoryAiSeoMetadataPanel.jsx`**: replace the "⏳ … of … entries done…" lines with determinate JobCards (AI icon). On done, primary action opens the existing run report / review list.
- **`DirectorySeoSettingsPanel.jsx`**, **`EntryContentTab.jsx`**, **`EntrySeoTab.jsx`**, **`DirectoryContentPagesPanel.jsx`**, **`DirectoryClaimsPanel.jsx`**, **`DirectoryEntriesPanel.jsx`**, **`DirectoryOverviewRoute.jsx`**: search for "Generating", "running", "progress", "…" status text and replace with the matching surface (Button loading for short, JobCard compact for long).
- **`ClientMapData.jsx`**, **`AdminMapData.jsx`**: Sheets sync → JobCard indeterminate (success lists rows added/updated/removed if the response has them); CSV import and geocoding loops → KeepOpenBanner + leave guard, then a done JobCard with counts and "N addresses need checking" link.
- **`DirectoryPublishStatus.jsx`**: see above.

### 1.6 Copy

| Job | Running title | Running detail | Done | Failed |
|---|---|---|---|---|
| Publish | Publishing version {n} | Generating your public pages. You can leave this page; we'll keep going. | Version {n} is live | Generating pages failed |
| Restore | Restoring version {n} | Regenerating every public page from version {n}. | Version {n} restored and live | Restore failed |
| Regenerate | Regenerating public pages | Your content hasn't changed; pages are being rebuilt. | Public pages regenerated | Regenerating pages failed |
| AI content | Drafting content with AI | {processed} of {total} entries done. You can leave this page. | {n} entries drafted · Review drafts | AI drafting stopped |
| SEO backfill | Drafting SEO metadata | {processed} of {total} entries done. | Metadata drafted for {n} entries | Metadata drafting stopped |
| Sheet sync | Syncing with Google Sheets | Reading {sheet name}. This usually takes under a minute. | Sync complete · {added} added, {updated} updated | Sync failed. Your data hasn't changed |
| Geocode | Finding map locations · {x} of {y} | Keep this tab open. This runs in your browser and stops if you leave. | {n} located · {m} need checking | Stopped at {x} of {y} |

---

## 2. Ask Pip: AI assistant drawer (UI mock only)

### 2.1 Scope

Build the **complete UI** of the assistant with **mocked, local, canned responses**. No API calls, no LLM, no data sent anywhere, no settings changed by "Apply". It must look and behave like the real thing so the team can test the experience, and it must say clearly that it is a preview.

- Gate everything behind a flag: add `ASSISTANT_PREVIEW_FLAG` next to the existing flags used by `FeatureGate` (same mechanism as `DIRECTORIES_FLAG`). Default **on for staff, off for customers** until product decides; document the flag in `docs/FEATURES.md`.
- The assistant name is a single constant (`ASSISTANT_NAME = "Pip"` in `src/components/assistant/constants.js`) so it can change without a hunt. The top bar keeps the Layercake Maps logo (no rebrand yet); Pip appears only as the assistant.

### 2.2 Files

```
src/components/assistant/
  AssistantProvider.jsx   // open/close state, context, conversation per workspace (sessionStorage), keyboard shortcut
  AskPipButton.jsx        // top bar trigger
  AskPipLink.jsx          // contextual trigger for Section headers, EmptyState, ErrorState
  AssistantDrawer.jsx     // the drawer (portal into .shell)
  AssistantMessage.jsx    // user / pip message, sources, feedback buttons
  SuggestedAction.jsx     // action card (mock: no-op + toast)
  useAssistantContext.js  // derives page context from the route
  mockResponses.js        // canned prompts + replies, generated from assistant-mock.json
  constants.js
```

Mount `AssistantProvider` and `AssistantDrawer` inside `AppShell` (both client and platform contexts). Add `AskPipButton` to `TopBar` between the search field and the support link.

### 2.3 Triggers

1. **Top bar button** "Ask Pip ⌘J" on every page. Client context: white button on teal. Platform context: teal outline on ink. `aria-haspopup="dialog" aria-expanded aria-keyshortcuts="Meta+J Control+J"`.
2. **Keyboard**: ⌘J (Mac) / Ctrl+J toggles. Do not fire while focus is in a text field inside a Dialog. Register one listener in `AssistantProvider`; no other global keydown handlers.
3. **Contextual**: `Section askPip={{question}}`, `EmptyState askPip`, `ErrorState askPip` render `AskPipLink`. Opening from a contextual link pre-fills (does not send) the question and sets context to that section.

AIButton is **not** a trigger. AIButton does one job in place; Pip opens the conversation. Both use the spark; only Pip uses the face avatar.

### 2.4 Layout and behaviour

- Drawer: fixed, right, below the 52px top bar, width `clamp(360px, 440px, 40vw)`, full height; scrim `--scrim` (768–1279px) or `--scrim-light` (≥1280px); under 768px full-width sheet with no scrim. Opens 220ms ease-out, closes 160ms; reduced motion: instant.
- z-order: above SaveBar, toasts and menus; below Dialog. The TaskIndicator stays visible.
- `role="dialog" aria-modal="true" aria-labelledby` the "Pip" heading. Focus moves to the composer on open; Tab is trapped in the drawer; Esc, the close button or a scrim click closes and returns focus to the trigger.
- Header: face avatar 32px · "Pip" · "Preview" pill (`pill--ai`) · New conversation (icon button, `aria-label`) · Close.
- Context strip: "Helping with" + chip "{Directory} › {Page}" (or "{Organisation} › Home", "Platform › Customers"). Derived by `useAssistantContext` from the route and the existing directory/client data already loaded in the layout; no new fetches.
- Preview notice (first open per session): `Callout tone="info"`: "Preview: replies are examples while we build this. No data leaves your browser."
- Welcome state: Pip `welcome` art (72px), "Hi {first name}. What can I help with on {page}?", 3 suggested prompts for the current route group (from `assistant-mock.json`).
- Conversation: user bubbles right (ink), Pip replies left with 24px avatar; sources as links to real admin routes/guides; feedback buttons (Helpful / Not helpful / Copy) which only toast "Thanks" in the mock.
- Thinking state: spark rotating + "Looking at {thing}…" for 900–1400ms (randomised) before a canned reply; Stop button cancels.
- Suggested action card: title, consequence line ("Saved as an unpublished change. Nothing goes live until you publish."), Apply / Show me where. In the mock: Apply shows a Toast "Preview: this would {action}. Nothing was changed." and, for job-type actions, renders a compact JobCard that animates from 0 to 100% over ~6s locally (clearly fake, labelled "Preview"). Show me where navigates to the relevant route and closes the drawer.
- Free text that matches no canned prompt gets the fallback reply: "I'm still being built, so I can't answer that yet. In this preview I can show you how answers will look: try one of the suggested questions."
- Error and unavailable states exist as components and are reachable in the mock by typing `/error` and `/unavailable` (staff only), so they can be reviewed.
- Conversation persists per workspace in `sessionStorage` (key `assistant:{clientId|platform}`); New conversation clears it.
- Composer: auto-growing textarea (max 6 lines), Enter sends, Shift+Enter newline, send button disabled when empty. Disclaimer under it: "Pip can be wrong. It uses this directory's settings and Layercake guides, and never publishes or emails for you."
- New replies announced through a polite live region.

### 2.5 Events

Follow `AGENTS.md` "Admin event instrumentation". Opening the assistant and clicking a suggested prompt are admin-side interactions: add `admin_assistant_opened` (meta: `trigger: "topbar" | "shortcut" | "section" | "empty_state" | "error_state"`, `route_group`) and `admin_assistant_prompt_selected` (meta: `prompt_id`, `route_group`) using `recordAdminEvent` in `src/lib/adminEvents.js`, with the required metadata keys from AGENTS.md. Do **not** record free-text content. If AGENTS.md requires a catalogue entry or database constraint change, follow it; if that requires a migration, stop and ask before writing it.

### 2.6 Mock content

`assistant-mock.json` defines route groups, welcome copy, suggested prompts, replies, sources and actions. Convert it to `mockResponses.js` (or import the JSON). Every source link must point to a real route or doc in the repo; if a guide doesn't exist, link the nearest real page and add a BACKLOG entry.

---

## 3. Behaviour rules (apply everywhere)

| Topic | Rule |
|---|---|
| Saving | Settings pages and record editors (Templates 2–3): explicit Save with SaveBar + `useUnsavedGuard`. Single on/off SettingRows on overview/workspace pages: save instantly + Toast with Undo. Never both on one page. Section footers with their own Save only on pages without a SaveBar. |
| Publishing | Saving never changes the live site. Saved directory edits become "Unpublished changes" (PublishStatus + PageHead pill) until Publish. After saving content that affects the live site, SaveBar shows "Review and publish →". |
| Permissions | Keep navConfig's `canManage` behaviour (manage-only pages hidden for view-only users). Inside pages, hide actions the user can't take; if hiding would confuse (e.g. a whole empty page), show them disabled with the reason. |
| Entitlements and flags | Keep `FeatureGate` / `EntitlementGate`. When a gated feature is visible but locked, use a Callout or SettingRow with a "See plans" link, not a dead button. |
| Loading | Skeletons for first load; Button loading label for actions; JobCard for long jobs. A spinner alone is never acceptable; "Loading…" paragraphs are replaced. |
| Empty | Every list has an EmptyState with the next action. Zero-count rows in ActionLists are hidden. |
| Errors | Field errors inline; page errors in Callout danger; load failures in ErrorState with retry; job failures in JobCard failed. Every error says what is safe and what to do. |
| Destructive | Prefer Archive over Delete. Deletes use ConfirmDialog naming the count. Bulk deletes over 10 ask the user to type the number. Never `window.confirm`. |
| AI | One AIButton per section. Output is a draft (Pill `ai`, provenance Callout) and counts as an unpublished change. AI never publishes, deletes or sends email by itself. |
| Copy | Sentence case. Verb-first buttons. No exclamation marks. Placeholders like `[N]` in the references are real data in code. British English (organisation, colour). |
| Numbers and dates | Use `toLocaleString`/`Intl` with `en-GB`; relative times ("2 min ago") for activity under 24h; tabular numbers in tables and timers (`font-variant-numeric: tabular-nums`). |
