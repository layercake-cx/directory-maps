import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { Button, Callout, Checkbox, DataTable, EmptyState, Field, PageLayout, Pill, Section, Select, TextInput, Toolbar } from "../../components/ui/index.js";
import "../../styles/wave-b/map-pages.css";
import "../../styles/wave-c/maps-users.css";

export default function AdminListings() {
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);

  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [{ data: g, error: ge }, { data: l, error: le }] = await Promise.all([
        supabase.from("groups").select("id,name,sort_order").order("sort_order", { ascending: true }),
        supabase
          .from("listings")
          .select("id,name,postcode,country,group_id,is_active,updated_at,geocode_status")
          .order("updated_at", { ascending: false })
          .limit(1000),
      ]);

      if (ge) throw ge;
      if (le) throw le;

      setGroups(g ?? []);
      setRows(l ?? []);
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
    const query = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (activeOnly && !r.is_active) return false;
      if (groupId && r.group_id !== groupId) return false;
      if (!query) return true;

      return (
        (r.name ?? "").toLowerCase().includes(query) ||
        (r.postcode ?? "").toLowerCase().includes(query) ||
        (r.country ?? "").toLowerCase().includes(query) ||
        (r.id ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, q, groupId, activeOnly]);

  const columns = [
    {
      key: "name",
      label: "Name",
      render: (r) => (
        <>
          <Link to={`/admin/listings/${encodeURIComponent(r.id)}`} className="row-link">{r.name}</Link>
          <span className="mu-id">{r.id}</span>
        </>
      ),
    },
    { key: "group", label: "Group", render: (r) => groups.find((g) => g.id === r.group_id)?.name ?? "—" },
    { key: "active", label: "Active", render: (r) => (r.is_active ? <Pill tone="live">Active</Pill> : <Pill>Off</Pill>) },
    { key: "postcode", label: "Postcode", render: (r) => r.postcode ?? "—" },
    { key: "country", label: "Country", render: (r) => r.country ?? "—" },
    { key: "geocode", label: "Geocode", render: (r) => r.geocode_status ?? "—" },
    { key: "updated", label: "Updated", render: (r) => (r.updated_at ? new Date(r.updated_at).toLocaleString() : "—") },
  ];

  return (
    <AdminLayout>
      <PageLayout
        head={{
          title: "Maps",
          actions: <Button as={Link} variant="primary" to="/admin/listings/new">New listing</Button>,
        }}
      >
        <div className="mp-stack">
          {err ? <Callout tone="danger">{err}</Callout> : null}

          <Section>
            <div className="mp-stack">
              <Toolbar>
                <Field label="Search" className="mp-grow">
                  <TextInput
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search name, postcode, country, id…"
                  />
                </Field>
                <Field label="Group">
                  <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                    <option value="">All groups</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </Select>
                </Field>
                <Checkbox label="Active only" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
                <Button onClick={load}>Refresh</Button>
              </Toolbar>

              <DataTable
                columns={columns}
                rows={filtered}
                getRowId={(r) => r.id}
                getRowLabel={(r) => r.name}
                loading={loading}
                caption="Listings"
                empty={
                  rows.length === 0 ? (
                    <EmptyState art="welcome" title="No listings yet" body="Create a listing to see it here." actions={<Button as={Link} variant="primary" to="/admin/listings/new">New listing</Button>} />
                  ) : (
                    <EmptyState art="searching" title="No listings match" body="Try a different search or clear the filters." />
                  )
                }
              />
            </div>
          </Section>
        </div>
      </PageLayout>
    </AdminLayout>
  );
}
