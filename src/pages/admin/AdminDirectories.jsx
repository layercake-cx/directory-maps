import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import {
  Button, EmptyState, ListPage, NameCell, Pill, formatListDate, useListView,
} from "../../components/ui/index.js";

const VIEWS = [
  { key: "all", label: "All directories" },
  { key: "published", label: "Published" },
  { key: "unpublished", label: "Not yet published" },
  { key: "archived", label: "Archived" },
];

/**
 * Platform › All directories (DIR-E1 hardening): the shared list layout with a Customer column,
 * across every customer. Mirrors AdminMaps.jsx.
 */
export default function AdminDirectories() {
  const [directories, setDirectories] = useState([]);
  const [clientsById, setClientsById] = useState({});
  const [entryCountByDirectoryId, setEntryCountByDirectoryId] = useState({});
  const [q, setQ] = useState("");
  const [view, setView] = useListView(VIEWS.map((v) => v.key));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [
        { data: dirsData, error: dirsError },
        { data: clientsData, error: clientsError },
        { data: entriesData, error: entriesError },
      ] = await Promise.all([
        supabase
          .from("directories")
          .select("id, name, slug, client_id, is_active, published_at, updated_at")
          .order("updated_at", { ascending: false }),
        supabase.from("clients").select("id, name, slug").order("name", { ascending: true }),
        supabase.from("directory_entries").select("directory_id"),
      ]);

      if (dirsError) throw dirsError;
      if (clientsError) throw clientsError;
      if (entriesError) throw entriesError;

      const countByDirectoryId = {};
      (entriesData ?? []).forEach((row) => {
        if (row.directory_id) countByDirectoryId[row.directory_id] = (countByDirectoryId[row.directory_id] ?? 0) + 1;
      });

      setDirectories(dirsData ?? []);
      setClientsById(Object.fromEntries((clientsData ?? []).map((c) => [c.id, c])));
      setEntryCountByDirectoryId(countByDirectoryId);
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(
    () => ({
      all: directories.filter((d) => d.is_active).length,
      published: directories.filter((d) => d.is_active && d.published_at).length,
      unpublished: directories.filter((d) => d.is_active && !d.published_at).length,
      archived: directories.filter((d) => !d.is_active).length,
    }),
    [directories],
  );

  const rows = useMemo(() => {
    let list;
    if (view === "published") list = directories.filter((d) => d.is_active && d.published_at);
    else if (view === "unpublished") list = directories.filter((d) => d.is_active && !d.published_at);
    else if (view === "archived") list = directories.filter((d) => !d.is_active);
    else list = directories.filter((d) => d.is_active);
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter((d) => {
      const c = clientsById[d.client_id];
      return [d.name, d.slug, c?.name, c?.slug].some((v) => (v ?? "").toLowerCase().includes(query));
    });
  }, [directories, clientsById, view, q]);

  const adminUrlFor = (d) =>
    d.client_id ? `/admin/clients/${encodeURIComponent(d.client_id)}/directories/${encodeURIComponent(d.id)}` : "#";

  const liveUrl = (d) => {
    const slug = clientsById[d.client_id]?.slug;
    return d.is_active && d.published_at && slug && d.slug ? `https://maps.layercake-cx.biz/directories/${slug}/${d.slug}` : null;
  };

  const rowMenu = (d) => {
    const open = { label: "Open", href: adminUrlFor(d) };
    const url = liveUrl(d);
    return url ? [open, { label: "View live site ↗", href: url }] : [open];
  };

  const columns = [
    { key: "name", label: "Directory", render: (d) => <NameCell name={d.name ?? "—"} sub={d.slug} /> },
    {
      key: "customer",
      label: "Customer",
      render: (d) => {
        const c = clientsById[d.client_id];
        return c ? <Link to={`/admin/clients/${encodeURIComponent(d.client_id)}`}>{c.name}</Link> : "—";
      },
    },
    {
      key: "status",
      label: "Status",
      render: (d) => {
        if (!d.is_active) return <Pill>Archived</Pill>;
        return d.published_at ? <Pill tone="live">Published</Pill> : <Pill tone="warn">Not yet published</Pill>;
      },
    },
    { key: "entries", label: "Entries", className: "cell-num", align: "right", render: (d) => entryCountByDirectoryId[d.id] ?? 0 },
    { key: "updated", label: "Updated", render: (d) => formatListDate(d.updated_at) },
  ];

  return (
    <AdminLayout>
      <ListPage
        head={{ title: "Directories", subtitle: "Every directory across all customers.", actions: <Button onClick={load}>Refresh</Button> }}
        noun="directories"
        error={err}
        itemCount={directories.length}
        alwaysShowToolbar
        views={{ label: "Filter directories", value: view, onChange: setView, options: VIEWS.map((v) => ({ ...v, count: counts[v.key] })) }}
        search={{ label: "Search directories", value: q, onChange: setQ, placeholder: "Search by directory name or customer…" }}
        emptyAll={<EmptyState art="none" title="No directories yet" />}
        table={{
          caption: "Directories",
          columns,
          rows,
          getRowId: (d) => d.id,
          getRowLabel: (d) => d.name ?? "directory",
          rowLink: adminUrlFor,
          rowMenu,
          loading,
        }}
      />
    </AdminLayout>
  );
}
