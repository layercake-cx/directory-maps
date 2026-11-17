import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import CustomersFeaturePanel from "../../components/shell/CustomersFeaturePanel.jsx";
import { Link } from "react-router-dom";
import { listPlans } from "../../lib/entitlements.js";
import { listClientIdsWithBetaAccess } from "../../lib/featureFlags.js";
import { getRecentCustomerIds } from "../../lib/recentCustomers.js";
import {
  Button, Dialog, EmptyState, Field, ListPage, NameCell, Pill, Select, TextInput, formatListDate, useListView,
} from "../../components/ui/index.js";
import { useArchiveFlow } from "../../components/archive/useArchiveFlow.jsx";
import "../../styles/wave-c/clients.css";

function buildPrimaryContactByClientId(contacts) {
  const byClient = {};
  const list = (contacts ?? []).filter((c) => c.client_id);
  list.sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  for (const c of list) {
    if (!byClient[c.client_id]) byClient[c.client_id] = c;
  }
  return byClient;
}

export default function AdminClients() {
  const [rows, setRows] = useState([]);
  const [mapCountByClientId, setMapCountByClientId] = useState({});
  const [primaryContactByClientId, setPrimaryContactByClientId] = useState({});
  const [planNameByKey, setPlanNameByKey] = useState({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [clientToDelete, setClientToDelete] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useListView(["all", "archived"]);
  const [planFilter, setPlanFilter] = useState("all");
  const [betaFilter, setBetaFilter] = useState("all");
  const [directoryCountByClientId, setDirectoryCountByClientId] = useState({});
  const [betaClientIds, setBetaClientIds] = useState([]);
  const { requestArchive, restore, dialog: archiveDialog } = useArchiveFlow({
    entityType: "client",
    isStaff: true,
    onChanged: () => load(),
  });

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [
        { data: clientsData, error: clientsError },
        { data: mapsData, error: mapsError },
        { data: contactsData, error: contactsError },
        plansData,
        { data: directoriesData },
      ] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, slug, plan_key, is_active, archived_at, archived_by, created_at, updated_at")
          .order("name", { ascending: true }),
        supabase.from("maps").select("client_id"),
        supabase.from("contacts").select("id, client_id, email, is_primary, created_at").order("created_at", { ascending: true }),
        // Optional: entitlements may not be migrated in every environment yet — must not block the customers list.
        listPlans().catch(() => []),
        // Optional: a directories read failure must not block the customers list.
        supabase.from("directories").select("client_id"),
      ]);

      if (clientsError) throw clientsError;
      if (mapsError) throw mapsError;
      if (contactsError) throw contactsError;

      setPlanNameByKey(
        (plansData ?? []).reduce((acc, p) => {
          acc[p.key] = p.name;
          return acc;
        }, {})
      );

      const countByClient = (mapsData ?? []).reduce((acc, m) => {
        if (m.client_id) acc[m.client_id] = (acc[m.client_id] ?? 0) + 1;
        return acc;
      }, {});

      let primaryByClient = buildPrimaryContactByClientId(contactsData);
      const clientIds = (clientsData ?? []).map((r) => r.id);
      const clientsWithoutContact = clientIds.filter((id) => !primaryByClient[id]);

      if (clientsWithoutContact.length > 0) {
        for (const cid of clientsWithoutContact) {
          await supabase.from("contacts").insert({
            client_id: cid,
            email: "No contact set",
            is_primary: true,
          });
        }
        const { data: refetched } = await supabase
          .from("contacts")
          .select("id, client_id, email, is_primary, created_at")
          .order("created_at", { ascending: true });
        primaryByClient = buildPrimaryContactByClientId(refetched);
      }

      setDirectoryCountByClientId(
        (directoriesData ?? []).reduce((acc, d) => {
          if (d.client_id) acc[d.client_id] = (acc[d.client_id] ?? 0) + 1;
          return acc;
        }, {}),
      );
      setRows(clientsData ?? []);
      setMapCountByClientId(countByClient);
      setPrimaryContactByClientId(primaryByClient);
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    if (!clientToDelete || deleteConfirmText.trim().toLowerCase() !== "delete") return;
    try {
      setDeleting(true);
      const { error } = await supabase.from("clients").delete().eq("id", clientToDelete.id);
      if (error) throw error;
      setClientToDelete(null);
      setDeleteConfirmText("");
      await load();
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    load();
    listClientIdsWithBetaAccess().then(setBetaClientIds).catch(() => {});
  }, []);

  const isArchived = (r) => r.is_active === false; // is_active arrives with the archive migration

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = rows.filter((r) => (view === "archived" ? isArchived(r) : !isArchived(r)));
    if (planFilter !== "all") list = list.filter((r) => (r.plan_key || "—") === planFilter);
    if (betaFilter === "beta") list = list.filter((r) => betaClientIds.includes(r.id));
    if (!query) return list;
    return list.filter((r) =>
      [r.name, r.slug, r.id].some((v) => (v ?? "").toLowerCase().includes(query)),
    );
  }, [rows, q, view, planFilter, betaFilter, betaClientIds]);

  const viewCounts = useMemo(
    () => ({ all: rows.filter((r) => !isArchived(r)).length, archived: rows.filter(isArchived).length }),
    [rows],
  );

  const planCounts = useMemo(() => {
    const counts = {};
    for (const r of rows) {
      const key = r.plan_key || "—";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => (planNameByKey[a[0]] ?? a[0]).localeCompare(planNameByKey[b[0]] ?? b[0]))
      .map(([key, count]) => ({ key, label: planNameByKey[key] ?? key, count }));
  }, [rows, planNameByKey]);

  const recentClients = useMemo(
    () => getRecentCustomerIds().map((id) => rows.find((r) => r.id === id)).filter(Boolean),
    [rows],
  );

  const columns = [
    {
      key: "name",
      label: "Customer",
      render: (r) => <NameCell name={r.name} sub={r.slug ? <span className="cell-mono">{r.slug}</span> : null} />,
    },
    { key: "plan", label: "Plan", render: (r) => planNameByKey[r.plan_key] ?? r.plan_key ?? "—" },
    { key: "status", label: "Status", render: (r) => (isArchived(r) ? <Pill>Archived</Pill> : <Pill tone="live">Active</Pill>) },
    { key: "maps", label: "Maps", className: "cell-num", align: "right", render: (r) => mapCountByClientId[r.id] ?? 0 },
    { key: "directories", label: "Directories", className: "cell-num", align: "right", render: (r) => directoryCountByClientId[r.id] ?? 0 },
    {
      key: "primary",
      label: "Primary contact",
      render: (r) => {
        const primaryContact = primaryContactByClientId[r.id];
        return primaryContact ? (
          <Link to={`/admin/clients/${encodeURIComponent(r.id)}/contacts/${encodeURIComponent(primaryContact.id)}`}>
            {primaryContact.email}
          </Link>
        ) : (
          "—"
        );
      },
    },
    { key: "updated", label: "Updated", render: (r) => formatListDate(r.updated_at) },
  ];

  const filters = (
    <>
      <Field label="Plan">
        <Select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          options={[{ value: "all", label: "All plans" }, ...planCounts.map((p) => ({ value: p.key, label: `${p.label} (${p.count})` }))]}
        />
      </Field>
      {betaClientIds.length > 0 ? (
        <Field label="Beta access">
          <Select
            value={betaFilter}
            onChange={(e) => setBetaFilter(e.target.value)}
            options={[{ value: "all", label: "Everyone" }, { value: "beta", label: `With beta access (${betaClientIds.length})` }]}
          />
        </Field>
      ) : null}
    </>
  );

  return (
    <AdminLayout panel={<CustomersFeaturePanel recentClients={recentClients} />}>
      <ListPage
        head={{
          title: "Customers",
          subtitle: "Every organisation on the platform.",
          actions: (
            <>
              <Button onClick={load}>Refresh</Button>
              <Button as={Link} to="/admin/clients/new" variant="primary">New customer</Button>
            </>
          ),
        }}
        noun="customers"
        error={err}
        itemCount={rows.length}
        alwaysShowToolbar
        views={{
          label: "Filter customers",
          value: view,
          onChange: setView,
          options: [
            { key: "all", label: "All customers", count: viewCounts.all },
            { key: "archived", label: "Archived", count: viewCounts.archived },
          ],
        }}
        search={{ label: "Search customers", value: q, onChange: setQ, placeholder: "Search customer name, slug, id…" }}
        filters={filters}
        emptyAll={
          <EmptyState
            art="none"
            title="No customers yet"
            actions={<Button as={Link} to="/admin/clients/new" variant="primary">New customer</Button>}
          />
        }
        table={{
          caption: "Customers",
          columns,
          rows: filtered,
          getRowId: (r) => r.id,
          getRowLabel: (r) => r.name,
          rowLink: (r) => `/admin/clients/${encodeURIComponent(r.id)}`,
          loading,
          rowMenu: (r) => isArchived(r)
            ? [{ label: "Restore", onSelect: () => restore([r]) }, { label: "Open (read-only)", href: `/admin/clients/${encodeURIComponent(r.id)}` }]
            : [
            { label: "Open", href: `/admin/clients/${encodeURIComponent(r.id)}` },
            { divider: true },
            { label: "Archive…", danger: true, onSelect: () => requestArchive([r]) },
            (mapCountByClientId[r.id] ?? 0) === 0
              ? {
                  label: "Delete customer",
                  danger: true,
                  onSelect: () => {
                    setClientToDelete({ id: r.id, name: r.name });
                    setDeleteConfirmText("");
                  },
                }
              : { label: "Delete customer (remove maps first)", danger: true, disabled: true },
          ],
        }}
      />

      {archiveDialog}

      {clientToDelete ? (
        <Dialog
          title="Delete customer"
          onClose={() => {
            if (deleting) return;
            setClientToDelete(null);
            setDeleteConfirmText("");
          }}
          footer={
            <>
              <Button
                onClick={() => {
                  setClientToDelete(null);
                  setDeleteConfirmText("");
                }}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger-solid"
                onClick={confirmDelete}
                disabled={deleteConfirmText.trim().toLowerCase() !== "delete"}
                loading={deleting}
                loadingLabel="Deleting…"
              >
                Delete permanently
              </Button>
            </>
          }
        >
          <p>
            Are you sure you want to permanently delete the customer &quot;{clientToDelete.name}&quot;? This cannot be undone.
          </p>
          <Field label="Type delete to confirm" hint="Type delete below to confirm.">
            <TextInput
              data-autofocus
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              autoComplete="off"
            />
          </Field>
        </Dialog>
      ) : null}
    </AdminLayout>
  );
}
