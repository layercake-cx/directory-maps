import React, { createContext, useContext } from "react";
import Button from "./Button.jsx";
import { Callout } from "./feedback.jsx";
import { formatListDate } from "./list.jsx";

const ReadOnlyContext = createContext(false);

/** True inside an archived directory, map or customer: hide publish, sync, import, AI and invite actions. */
export function useReadOnly() {
  return useContext(ReadOnlyContext);
}

/**
 * Wraps an archived page's forms: every native input and button inside is disabled (navigation, viewing and
 * exporting use links, which a disabled fieldset leaves alone) and children can read useReadOnly().
 * Renders children unchanged when not read-only.
 */
export function ReadOnly({ active, children }) {
  if (!active) return <ReadOnlyContext.Provider value={false}>{children}</ReadOnlyContext.Provider>;
  return (
    <ReadOnlyContext.Provider value>
      <fieldset disabled className="readonly-fieldset">{children}</fieldset>
    </ReadOnlyContext.Provider>
  );
}

/**
 * ArchivedBanner (warn tone), shown under the PageHead on every page of an archived directory, map or customer.
 * @param {{ thing: "directory"|"map"|"customer", archivedAt?: string|null, archivedBy?: string|null,
 *   onRestore?: () => void, restoring?: boolean }} props `onRestore` omitted = viewer cannot restore.
 */
export function ArchivedBanner({ thing, archivedAt, archivedBy, onRestore, restoring = false }) {
  const when = archivedAt ? ` Archived ${formatListDate(archivedAt)}${archivedBy ? ` by ${archivedBy}` : ""}.` : "";
  return (
    <Callout
      tone="warn"
      action={onRestore ? <Button onClick={onRestore} loading={restoring} loadingLabel="Restoring…">Restore {thing}</Button> : null}
    >
      <strong>This {thing} is archived.</strong> It&rsquo;s offline and read-only.{when}
    </Callout>
  );
}
