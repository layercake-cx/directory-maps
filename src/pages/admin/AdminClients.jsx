import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import CustomersFeaturePanel from "../../components/shell/CustomersFeaturePanel.jsx";
import { Link } from "react-router-dom";
import { listPlans } from "../../lib/entitlements.js";
import { listClientIdsWithBetaAccess } from "../../lib/featureFlags.js";
import { getRecentCustomerIds } from "../../lib/recentCustomers.js";
import {
  Button, Callout, DataTable, Dialog, EmptyState, Field, PageLayout, Section, TextInput, Toolbar,
} from "../../components/ui/index.js";
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
  const [view, setView] = useState("all");
  const [betaClientIds, setBetaClientIds] = useState([]);

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [
        { data: clientsData, error: clientsError },
        { data: mapsData, error: mapsError },
        { data: contactsData, error: contactsError },
        plansData,
      ] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, slug, plan_key, created_at, updated_at")
          .order("name", { ascending: true }),
        supabase.from("maps").select("client_id"),
        supabase.from("contacts").select("id, client_id, email, is_primary, created_at").order("created_at", { ascending: true }),
        // Optional: entitlements may not be migrated in every environment yet — must not block the customers list.
        listPlans().catch(() => []),
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

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = rows;
    if (view === "beta") {
      list = list.filter((r) => betaClientIds.includes(r.id));
    } else if (view !== "all") {
      list = list.filter((r) => r.plan_key === view);
    }
    if (!query) return list;
    return list.filter((r) => {
      return (
        (r.name ?? "").toLowerCase().includes(query) ||
        (r.slug ?? "").toLowerCase().includes(query) ||
        (r.id ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, q, view, betaClientIds]);

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
    { key: "name", label: "Customer", render: (r) => <strong>{r.name}</strong> },
    { key: "plan", label: "Plan", render: (r) => planNameByKey[r.plan_key] ?? r.plan_key ?? "—" },
    { key: "slug", label: "Slug" },
    { key: "maps", label: "Number of maps", render: (r) => mapCountByClientId[r.id] ?? 0 },
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
    { key: "created", label: "Created", render: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : "—") },
    { key: "updated", label: "Updated", render: (r) => (r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "—") },
  ];

  return (
    <AdminLayout
      panel={
        <CustomersFeaturePanel
          activeView={view}
          onSelectView={setView}
          allCount={rows.length}
          planCounts={planCounts}
          betaCount={betaClientIds.length}
          recentClients={recentClients}
        />
      }
    >
      <PageLayout
        head={{
          title: "Customers",
          actions: (
            <>
              <Button onClick={load}>Refresh</Button>
              <Button as={Link} to="/admin/clients/new" variant="primary">New customer</Button>
            </>
          ),
        }}
      >
        <div className="wc-stack">
          {err ? <Callout tone="danger">{err}</Callout> : null}

          <Section flush>
            <Toolbar className="wc-toolbar">
              <Field label="Search customers" className="wc-field-grow">
                <TextInput
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search customer name, slug, id…"
                />
              </Field>
            </Toolbar>
            <DataTable
              caption="Customers"
              columns={columns}
              rows={filtered}
              getRowId={(r) => r.id}
              getRowLabel={(r) => r.name}
              rowLink={(r) => `/admin/clients/${encodeURIComponent(r.id)}`}
              loading={loading}
              rowMenu={(r) => [
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
              ]}
              empty={
                <EmptyState
                  art="none"
                  title={rows.length === 0 ? "No customers yet" : "No customers match your search"}
                  actions={rows.length === 0 ? <Button as={Link} to="/admin/clients/new" variant="primary">New customer</Button> : null}
                />
              }
            />
          </Section>
        </div>
      </PageLayout>

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
