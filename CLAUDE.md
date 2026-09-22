# Claude Code — Directory Maps

> **CRITICAL — read `AGENTS.md` in full at these points in every session, no exceptions:**
> - **Opening a session** (including sessions resumed from a summary)
> - **Before deploying a database migration**
> - **Before deploying an Edge Function**
> - **Before committing or pushing code**
> - **Closing a session / opening a PR**
>
> `AGENTS.md` is the single source of truth for git workflow, documentation requirements, migration rules, deployment procedure, and admin event instrumentation. Do not rely on memory of previous sessions — re-read it.

Follow **`AGENTS.md`** in this repository for project conventions and documentation requirements.

**Critical:** When changing user-facing behaviour, update **`docs/USER_GUIDE.md`** in the same task (see `AGENTS.md` and `.cursor/rules/user-guide-documentation.mdc`).

**Critical:** Every new visitor action on a published directory site must record a `map_engagement_events` row (`surface: directory_site`), with the event type added to the database check constraint and documented in `docs/MAP_ENGAGEMENT.md`. Do not ship a directory-site button, form, or filter without that event. See `AGENTS.md` section 5.
