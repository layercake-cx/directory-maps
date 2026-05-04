import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";
import { Link, useNavigate } from "react-router-dom";
import { startImpersonatingClient } from "../../lib/clientAuth";

const TRASH_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const PERSON_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z" />
    <path d="M5 20c0-3.31 3.134-6 7-6s7 2.69 7 6" />
  </svg>
);

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
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [mapCountByClientId, setMapCountByClientId] = useState({});
  const [primaryContactByClientId, setPrimaryContactByClientId] = useState({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [clientToDelete, setClientToDelete] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [
        { data: clientsData, error: clientsError },
        { data: mapsData, error: mapsError },
        { data: contactsData, error: contactsError },
      ] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, slug, created_at, updated_at")
          .order("name", { ascending: true }),
        supabase.from("maps").select("client_id"),
        supabase.from("contacts").select("id, client_id, email, is_primary, created_at").order("created_at", { ascending: true }),
      ]);

      if (clientsError) throw clientsError;
      if (mapsError) throw mapsError;
      if (contactsError) throw contactsError;

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
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((r) => {
      return (
        (r.name ?? "").toLowerCase().includes(query) ||
        (r.slug ?? "").toLowerCase().includes(query) ||
        (r.id ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, q]);

  return (
    <AdminLayout
      breadcrumbs={[{ label: "Customers" }]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div className="admin-controls">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customer name, slug, id…"
          />

          <button className="btn" onClick={load} type="button">
            Refresh
          </button>

          <Link className="btn btn-primary" to="/admin/clients/new">
            New customer
          </Link>
        </div>

        {loading ? <p style={{ marginTop: 12 }}>Loading…</p> : null}
        {err ? <p style={{ marginTop: 12 }}>{err}</p> : null}

        <table className="admin-table">
          <thead>
            <tr>
              {["Customer", "Slug", "Number of maps", "Primary contact", "Created", "Updated", ""].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => {
              const mapCount = mapCountByClientId[r.id] ?? 0;
              const canDelete = mapCount === 0;
              const primaryContact = primaryContactByClientId[r.id];
              return (
                <tr key={r.id}>
                  <td>
                    <Link
                      to={`/admin/clients/${encodeURIComponent(r.id)}`}
                      style={{ fontWeight: 600, color: "inherit" }}
                    >
                      <strong>{r.name}</strong>
                    </Link>
                  </td>

                  <td>{r.slug}</td>

                  <td>{mapCount}</td>

                  <td>
                    {primaryContact ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Link to={`/admin/clients/${encodeURIComponent(r.id)}/contacts/${encodeURIComponent(primaryContact.id)}`}>
                          {primaryContact.email}
                        </Link>
                        {primaryContact.email && primaryContact.email !== "No contact set" ? (
                          <button
                            type="button"
                            className="admin-table__icon-btn"
                            title="Impersonate customer in portal"
                            aria-label={`Impersonate customer ${r.name}`}
                            onClick={() => {
                              const ok = window.confirm(`Are you sure you wish to impersonate ${r.name}?`);
                              if (!ok) return;
                              startImpersonatingClient(r.id);
                              navigate("/client");
                            }}
                          >
                            {PERSON_ICON}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td>
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString()
                      : "—"}
                  </td>

                  <td>
                    {r.updated_at
                      ? new Date(r.updated_at).toLocaleDateString()
                      : "—"}
                  </td>

                  <td style={{ width: 44, textAlign: "right" }}>
                    {canDelete ? (
                      <button
                        type="button"
                        className="admin-table__delete-btn"
                        onClick={() => {
                          setClientToDelete({ id: r.id, name: r.name });
                          setDeleteConfirmText("");
                        }}
                        title="Delete customer"
                        aria-label={`Delete customer ${r.name}`}
                      >
                        {TRASH_ICON}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {clientToDelete ? (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-customer-title">
          <div className="admin-modal">
            <h2 id="delete-customer-title" className="admin-modal__title">Delete customer</h2>
            <p className="admin-modal__message">
              Are you sure you want to permanently delete the customer &quot;{clientToDelete.name}&quot;? This cannot be undone.
            </p>
            <p className="admin-modal__hint">Type <strong>delete</strong> below to confirm.</p>
            <input
              type="text"
              className="admin-modal__input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              autoComplete="off"
              autoFocus
              aria-label="Type delete to confirm"
            />
            <div className="admin-modal__actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setClientToDelete(null);
                  setDeleteConfirmText("");
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDelete}
                disabled={deleteConfirmText.trim().toLowerCase() !== "delete" || deleting}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}