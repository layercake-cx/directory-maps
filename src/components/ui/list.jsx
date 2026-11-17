import React, { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { PageLayout } from "./layouts.jsx";
import { Section } from "./layout.jsx";
import { Field, SegmentedControl, TextInput } from "./forms.jsx";
import { Callout, EmptyState } from "./feedback.jsx";
import { DataTable, Toolbar } from "./data.jsx";

/** Lists show a search toolbar only once they can outgrow one screen. */
const TOOLBAR_THRESHOLD = 10;

/** dd/mm/yyyy for every date cell in a list; an em dash when there is no date. */
export function formatListDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB");
}

/**
 * Keeps the selected status view in the URL (`?view=archived`) so it survives reload and the back button.
 * Unknown or missing values fall back to `fallback` (the default view, which is not written to the URL).
 */
export function useListView(keys, fallback = "all") {
  const [params, setParams] = useSearchParams();
  const raw = params.get("view");
  const view = raw && keys.includes(raw) ? raw : fallback;
  const setView = useCallback(
    (next) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === fallback) p.delete("view");
          else p.set("view", next);
          return p;
        },
        { replace: false },
      );
    },
    [setParams, fallback],
  );
  return [view, setView];
}

/** Name cell: the link text (supplied by DataTable's rowLink) plus one muted context line. */
export function NameCell({ name, sub }) {
  return (
    <span className="list-name">
      <span className="list-name-text">{name}</span>
      {sub ? <span className="cell-sub">{sub}</span> : null}
    </span>
  );
}

/**
 * ListPage: one anatomy for every list screen (docs/design/discover-ui/ARCHIVE_BRIEF.md §1.1).
 * PageHead → notice → status views → toolbar → DataTable → secondary sections.
 *
 * @param {{
 *   head: object,                       // PageHead props: title, subtitle, at most two actions
 *   notice?: React.ReactNode,           // e.g. sync-error Callouts, shown above the views
 *   error?: string,
 *   noun: string,                       // plural, lower case: "maps", "directories", "customers"
 *   views: { value: string, onChange: (v: string) => void, label: string,
 *            options: {key: string, label: string, count: number}[] },
 *   search?: { value: string, onChange: (v: string) => void, label: string, placeholder?: string },
 *   filters?: React.ReactNode,          // labelled Selects
 *   toolbarActions?: React.ReactNode,
 *   alwaysShowToolbar?: boolean,        // platform-wide lists
 *   itemCount: number,                  // every item, archived included (drives the empty state)
 *   emptyAll: React.ReactNode,          // shown when there are no items at all
 *   table: object,                      // DataTable props (columns, rows, rowLink, rowMenu, ...)
 *   below?: React.ReactNode,            // secondary Sections, always below the table
 *   aside?: React.ReactNode,
 * }} props
 */
export default function ListPage({
  head, notice, error, noun, views, search, filters, toolbarActions, alwaysShowToolbar = false,
  itemCount, emptyAll, table, below, aside,
}) {
  // "Archived" is always its own view, always last, and shown even at zero.
  const options = [
    ...views.options.filter((o) => o.key !== "archived"),
    ...views.options.filter((o) => o.key === "archived"),
  ];
  const showToolbar = Boolean((search || filters) && (alwaysShowToolbar || itemCount > TOOLBAR_THRESHOLD || search?.value));
  const searching = Boolean(search?.value?.trim());

  let empty;
  if (itemCount === 0) empty = emptyAll;
  else if (searching) empty = <EmptyState art="searching" title={`No ${noun} match your search`} body="Try a different search." />;
  else empty = <EmptyState art="searching" title={`No ${noun} in this view`} />;

  return (
    <PageLayout head={head} aside={aside}>
      <div className="list-stack">
        {notice}
        {error ? <Callout tone="danger">{error}</Callout> : null}

        <SegmentedControl
          label={views.label}
          value={views.value}
          onChange={views.onChange}
          options={options.map((o) => ({ value: o.key, label: `${o.label} (${o.count})` }))}
        />

        {showToolbar ? (
          <Toolbar>
            {search ? (
              <Field label={search.label} className="list-search">
                <TextInput
                  type="search"
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder={search.placeholder}
                />
              </Field>
            ) : null}
            {filters}
            {toolbarActions}
          </Toolbar>
        ) : null}

        <Section flush>
          <DataTable empty={error ? null : empty} {...table} />
        </Section>

        {below}
      </div>
    </PageLayout>
  );
}
