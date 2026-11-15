# Drag-to-reorder pattern: brief for Claude Code

**Standalone brief. One branch, one PR.** Builds one shared reorder component and applies it everywhere the admin lets people change order, starting with Directory › Categories. Visual reference: `reference/33-pattern-reorder.html` (before/after, row states, interaction spec). The "before" is `assets/before-categories.png`.

Ground rules (as for the rollout): follow `AGENTS.md` (opening checks, branch, docs, deployment log, admin events); presentation and interaction only; **no new dependencies** (build it on Pointer Events, not a drag-and-drop library); **no database or Edge Function changes**: every list already has a reorder function in `src/lib/`; keep every existing `recordEvent` call and event name.

> Note: a branch `fix/2026-11-14-directory-categories-attach-only` touched `CategorisationAttachmentPicker.jsx` today. Run the AGENTS.md opening checks and make sure that work is merged (or ask) before starting.

---

## 1. What's wrong today

- **Four different ways to reorder:** up/down arrow buttons (`CategorisationAttachmentPicker`, `FilterFieldsPanel`, editor lists), Alt+arrow keys plus native HTML5 drag (`EntryPagesPage`), native drag with nesting (`DirectoryContentPagesPanel`), and native drag plus an explicit "save order" step (`MapGroupsPanel`).
- **Native HTML5 drag-and-drop** doesn't work on touch devices and isn't keyboard accessible.
- **On Categories specifically:** the page title and the Section title both say "Categories"; the up/down arrows sit in grey boxes that look disabled and move one place per click; there's a card inside a card; Detach is as prominent as everything else and has no confirmation; nothing explains what the order controls.

## 2. Build `SortableList` in `src/components/ui/`

New file `src/components/ui/sortable.jsx`, exported from `ui/index.js`, with a `GripIcon` added to `ui/icons.jsx` (six dots, 2×3, 16px, `currentColor`).

### 2.1 API

```jsx
<SortableList
  items={rows}                       // array
  getId={(row) => row.id}
  getLabel={(row) => row.name}       // used in aria labels and announcements
  onReorder={(nextItems, { from, to, item }) => …}  // called on drop / menu move; may return a Promise
  renderItem={(row, { index, handleProps, isDragging, menuItems }) => …} // optional custom row
  variant="default" | "compact"      // 64px vs 48px rows
  nestable={false}                   // Pages only, see §2.6
  disabled={!canManage}              // hides handles and move menu items, keeps the list
  ariaLabel="Categories, in filter order"
/>
```

Also export `SortableRow` (the default row: handle, position number, title, meta line, trailing actions slot, ⋯ menu) and `useSortable` (the hook behind it), so editor lists with custom rows can reuse the behaviour.

### 2.2 Markup and look

- `<ol>` with `aria-label`; each row an `<li>`. Classes: `.sortable`, `.sortable-row`, `.sortable-handle`, `.sortable-pos`, `.sortable-slot`, `.sortable-row--lifted`, `.sortable-row--kbd`, `.sortable--compact`. Write the CSS in `src/styles/discover-ui.css` from the values below; tokens only.
- **List:** 1px `--shell-line` border, `--radius-card` corners, white surface, rows separated by `--shell-line-soft`. No card-in-card: on a page, the list sits directly in the page or in one Section with `flush`.
- **Handle:** a `<button type="button">`, 36×44px, `GripIcon` in `#9aa3a8`; on hover/focus `--shell-ink` on `--shell-ground`, `cursor: grab`. **Always visible** (not hover-only). `aria-label="Reorder {label}"`, `aria-describedby` pointing at a visually hidden instruction: "Press Space or Enter to pick up. Use the arrow keys to move, Space or Enter to drop, Escape to cancel."
- **Position number:** 13px, 600, `--shell-text-muted`, tabular numbers. Optional (`showPosition`, default true).
- **Lifted row:** white, 2px `--lc-teal` border, `--radius-card`, `box-shadow: 0 12px 28px rgba(20,25,28,.18)`, `transform: scale(1.01) rotate(-0.6deg)`, `cursor: grabbing`, follows the pointer on the Y axis only, constrained to the list.
- **Drop slot:** a 2px dashed `--shell-info-border` slot on `--shell-info-bg` at the landing position, same height as the row; other rows slide with `transform` over 150ms `--ease-out`.
- **Keyboard-lifted row:** 2px `--shell-accent` outline inset, `--shell-selected-row` background, plus a dark instruction bar under the list (`role="status"`): "**Moving {label}** · position {n} of {total}. ↑ ↓ to move, Space to drop, Esc to cancel."
- **Reduced motion:** no scale, tilt or slide; rows jump into place.

### 2.3 Interaction

| Input | Behaviour |
|---|---|
| Mouse | Pointer down on the handle, move ≥4px to lift. Drop on release. Release outside the list or press Esc to cancel (row returns). Auto-scroll the nearest scroll container when within 48px of its edge. Only the handle starts a drag; text in the row stays selectable. |
| Touch / pen | Press and hold the handle 200ms to lift (so normal scrolling still works); `touch-action: none` on the handle only. `navigator.vibrate?.(10)` on lift. |
| Keyboard | Tab to the handle. Space or Enter lifts. ↑/↓ move one place; Home/End move to the top/bottom. Space or Enter drops. Esc cancels. Tab while lifted drops first. Focus stays on the moved row's handle after the drop and after the re-render from the server. |
| ⋯ menu | Every row's OverflowMenu starts with Move to top, Move up, Move down, Move to bottom (disabled at the ends), then a divider and the row's own actions (e.g. Detach). |

Use Pointer Events with `setPointerCapture`; no HTML5 `draggable`. Clean up listeners on unmount and on cancel.

### 2.4 Announcements

One polite live region per list. Copy:

- Lift: "Picked up {label}. Position {n} of {total}."
- Move: "{label}, position {n} of {total}."
- Drop: "{label} dropped at position {n} of {total}." then, after save, "Order saved."
- Cancel: "Cancelled. {label} is back at position {n}."
- Save failure: "Couldn't save the new order. It's been put back." (`role="alert"` via the Callout)

### 2.5 Saving rules

- **Standalone lists** (Categories, filter fields, map groups, pages): call `onReorder` on drop and update optimistically. Show a Toast "Order saved." with **Undo** (6s), which calls `onReorder` with the previous order. On failure, revert to the previous order and show `Callout tone="danger"` above the list. No Save button and no SaveBar. Remove the separate "save order" step in `MapGroupsPanel`.
- **Lists inside forms with a SaveBar** (editor lists, entry page sections): `onReorder` only updates the form state, so the SaveBar shows unsaved changes. No toast.
- Debounce: if a second drop happens while a save is in flight, queue the latest order and send it when the first save finishes; never send overlapping saves.
- Directory lists: order changes are unpublished changes like any other edit; the existing publish-state refresh picks them up.

### 2.6 Nested variant (Pages only)

`nestable` adds one level of nesting, matching what `DirectoryContentPagesPanel` does today: while dragging, moving the pointer 32px right of the slot's left edge indents the slot under the row above ("Nest under {parent}" shown in the slot); moving back un-nests. Keyboard: → / ← while lifted nest and un-nest. Keep the existing one-level limit and the existing `reorderContentPages` call shape.

## 3. Directory › Categories (do this first)

**Files:** `src/components/directoryPanel/DirectoryCategoriesRoute.jsx`, `src/components/directories/CategorisationAttachmentPicker.jsx`. The picker is shared with maps (`targetType`), so the map Categories view gets the same result.

1. **PageHead:** title "Categories"; subtitle "Filters visitors can use on this directory, in the order they appear." (for maps: "…on this map…"); primary action **Attach a category** (opens a Dialog, below). Only one "Categories" heading on the page: drop the Section title, or use a Section with `flush` and no title.
2. **List:** `SortableList` with `SortableRow`: handle · position · name · "{n} terms" · **Edit terms** link (to the client's Categories page for that category, the route that exists today; if there's no per-category route, link the Categories list and add a BACKLOG entry) · ⋯ menu.
3. **⋯ menu:** Move to top / up / down / bottom, divider, **Detach**. Detach opens `ConfirmDialog`: title "Detach {name}?", body "Visitors won't be able to filter by {name} on this directory after you publish. Its terms stay on your entries and you can attach it again at any time.", confirm "Detach category" (danger-solid). Keep the existing `recordEvent` names.
4. **Hint under the list:** grip icon + "Drag to reorder, or use the handle with Space and the arrow keys. Changes save straight away and go live when you publish."
5. **Attach dialog:** replace the inline picker with a `Dialog` titled "Attach a category": a `Field` + `Select` of unattached categories, Cancel / Attach (primary). The new category is added at the bottom, with a Toast "{name} attached. Drag it to change its position."
6. **Empty state:** `EmptyState` art `welcome`, title "No categories attached", body "Attach a category to let visitors filter this directory by its terms.", action "Attach a category".
7. **View-only users:** no handles, no menu moves, no Detach, no Attach; the list still shows order, names and term counts.
8. Remove `ArrowUpIcon`/`ArrowDownIcon` imports from the picker.

## 4. Apply everywhere else

Replace each existing reorder UI with `SortableList` (or `useSortable` for custom rows), keeping each list's existing save function and events:

| File | Today | After |
|---|---|---|
| `components/FilterFieldsPanel.jsx` (`reorderFilterFields`, `.mp-reorder`) | Up/down arrows | SortableList, standalone save rule |
| `components/mapDashboard/MapGroupsPanel.jsx` (+ handlers in `ClientMapDashboard` / `AdminMapDashboard`) | Native drag + separate save | SortableList, save on drop; remove the save-order button |
| `components/directories/DirectoryContentPagesPanel.jsx` (`reorderContentPages`) | Native drag with nesting | SortableList `nestable` |
| `components/experience/EntryPagesPage.jsx` | Native drag + Alt+arrows + arrow buttons | `useSortable`; form rule (SaveBar); keep its section rows |
| `components/directories/ProminentLinksEditor.jsx` | Move up/down | `useSortable` compact, form rule |
| `components/directories/ProductTilesEditor.jsx` | Move up/down | same |
| `components/directories/MediaAssetsEditor.jsx` | Move up/down | same (thumbnail stays in the row) |
| `components/directories/TeamMembersEditor.jsx` | Move up/down | same |
| `components/directories/EvidenceItemsEditor.jsx` | Move up/down | same |
| `components/directories/AccreditationSchemesPanel.jsx` | Move up/down | standalone or form rule, whichever matches how it saves today |

Then search for leftovers: `grep -rnE "moveUp|moveDown|draggable|onDragStart|ArrowUpIcon|ArrowDownIcon" src` should only show `DataTable`'s sort arrows and out-of-scope public files (`PublishedMapView`, `EmbedMap`).

## 5. Guardrails and docs

- `scripts/check-ui.sh`: add a must-be-zero check for `draggable` and `onDragStart` in in-scope files (exclude `MapTileThumb.jsx`, which sets `draggable={false}` on an image).
- `/admin/ui-kit`: add a SortableList section showing default, compact, nested, disabled and the keyboard-lifted state.
- `docs/design/discover-ui/COMPONENTS.md` is updated by design; add a short "Reordering" section to `docs/USER_GUIDE.md` (drag the handle, or Space + arrows; saves straight away; Undo).
- `docs/DEPLOYMENTS.md` entry per AGENTS.md. BACKLOG entries for anything you couldn't do.

## 6. Acceptance

- Categories page matches the "After" in the reference: one title, subtitle, Attach in the PageHead, flat list with handles, ⋯ menu with moves and Detach (confirmed), hint line, Toast with Undo.
- Reordering works with a mouse, on a touch device (iOS Safari and Android Chrome: hold, drag, and the page still scrolls when not holding the handle), with the keyboard alone, and through the ⋯ menu.
- VoiceOver (macOS) announces pick up, each move, drop and "Order saved".
- Failed save (simulate offline) reverts the list and shows the danger Callout.
- Undo restores the previous order on the server (reload to confirm).
- Every list in §4 uses the component; the grep in §4 is clean; `scripts/check-ui.sh` and `npm run build` pass.
- Reduced motion: no tilt, scale or slide.
- PR includes before/after screenshots of Categories, filter fields, map groups and pages, plus a short screen recording of a keyboard reorder.
