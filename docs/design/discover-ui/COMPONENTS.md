# Shared UI components: specification

Every component lives in **`src/components/ui/`** (new folder) and is exported from `src/components/ui/index.js`. Pages import from there only. Classes come from `admin-shell.css` plus the ported `discover-ui.css`. Visual reference: `reference/21-in-page-component-library.html` (and `20-component-audit.html` for what each replaces).

Conventions for every component:

- Plain function components, JSX, no TypeScript (match the repo). JSDoc the props at the top of each file, as `AppShell.jsx` and `PageHead.jsx` already do.
- Accept `className` and spread remaining props onto the root element, so pages can add an id, `data-*` or aria attributes without wrappers.
- No inline styles inside `ui/` except genuinely dynamic values (a progress width, a colour swatch's own colour). Everything else is a class.
- No hard-coded colours. Tokens only.
- Real elements: `<button type="button">` for actions, `<a href>` / `<Link>` for navigation, `<label>` for every input, `<table>` for tabular data, `<fieldset>/<legend>` for grouped choices.
- Every interactive element reaches 44×44px (36px allowed for `size="sm"` controls inside dense tables and toolbars).
- Visible focus via the shell's existing `:focus-visible` rule. On dark surfaces use `--focus-ring-on-dark`.

---

## 1. Layout and structure

### PageHead (extend existing `components/shell/PageHead.jsx`)

| Prop | Type | Notes |
|---|---|---|
| `title` | node | Required. Renders `h1.page-title` |
| `subtitle` | node | One line, muted |
| `eyebrow` | node | Small label above title (e.g. "Platform", "Getting started") |
| `breadcrumb` | `{label, to}[]` | Renders `<nav aria-label="Breadcrumb">` above the title; last item is plain text |
| `status` | node | A `Pill` shown after the title (e.g. Unpublished changes) |
| `actions` | node | Right side. **Max two buttons, one primary.** Extra actions go into `OverflowMenu` |

Rules: always the first child of `<main>`. Title 40px; record editors may pass `size="sm"` for 32px. Keep the existing component and its call sites; add props, don't fork.

### Section

The single container for in-page content. Replaces `.admin-card`, `.panel-section`, `.xp-card`, engagement `Panel`, and bare `.card` + `.card-pad` combinations in pages.

| Prop | Type | Notes |
|---|---|---|
| `title` | string | `h2.section-title` (use `as="h3"` when nested under another heading) |
| `description` | node | `p.section-desc` |
| `actions` | node | Top-right of the head, small buttons or an `ask-pip-link` |
| `askPip` | `{question}` | Renders "Ask Pip about this" link that opens the drawer with this section as context (see PATTERNS.md §2) |
| `footer` | node | `.section-foot`. Only for section-level save on pages **without** a SaveBar |
| `tone` | `"default" \| "danger"` | `danger` for destructive settings; always last on the page |
| `flush` | bool | Body without padding, for a table or a list of `SettingRow`s |

Classes: `.section`, `.section-head`, `.section-body`, `.section-foot`, `.section--danger`. Stack sections in `.section-stack` (max-width `--form-max`).

Nested groupings inside a section: use an `h3` + `.field-grid`, not another tinted box. The grey `.panel-section` look is retired.

### SettingRow

For on/off features and single-value settings in a list.

| Prop | Type | Notes |
|---|---|---|
| `label` | string | Text, also the switch's accessible name |
| `description` | node | One line; may include a link to fix a prerequisite |
| `control` | node | Usually `<Switch>`, or a `Pill` + link when unavailable |
| `id` | string | Used to wire `aria-labelledby` |

If a feature can't be enabled yet, show why and link to the fix (e.g. "Needs email settings first. Set up email") with a neutral pill, rather than a silently disabled switch.

### Tabs (level 4 record editors only)

Keep `.tabs` / `.tab` from admin-shell.css. Implement as links (route-driven, as `ClientDirectoryEntryEdit` already is) with `aria-current="page"`. Never use tabs to switch between records or as page navigation. Unsaved state is shared across tabs; switching tabs never discards edits.

---

## 2. Actions

### Button

Wraps `.shell-btn`. Replaces `.btn`, `.btn-primary`, `.btn-sm`, `.btn-danger` (admin.css), `.xp-btn*` (experience.css), `lm__btn`, `auth-form__submit` inside the shell, and Mantine `<Button>`.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `primary \| secondary \| ghost \| danger \| danger-solid` | `secondary` | `danger` = red text; `danger-solid` only inside ConfirmDialog |
| `size` | `md \| sm` | `md` | md 44px, sm 36px |
| `icon` | node | | Leading icon (inline SVG, `aria-hidden`) |
| `iconOnly` | bool | | Requires `aria-label`; renders `.shell-btn--icon` |
| `loading` | bool | | Sets `aria-busy`, disables, swaps `children` for `loadingLabel` with a spinner, keeps width |
| `loadingLabel` | string | `"Working…"` | Use the verb: "Saving…", "Publishing…", "Importing…" |
| `as` | `"button" \| Link \| "a"` | `"button"` | For navigation styled as a button |
| `disabledReason` | string | | When disabled, rendered as `aria-describedby` text next to the button |

Rules: one primary per view. Labels start with a verb. A spinner never appears without a label. Disabled buttons always have a visible reason nearby, or the action is hidden instead.

### AIButton (re-skin `components/ai/AIButton.jsx`)

Keep the existing state machine and API exactly (idle → loading → done 1.6s → idle; `onGenerate` may resolve `false`; 60s timeout; inline error with live region). Change only:

- Replace `SparkleIcon` with the Discover spark (`assets/spark.svg`, inline it as an SVG component `<SparkIcon />` in `ui/icons.jsx`). Update the comment that says the sparkle is kept on purpose: the decision changed on 2026-11-14.
- Restyle per `discover-ui.css` `.ai-btn`: ink outline, ink text, orange spark; `is-done` uses `--shell-accent`. Remove the `--uka-*` variables from `ai.css` once nothing references them.
- Default label "Draft with AI" for content generation. Keep caller-provided labels.
- Loading: the spark rotates (reduced motion: static) and the label becomes the verb + "…".

`AiProvenanceNote` becomes `<Callout tone="ai">`. `AiUnavailableNotice` keeps its logic but renders a `Callout tone="info"`. `AiRunSummary` and `AiBulkRunReport` keep their content, re-skinned with Section/Callout.

### OverflowMenu (move from `components/experience/ui.jsx`)

Move as-is into `ui/`, restyle with `.avatar-menu-list` / `.avatar-menu-item` styling (already in the shell). Items: `{label, onSelect, danger?, disabled?, href?}`. Destructive items last, red, and must open ConfirmDialog.

---

## 3. Forms

### Field

Owns label, hint, error, required marker and id wiring. Inputs are never rendered bare in pages.

| Prop | Type | Notes |
|---|---|---|
| `label` | string | Required. `<label for>` |
| `hint` | node | `.field-hint`, linked by `aria-describedby` |
| `error` | string | `.field-error`, sets `aria-invalid` on the control, linked by `aria-describedby`; replaces the hint visually but both stay in the description |
| `required` | bool | Adds `.field-required` "*" and `required` |
| `count` | `{value, max}` | Character counter under textareas |
| `children` | element | The control. Field clones it with `id`, `aria-*` |

Controls: `<TextInput>`, `<Select>` (native `<select>` styled `.select`; replaces Mantine `Select` unless search-in-select is needed, in which case wrap Mantine inside Field and theme it), `<Textarea>`, `<Checkbox>`, `<CheckboxGroup>` (fieldset), `<FieldGrid>` (two-up, collapses to one column under 720px).

Validation: on blur and on submit, never on every keystroke. Error text says how to fix ("Enter a full email address, like name@example.org"). Errors use red text **and** a 2px red border.

### Switch

`<button role="switch" aria-checked>` with `.switch`. Label via `aria-labelledby` (usually from SettingRow). In SettingRows on overview pages it saves instantly and confirms with a Toast; on settings pages with a SaveBar it only marks the page dirty. Never mix both behaviours on one page.

### SegmentedControl (move from `experience/ui.jsx`)

`role="radiogroup"`, buttons `role="radio" aria-checked`. Arrow keys move selection (keep `useTabKeys`). 2–4 options. `.segmented`.

### RadioCards

Fieldset of `<label class="radio-card"><input type="radio">…`. Use when each option needs a description (data approach, header style, layout choices). Replaces `pin-style-option`, `map-style-option`, `panel-detail-layout-option` patterns: keep their thumbnails as card content.

### ColourField (move from `experience/ui.jsx`)

Keep the live `ContrastBadge`. Badge uses `pill--live` for AA pass, `pill--warn` for large-text-only, `pill--danger` for fail.

### TagPicker

Wraps the existing `CategoryTagPicker` look: `.chip-removable` chips with an icon-only remove button (`aria-label="Remove {name}"`) and a dashed "+ Add {thing}" button.

---

## 4. Status and feedback

### Pill

`<Pill tone>`: `ok | live | neutral | warn | danger | info | ai`. Always contains words. Mapping for common states:

| State | Tone | Text |
|---|---|---|
| Published / live | `live` | Published |
| Unpublished changes | `warn` | Unpublished changes |
| Draft | `neutral` | Draft |
| Claimed | `ok` | Claimed |
| Awaiting verification | `warn` | Awaiting verification |
| Failed | `danger` | Failed |
| Coming soon | `neutral` + dashed border | Coming soon |
| AI draft | `ai` | AI draft |
| Not geocoded | `warn` | Not geocoded |

### PublishStatus (restyle `components/shell/DirectoryPublishStatus.jsx`)

Keep logic and polling. Move state colours onto tokens (see `discover-ui.css`; removes `#16a34a`, `#d97706`, `#dc2626`, `#2563eb`). While `generating`: spinner instead of dot, elapsed time, and a `progress--xs progress--indeterminate` bar under the text. See PATTERNS.md §1.

### Callout

`<Callout tone title action>`: `info | ok | warn | danger | ai`. Page-level messages only (field errors stay in Field). `danger` → `role="alert"`, `ok` → `role="status"`, others `role="note"`. Replaces Mantine `Alert`, `.ai-note`, and every `<p style={{color:"#b91c1c"}}>` / `#166534` message in pages.

### Toast (+ `ToastProvider` in AppShell)

For confirming something that already happened, with Undo where possible. 6s, bottom-left beside the rail (`.toast-region`), `role="status"`, pauses on hover/focus, max 3 stacked. Never for errors that need action (use Callout or the JobCard failed state).

### EmptyState, ErrorState, Skeleton

| Component | Props | Notes |
|---|---|---|
| `EmptyState` | `art` (`welcome \| encouraging \| searching \| none`), `title`, `body`, `actions`, `askPip` | Pip vector art at 88px max (`assets/pip/*.svg`, `alt=""`). Title states the situation in words |
| `ErrorState` | `title`, `body`, `onRetry`, `askPip` | `role="alert"`, Pip `apology` art. Body says what is safe ("Nothing has been lost") |
| `Skeleton` | `rows`, `variant` (`table \| list \| tiles \| form`) | Shape of the content being loaded. `aria-busy="true"` on the region with an `aria-label` |

These replace Mantine `Loader`, engagement `LoadingState` and `EmptyChart`, "Loading…" paragraphs, and "No X yet." paragraphs. Pip appears **only** in EmptyState/ErrorState and the assistant, never inside tables, forms or cards.

---

## 5. Data display

### Toolbar

Row above a table/list: search Field, filter Selects, secondary actions, then the primary action on the right. Wraps on narrow screens. `.toolbar` (existing) with `flex-wrap: wrap`.

### BulkBar

Replaces the toolbar's actions while rows are selected: "N selected", bulk actions (AI actions use AIButton `size="sm"`), destructive last, "Clear selection" on the right. `role="region" aria-label="Bulk actions"`. `.bulkbar` (existing).

### DataTable

One table for every list. Replaces `.admin-table`, engagement `DataTable`, and hand-built grids of divs.

| Prop | Type | Notes |
|---|---|---|
| `columns` | `{key, label, render?, sortable?, width?, align?}[]` | Header labels uppercase via `.table thead th` |
| `rows` | array | |
| `getRowId` | fn | |
| `rowLink` | fn(row) → to | The **name cell** becomes the link (`.row-link`); the whole row is not a click target |
| `selectable` | bool | Checkbox column with "Select all" (`aria-label`) and per-row labels naming the row |
| `selected`, `onSelectedChange` | | Selected rows get `aria-selected="true"` |
| `rowMenu` | fn(row) → items | ⋯ OverflowMenu, `aria-label="Actions for {name}"` |
| `sort`, `onSortChange` | | `aria-sort` on the active header |
| `loading` | bool | Renders `Skeleton variant="table"` |
| `empty` | node | Renders inside the table frame (usually EmptyState) |
| `pagination` | `{page, pageSize, total, onPage}` | `.table-foot`: "1–50 of 329", Previous/Next |

Wrap in `.table-wrap` so wide tables scroll horizontally instead of breaking the layout. Rows 60px; header sticky.

### StatTile and StatGrid

Keep `.stat`, `.stat-grid`, `.stat--compact`, `.stat--ok`, `.stat--warn`. Component props: `label`, `value`, `sub`, `tone`, `href`. Every tile with a number links to the list behind it. Engagement `MetricCards` render StatTiles.

### ActionList

`.action-row` list ("Needs attention"): count, title, description, one verb. Rows with zero are not rendered. AI rows use the spark before the verb.

---

## 6. Overlays

### Dialog and ConfirmDialog (move from `experience/ui.jsx`)

Keep their focus handling. Restyle with `.dialog-*`. ConfirmDialog: title is the question ("Archive 2 entries?"), body says the consequence and how to undo, confirm button repeats the verb with a count ("Archive entries"), `danger-solid` for destructive. Initial focus on Cancel for destructive actions. Esc closes. Replace every `window.confirm(...)` in the admin (e.g. `DirectoryPublishPanel.handleRollback`, `useUnsavedGuard`'s in-app prompt) and every Mantine `Modal` and per-feature modal shell (`BulkCategoryEditModal`, `EntitlementLimitModal`, `DraftingPromptModal`) with Dialog; keep their bodies.

### SaveBar + useUnsavedGuard (move from `experience/ui.jsx`)

Keep logic. Restyle `.savebar`. Required on every Template 2/3 page that edits settings or a record. Status text: "N unsaved changes" / "All changes saved · HH:MM · Review and publish →" (link only when the change affects the live site). `useUnsavedGuard` covers browser unload and in-app navigation, and its in-app prompt uses ConfirmDialog instead of `window.confirm`.

---

## 7. Icons

- Inline stroke SVG, 1.8px stroke, 24px viewBox, `aria-hidden="true"`, `currentColor`. Collect in `src/components/ui/icons.jsx` (the shell already has `components/icons`; extend that set rather than adding lucide-react usage in new code).
- No emoji anywhere in the admin UI (today: ⏳ in publish/AI panels and others; see MIGRATION_INVENTORY.md "Emoji" column).
- The spark is the only AI glyph. Pip's face badge (`assets/pip/pip-badge-face.svg`) is used only for the assistant (button-adjacent avatar, drawer header, replies) and nowhere else.
