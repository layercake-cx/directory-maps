import React, { useId } from "react";
import { Link } from "react-router-dom";
import Button from "./Button.jsx";
import { OverflowMenu } from "./overlays.jsx";
import { Skeleton } from "./feedback.jsx";
import { ArrowDownIcon, ArrowUpIcon } from "./icons.jsx";

/** Row above a table: search Field, filter Selects, secondary actions, primary action on the right. */
export function Toolbar({ className = "", children, ...rest }) {
  return <div className={`toolbar toolbar--wrap ${className}`.trim()} {...rest}>{children}</div>;
}

/** Replaces the toolbar's actions while rows are selected. */
export function BulkBar({ count, onClear, children, className = "", ...rest }) {
  return (
    <div className={`bulkbar ${className}`.trim()} role="region" aria-label="Bulk actions" {...rest}>
      <strong>{count} selected</strong>
      <div className="bulkbar-actions">{children}</div>
      <Button variant="ghost" size="sm" className="bulkbar-clear" onClick={onClear}>Clear selection</Button>
    </div>
  );
}

/**
 * StatTile: a number that links to the list behind it.
 * @param {{ label: string, value: React.ReactNode, sub?: React.ReactNode, tone?: "default"|"ok"|"warn",
 *   href?: string, compact?: boolean }} props
 */
export function StatTile({ label, value, sub, tone = "default", href, compact = false, className = "" }) {
  const cls = ["stat", compact && "stat--compact", tone !== "default" && `stat--${tone}`, className].filter(Boolean).join(" ");
  const inner = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub ? <span className="stat-sub">{sub}</span> : null}
    </>
  );
  return href ? <Link to={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function StatGrid({ compact = false, className = "", children, ...rest }) {
  return <div className={`stat-grid ${compact ? "stat-grid--compact" : ""} ${className}`.trim()} {...rest}>{children}</div>;
}

/**
 * ActionList: "Needs attention" rows (count, title, description, one verb). Zero-count rows are not rendered.
 * @param {{ items: {key: string, count: number, title: string, description?: string, verb: string, to?: string,
 *   onClick?: () => void, tone?: "warn", ai?: boolean}[] }} props
 */
export function ActionList({ items, className = "" }) {
  return (
    <div className={className}>
      {items.filter((i) => i.count > 0).map((i) => {
        const cls = `action-row ${i.tone === "warn" ? "action-row--warn" : ""}`.trim();
        const inner = (
          <>
            <span className="action-count">{i.count}</span>
            <span className="action-text">
              <span className="setting-row-label">{i.title}</span>
              {i.description ? <span className="setting-row-desc">{i.description}</span> : null}
            </span>
            <span className="action-verb">{i.verb}</span>
          </>
        );
        return i.to ? (
          <Link key={i.key} to={i.to} className={cls}>{inner}</Link>
        ) : (
          <button key={i.key} type="button" className={`${cls} action-row--button`} onClick={i.onClick}>{inner}</button>
        );
      })}
    </div>
  );
}

/**
 * DataTable: one table for every list.
 * @param {{
 *   columns: {key: string, label: string, render?: (row: any) => React.ReactNode, sortable?: boolean, width?: string|number, align?: "left"|"right"|"center", className?: string}[],
 *   rows: any[],
 *   getRowId?: (row: any) => string,
 *   getRowLabel?: (row: any) => string,       // names the row for checkboxes and menus (default: first column text)
 *   rowLink?: (row: any) => string,           // the first column's cell becomes the link
 *   selectable?: boolean, selected?: string[], onSelectedChange?: (ids: string[]) => void,
 *   rowMenu?: (row: any) => {label: string, onSelect?: () => void, href?: string, danger?: boolean, disabled?: boolean}[],
 *   sort?: {key: string, dir: "asc"|"desc"}, onSortChange?: (sort: {key: string, dir: "asc"|"desc"}) => void,
 *   loading?: boolean, empty?: React.ReactNode,
 *   pagination?: {page: number, pageSize: number, total: number, onPage: (page: number) => void},
 *   caption?: string,
 * }} props
 */
export function DataTable({
  columns, rows, getRowId = (r) => r.id, getRowLabel, rowLink, selectable = false, selected = [], onSelectedChange,
  rowMenu, sort, onSortChange, loading = false, empty, pagination, caption, className = "",
}) {
  const uid = useId();
  const label = (row) => (getRowLabel ? getRowLabel(row) : String(row[columns[0]?.key] ?? ""));
  const allIds = rows.map(getRowId);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const toggleAll = () => onSelectedChange?.(allSelected ? [] : allIds);
  const toggleOne = (id) => onSelectedChange?.(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  if (loading) return <Skeleton variant="table" label="Loading table" />;

  const showEmpty = rows.length === 0 && empty;
  const colSpan = columns.length + (selectable ? 1 : 0) + (rowMenu ? 1 : 0);
  const from = pagination ? (pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1) : 0;
  const to = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0;

  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table className="table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {selectable ? (
              <th className="table-check">
                <input type="checkbox" aria-label="Select all rows" checked={allSelected} onChange={toggleAll} />
              </th>
            ) : null}
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = c.sortable ? (active ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined;
              const style = c.width != null || c.align ? { width: c.width, textAlign: c.align } : undefined; // dynamic per-column values
              return (
                <th key={c.key} aria-sort={ariaSort} className={c.className} style={style}>
                  {c.sortable ? (
                    <button type="button" className="th-sort" onClick={() => onSortChange?.({ key: c.key, dir: active && sort.dir === "asc" ? "desc" : "asc" })}>
                      {c.label}
                      {active ? (sort.dir === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />) : null}
                    </button>
                  ) : c.label}
                </th>
              );
            })}
            {rowMenu ? <th className="table-menu"><span className="sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {showEmpty ? (
            <tr><td colSpan={colSpan} className="table-empty">{empty}</td></tr>
          ) : rows.map((row) => {
            const id = getRowId(row);
            const isSel = selected.includes(id);
            return (
              <tr key={id} aria-selected={selectable ? (isSel ? "true" : "false") : undefined}>
                {selectable ? (
                  <td className="table-check">
                    <input type="checkbox" aria-label={`Select ${label(row)}`} checked={isSel} onChange={() => toggleOne(id)} />
                  </td>
                ) : null}
                {columns.map((c, i) => {
                  const content = c.render ? c.render(row) : row[c.key];
                  return (
                    <td key={c.key} className={c.className} style={c.align ? { textAlign: c.align } : undefined}>
                      {i === 0 && rowLink ? <Link to={rowLink(row)} className="row-link">{content}</Link> : content}
                    </td>
                  );
                })}
                {rowMenu ? (
                  <td className="table-menu">
                    <OverflowMenu label={`Actions for ${label(row)}`} items={rowMenu(row)} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {pagination ? (
        <div className="table-foot">
          <span id={`${uid}-range`}>{from}–{to} of {pagination.total.toLocaleString()}</span>
          <span className="table-foot-actions">
            <Button size="sm" disabled={pagination.page <= 1} onClick={() => pagination.onPage(pagination.page - 1)}>Previous</Button>
            <Button size="sm" disabled={to >= pagination.total} onClick={() => pagination.onPage(pagination.page + 1)}>Next</Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
