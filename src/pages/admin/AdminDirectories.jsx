import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import {
  Button, Callout, DataTable, EmptyState, Field, PageLayout, Pill, Section, TextInput, Toolbar,
} from "../../components/ui/index.js";
import "../../styles/wave-c/clients.css";

/**
 * Top-level, cross-client Directories list (DIR-E1 hardening) — mirrors
 * AdminMaps.jsx. Directories were previously only reachable via a per-customer
 * tab in AdminClientDetail.jsx; this gives admin the same "/admin/maps"-style
 * searchable overview for the Directories entity.
 */
export default function AdminDirectories() {
  const [directories, setDirectories] = useState([]);
  const [clientsById, setClientsById] = useState({});
  const [entryCountByDirectoryId, setEntryCountByDirectoryId] = useState({});
  const [q, setQ] = useState("");
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
          .select("id, name, slug, client_id, is_active")
          .order("name", { ascending: true }),
        supabase.from("clients").select("id, name, slug").order("name", { ascending: true }),
        supabase.from("directory_entries").select("directory_id"),
      ]);

      if (dirsError) throw dirsError;
      if (clientsError) throw clientsError;
      if (entriesError) throw entriesError;

      const byId = {};
      (clientsData ?? []).forEach((c) => { byId[c.id] = c; });

      const countByDirectoryId = {};
      (entriesData ?? []).forEach((row) => {
        if (row.directory_id) countByDirectoryId[row.directory_id] = (countByDirectoryId[row.directory_id] ?? 0) + 1;
      });

      setDirectories(dirsData ?? []);
      setClientsById(byId);
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

  const filtered = useMemo(() => {
    const query = (q || "").trim().toLowerCase();
    if (!query) return directories;
    return directories.filter((d) => {
      const client = clientsById[d.client_id];
      return (
        (d.name ?? "").toLowerCase().includes(query) ||
        (d.slug ?? "").toLowerCase().includes(query) ||
        (client?.name ?? "").toLowerCase().includes(query) ||
        (client?.slug ?? "").toLowerCase().includes(query)
      );
    });
  }, [directories, clientsById, q]);

  const adminUrlFor = (d) =>
    d.client_id ? `/admin/clients/${encodeURIComponent(d.client_id)}/directories/${encodeURIComponent(d.id)}` : null;

  const columns = [
    {
      key: "name",
      label: "Directory name",
      render: (d) => (
        <>
          <strong>{d.name ?? "—"}</strong>
          {d.slug ? <span className="wc-cell-sub">{d.slug}</span> : null}
        </>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      render: (d) => {
        const client = clientsById[d.client_id];
        return client ? (
          <Link to={`/admin/clients/${encodeURIComponent(d.client_id)}`}>{client.name}</Link>
        ) : (
          <span className="wc-muted">—</span>
        );
      },
    },
    { key: "entries", label: "Entries", render: (d) => entryCountByDirectoryId[d.id] ?? 0 },
    {
      key: "status",
      label: "Status",
      render: (d) => <Pill tone={d.is_active ? "ok" : "neutral"}>{d.is_active ? "Active" : "Archived"}</Pill>,
    },
  ];

  return (
    <AdminLayout>
      <PageLayout head={{ title: "Directories", actions: <Button onClick={load}>Refresh</Button> }}>
        <div className="wc-stack">
          {err ? <Callout tone="danger">{err}</Callout> : null}

          <Section flush>
            <Toolbar className="wc-toolbar">
              <Field label="Search directories" className="wc-field-grow">
                <TextInput
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by directory name or customer name…"
                />
              </Field>
            </Toolbar>
            <DataTable
              caption="Directories"
              columns={columns}
              rows={filtered}
              getRowId={(d) => d.id}
              getRowLabel={(d) => d.name ?? "directory"}
              rowLink={(d) => adminUrlFor(d) ?? "#"}
              loading={loading}
              empty={
                err ? null : (
                  <EmptyState
                    art="none"
                    title={directories.length === 0 ? "No directories yet" : "No directories match your search"}
                  />
                )
              }
            />
          </Section>
        </div>
      </PageLayout>
    </AdminLayout>
  );
}
