# Layercake Discover UI system: handoff for Claude Code

Design source: the "Layercake Discover UX/UI system" canvas (https://claude.ai/artifact/VKCEVfN8wC9KKjTtVbQq8D). This folder is the build-ready copy of it. If the canvas and this folder disagree, this folder wins.

## Prompt to give Claude Code

> Read `docs/design/discover-ui/BUILD_BRIEF.md` in full, then `README.md`, `COMPONENTS.md`, `PATTERNS.md`, `tokens.css`, `discover-ui.css`, `MIGRATION_INVENTORY.md` and `assistant-mock.json` in the same folder, and open the files in `reference/` in a browser. Apply the Discover UI system across the client portal and staff admin following the phases in BUILD_BRIEF.md. Follow AGENTS.md for git workflow, docs and admin events. One branch and PR per phase; stop for my review at the end of each phase with the phase report described in the brief. Start with the AGENTS.md opening checks, then Phase 1.

## Decisions already made (2026-11-14)

| Decision | Outcome |
|---|---|
| Overall look | Layercake teal leads (header, active nav, primary actions in `--shell-accent`). Pip's palette appears only as accents: the spark, AI surfaces, illustrations |
| Heading font | **Bricolage Grotesque** replaces Source Serif 4 in the admin. Public Sans stays for everything else |
| AI glyph | **The Discover spark** (four-point orange star, `assets/spark.svg`) replaces the two-star `SparkleIcon` everywhere. One symbol for AI |
| Product rebrand in the admin | **Not yet.** Keep the Layercake Maps logo and name. The "layercake discover" wordmark in the reference files is provisional and must not be built |
| AI assistant | Build the **Ask Pip** drawer as a UI preview with canned replies. No AI feature, no network calls. Behind a flag, staff-only by default |
| Pip in the admin | Only as the assistant (face avatar) and in empty/error states (vector art ≤88px). Never in tables, forms or cards |
| Processing feedback | New pattern: JobCard + top-bar TaskIndicator + side-panel PublishStatus + KeepOpenBanner. Replaces subtle status text |
| Package location | `docs/design/discover-ui/` (this folder) |

Still open (do not decide in code; add to BACKLOG if you hit them): official Discover logo; "Search & Discovery" → "Search & AI" rename; a "Getting started" checklist on Home; whether customers get the assistant preview.

## What's in the folder

| File | Purpose |
|---|---|
| `BUILD_BRIEF.md` | Scope, ground rules, the seven phases, per-page checklist, accessibility bar, acceptance checks. **Start here** |
| `COMPONENTS.md` | Spec for every shared component in `src/components/ui/`: props, classes, states, accessibility, what it replaces |
| `PATTERNS.md` | Processing/progress pattern, Ask Pip drawer (mock contract), and behaviour rules for saving, publishing, permissions, loading, errors, destructive actions, AI and copy |
| `tokens.css` | Token overrides and additions to merge into `src/styles/admin-shell-tokens.css` |
| `discover-ui.css` | Reference CSS for the new class vocabulary, scoped under `.shell`, built on the tokens |
| `assistant-mock.json` | Route groups, suggested prompts, canned replies, sources and actions for the Ask Pip preview |
| `MIGRATION_INVENTORY.md` | Every in-scope file with its count of inline styles, legacy classes, Mantine imports, hex colours and emoji. The phase 6 checklist |
| `reference/*.html` | Static pages exported from the canvas. Open in a browser. Inline styles are canvas output: build with tokens and classes, not by copying them |
| `assets/` | `spark.svg` (AI glyph), `pip/*.svg` (vector Pip expressions and badges for empty states and the assistant), `concept/*.png` (approved concept art, for marketing only, not the admin), `before-publishing.png` (the problem the processing pattern fixes), `discover-app-icon-provisional.svg` (do not use yet) |

### Reference pages

| File | Shows |
|---|---|
| `00-foundations.html` | Colour, type, principles, the "volume dial" for how much Pip appears where |
| `01-pip-character.html` | Pip model sheet, expressions, small-size rules, motion spec |
| `02-discover-components.html` | Brand-level components (Pip avatar/spot/state, discovery search). Mostly for consumer surfaces |
| `03-admin-sitemap.html` | Every admin route as built, by context, with levels and gating |
| `10-template-workspace-page.html` | Template 1: rail-level page (no feature panel) |
| `11-template-feature-panel-page.html` | Template 2: directory/map/customer sub-page with feature panel and SaveBar |
| `12-template-record-editor.html` | Template 3: record editor with breadcrumb, tabs, preview aside |
| `13-template-platform.html` | Template 4: staff platform context |
| `20-component-audit.html` | What's inconsistent in the code today and the consolidation map |
| `21-in-page-component-library.html` | The standard component set and behaviour rules |
| `30-pattern-processing.html` | Processing and progress pattern, before/after |
| `31-pattern-ask-pip-drawer.html` | Ask Pip drawer open on a directory page |
| `32-pattern-ask-pip-states.html` | Ask Pip triggers and every drawer state |
| `40-mockup-admin-onboarding.html` | Onboarding concept (Getting started is not built: BACKLOG) |
| `41-mockup-admin-directory-summary.html` | Directory overview concept |

Note: reference pages use the provisional "layercake discover" wordmark and, in 40/41, a few proposed labels. Keep the current logo and `navConfig.js` labels.
