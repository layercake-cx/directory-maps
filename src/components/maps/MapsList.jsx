import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BulkBar, Button, EmptyState, ListPage, NameCell, Pill, formatListDate, useListView,
} from "../ui/index.js";
import { useArchiveFlow } from "../archive/useArchiveFlow.jsx";

const VIEWS = [
  { key: "all", label: "All maps" },
  { key: "published", label: "Published" },
  { key: "unpublished", label: "Not yet published" },
  { key: "archived", label: "Archived" },
];

/** Where a map's pins come from: the column label and the one-line context under the name. */
export function mapDataSource(map) {
  const src = map.map_data_sources?.[0];
  const hasListings = (map.listings?.[0]?.count ?? 0) > 0;
  if (map.directory) {
    return { label: "Directory", sub: map.directory.name ? `Pins from ${map.directory.name}` : "Pins from its directory" };
  }
  if (src?.provider === "google_sheets") {
    return { label: "Google Sheets", sub: src.spreadsheet_id ? `Google Sheets · ${src.sheet_name || "sheet"}` : "Google Sheets · no file selected" };
  }
  if (hasListings) return { label: "Uploaded file", sub: "Uploaded file" };
  return { label: "None", sub: "No data source yet" };
}

/**
 * Maps list, shared by the client portal (/client/maps), a customer's Maps tab and the platform All maps
 * screen (`showCustomer`). Archived is its own view; it stays empty until maps can be archived.
 *
 * @param {{ maps: any[], mapHref: (m: any) => string, newMapAction?: React.ReactNode, head?: object,
 *   notice?: React.ReactNode, error?: string, loading?: boolean, clientSlug?: string,
 *   clientsById?: Record<string, {name: string, slug: string}>, showCustomer?: boolean }} props
 */
export default function MapsList({
  maps, mapHref, newMapAction = null, head, notice, error, loading, clientSlug, clientsById = {}, showCustomer = false,
  canManage = false, isStaff = false, onChanged,
}) {
  const [view, setView] = useListView(VIEWS.map((v) => v.key));
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]);
  const { requestArchive, restore, dialog } = useArchiveFlow({
    entityType: "map",
    isStaff,
    onChanged: () => { setSelected([]); onChanged?.(); },
  });
  const isArchived = (m) => m.is_active === false; // is_active arrives with the archive migration

  const counts = useMemo(
    () => ({
      all: maps.filter((m) => !isArchived(m)).length,
      published: maps.filter((m) => !isArchived(m) && m.published_at).length,
      unpublished: maps.filter((m) => !isArchived(m) && !m.published_at).length,
      archived: maps.filter(isArchived).length,
    }),
    [maps],
  );

  const rows = useMemo(() => {
    let list;
    if (view === "published") list = maps.filter((m) => !isArchived(m) && m.published_at);
    else if (view === "unpublished") list = maps.filter((m) => !isArchived(m) && !m.published_at);
    else if (view === "archived") list = maps.filter(isArchived);
    else list = maps.filter((m) => !isArchived(m));
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter((m) => {
      const c = clientsById[m.client_id];
      return [m.name, m.slug, m.id, c?.name, c?.slug].some((v) => (v ?? "").toLowerCase().includes(query));
    });
  }, [maps, view, q, clientsById]);

  const columns = [
    { key: "name", label: "Map", render: (m) => <NameCell name={m.name ?? "—"} sub={mapDataSource(m).sub} /> },
    ...(showCustomer
      ? [{
          key: "customer",
          label: "Customer",
          render: (m) => {
            const c = clientsById[m.client_id];
            return c ? <Link to={`/admin/clients/${encodeURIComponent(m.client_id)}`}>{c.name}</Link> : "—";
          },
        }]
      : []),
    {
      key: "status",
      label: "Status",
      render: (m) => (isArchived(m) ? <Pill>Archived</Pill> : <Pill tone={m.published_at ? "live" : "neutral"}>{m.published_at ? "Published" : "Draft"}</Pill>),
    },
    { key: "source", label: "Data source", render: (m) => mapDataSource(m).label },
    { key: "listings", label: "Listings", className: "cell-num", align: "right", render: (m) => m.listings?.[0]?.count ?? 0 },
    { key: "updated", label: "Updated", render: (m) => formatListDate(m.updated_at) },
  ];

  const liveUrl = (m) => {
    const slug = showCustomer ? clientsById[m.client_id]?.slug : clientSlug;
    if (isArchived(m) || !m.published_at || !slug || !m.slug) return null;
    return `${window.location.origin}/${slug}/${m.slug}`;
  };

  const rowMenu = (m) => {
    const open = { label: "Open", href: mapHref(m) };
    if (isArchived(m)) return canManage ? [{ label: "Restore", onSelect: () => restore([m]) }, open] : [open];
    const items = [open];
    const url = liveUrl(m);
    if (url) items.push({ label: "View live map ↗", href: url });
    if (canManage) items.push({ divider: true }, { label: "Archive…", danger: true, onSelect: () => requestArchive([m]) });
    return items;
  };

  return (
    <>
    <ListPage
      head={head}
      notice={notice}
      error={error}
      noun="maps"
      itemCount={maps.length}
      alwaysShowToolbar={showCustomer}
      views={{ label: "Filter maps", value: view, onChange: setView, options: VIEWS.map((v) => ({ ...v, count: counts[v.key] })) }}
      search={{ label: "Search maps", value: q, onChange: setQ, placeholder: showCustomer ? "Search by map name or customer…" : "Search by map name…" }}
      emptyAll={<EmptyState title="No maps yet" body="Start from scratch and visualise your data as an interactive map." actions={newMapAction} />}
      table={{
        caption: "Maps",
        columns,
        rows,
        getRowId: (m) => m.id,
        getRowLabel: (m) => m.name ?? "Map",
        rowLink: mapHref,
        rowMenu,
        loading,
        selectable: canManage && view !== "archived",
        selected,
        onSelectedChange: setSelected,
      }}
      bulkBar={
        selected.length > 0 ? (
          <BulkBar count={selected.length} onClear={() => setSelected([])}>
            <Button variant="danger" onClick={() => requestArchive(maps.filter((m) => selected.includes(m.id)), "bulk")}>Archive…</Button>
          </BulkBar>
        ) : null
      }
    />
    {dialog}
    </>
  );
}
