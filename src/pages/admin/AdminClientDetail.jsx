import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";
import { startImpersonatingClient } from "../../lib/clientAuth";
import { createAdminClientUser, deleteAdminClientUser } from "../../lib/adminClientUsers.js";
import MessagingSettings from "../../components/MessagingSettings.jsx";

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.8 }}>{label}</div>
      <div className="admin-controls" style={{ marginTop: 0 }}>{children}</div>
    </div>
  );
}

const TRASH_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export default function AdminClientDetail() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [primaryContact, setPrimaryContact] = useState(null);
  const [contactsList, setContactsList] = useState([]);
  const [maps, setMaps] = useState([]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [subscriptionActiveOverride, setSubscriptionActiveOverride] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addCanManageMaps, setAddCanManageMaps] = useState(false);
  const [addCanManageUsers, setAddCanManageUsers] = useState(false);
  const [adding, setAdding] = useState(false);

  const [activeTab, setActiveTab] = useState("maps");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [usersWarning, setUsersWarning] = useState("");
  const [contactToDelete, setContactToDelete] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingContact, setDeletingContact] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [
        { data: c, error: ce },
        { data: m, error: me },
        { data: contactsData },
        { data: allContacts },
      ] = await Promise.all([
        supabase
          .from("clients")
          .select("id,name,slug,subscription_active_override,created_at,updated_at")
          .eq("id", clientId)
          .single(),
        supabase
          .from("maps")
          .select("id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering")
          .eq("client_id", clientId)
          .order("name", { ascending: true }),
        supabase
          .from("contacts")
          .select("id, client_id, email, name, is_primary")
          .eq("client_id", clientId)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1),
        supabase
          .from("contacts")
          .select("id, client_id, user_id, email, name, is_primary, can_manage_maps, can_manage_users")
          .eq("client_id", clientId)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true }),
      ]);

      if (ce) throw ce;
      if (me) throw me;

      setClient(c);
      setMaps(m ?? []);
      setContactsList(allContacts ?? []);

      const primary = contactsData?.[0] ?? null;
      setPrimaryContact(primary);
      setName(c?.name ?? "");
      setSlug(c?.slug ?? "");
      setSubscriptionActiveOverride(!!c?.subscription_active_override);
      setContactName(primary?.name ?? "");
      setContactEmail(primary?.email ?? "");
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [clientId]);

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    const cleanName = name.trim();
    const cleanSlug = slug.trim();
    const email = contactEmail.trim();
    const contactNameTrimmed = contactName.trim();
    if (!cleanName) return setErr("Customer name is required.");
    if (!cleanSlug) return setErr("Slug is required.");
    if (!email) return setErr("Primary contact email is required.");

    try {
      setSaving(true);

      const { error: clientError } = await supabase
        .from("clients")
        .update({
          name: cleanName,
          slug: cleanSlug,
          subscription_active_override: subscriptionActiveOverride,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientId);

      if (clientError) throw clientError;

      if (primaryContact) {
        const { error: contactError } = await supabase
          .from("contacts")
          .update({
            email,
            name: contactNameTrimmed || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", primaryContact.id);

        if (contactError) throw contactError;
      } else {
        const { error: contactError } = await supabase.from("contacts").insert({
          client_id: clientId,
          email,
          name: contactNameTrimmed || null,
          is_primary: true,
        });
        if (contactError) throw contactError;
      }

      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddUser(e) {
    e.preventDefault();
    const email = addEmail.trim();
    const nameVal = addName.trim();
    if (!email) {
      setErr("Email is required.");
      return;
    }
    if (!nameVal) {
      setErr("Name is required.");
      return;
    }
    setErr("");
    setNotice("");
    setUsersWarning("");
    setAdding(true);
    try {
      const result = await createAdminClientUser({
        clientId,
        email,
        name: nameVal,
        canManageMaps: addCanManageMaps,
        canManageUsers: addCanManageUsers,
      });
      setNotice(`Invitation sent to ${email}. The user will appear after they create their password and accept.`);
      setAddEmail("");
      setAddName("");
      setAddCanManageMaps(false);
      setAddCanManageUsers(false);
      await load();
    } catch (e) {
      setNotice("");
      setErr(e?.message ?? String(e));
    } finally {
      setAdding(false);
    }
  }

  async function updateContactPermissions(contactId, can_manage_maps, can_manage_users) {
    setErr("");
    setUsersWarning("");
    try {
      const { error } = await supabase
        .from("contacts")
        .update({ can_manage_maps, can_manage_users, updated_at: new Date().toISOString() })
        .eq("id", contactId)
        .eq("client_id", clientId);
      if (error) throw error;
      setContactsList((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, can_manage_maps, can_manage_users } : c))
      );
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function confirmDeleteContact() {
    if (!contactToDelete || deleteConfirmText.trim().toLowerCase() !== "delete") return;
    setErr("");
    setUsersWarning("");
    setDeletingContact(true);
    try {
      await deleteAdminClientUser({
        clientId,
        contactId: contactToDelete.id,
      });
      setContactToDelete(null);
      setDeleteConfirmText("");
      await load();
    } catch (e) {
      const raw = e?.message ?? String(e);
      const assoc = e?.associatedClients;
      if (Array.isArray(assoc) && assoc.length > 0) {
        const names = assoc.map((c) => c.name || c.id).join(", ");
        setUsersWarning(`This user is associated with another client and cannot be deleted. Associated clients: ${names}.`);
      } else {
        setErr(raw);
      }
    } finally {
      setDeletingContact(false);
    }
  }

  function handleImpersonate(contactRow) {
    if (!contactRow.user_id) return;
    const ok = window.confirm(`Impersonate ${contactRow.email} as ${client?.name}?`);
    if (!ok) return;
    startImpersonatingClient(clientId);
    navigate("/client");
  }

  const CLIENT_NAV_ITEMS = [
    { label: "Maps", value: "maps" },
    { label: "Customer details", value: "details" },
    { label: "Users", value: "users" },
    { label: "Messaging", value: "messaging" },
  ];

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: client?.name ?? "…", path: `/admin/clients/${encodeURIComponent(clientId)}` },
      ]}
      clientNavItems={CLIENT_NAV_ITEMS}
      activeClientTab={activeTab}
      onClientTabChange={setActiveTab}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ marginBottom: 12 }}>
          <Link to="/admin/clients">← Back to customers</Link>
        </div>

        {loading ? (
          <p>Loading…</p>
        ) : (
          <>

            {activeTab === "maps" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Maps</h3>
                  <Link className="btn btn-primary" to={`/admin/clients/${encodeURIComponent(clientId)}/maps/new`}>
                    New map
                  </Link>
                </div>

                {maps.length === 0 ? (
                  <p style={{ marginTop: 8, opacity: 0.8 }}>No maps yet for this customer.</p>
                ) : (
                  <table className="admin-table" style={{ marginTop: 0 }}>
                    <thead>
                      <tr>
                        {["Map", "Slug", "Defaults", "Options"].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {maps.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <Link to={`/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(m.id)}`}>
                              {m.name}
                            </Link>
                            <div style={{ fontSize: 11, opacity: 0.6 }}>{m.id}</div>
                          </td>
                          <td>{m.slug}</td>
                          <td>
                            <span style={{ opacity: 0.85 }}>
                              {Number(m.default_lat).toFixed(4)}, {Number(m.default_lng).toFixed(4)} · z{m.default_zoom}
                            </span>
                          </td>
                          <td>
                            <span className="badge">{m.show_list_panel ? "List on" : "List off"}</span>{" "}
                            <span className="badge">{m.enable_clustering ? "Cluster on" : "Cluster off"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === "details" && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <h2 style={{ margin: "0 0 8px 0" }}>Customer details</h2>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>ID: {client?.id ?? "—"}</div>
                </div>

                {err ? <p style={{ margin: "0 0 12px 0" }}>{err}</p> : null}

                <form onSubmit={handleSave} style={{ display: "grid", gap: 14, maxWidth: 560 }}>
                  <Field label="Customer name">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. IoIC"
                      style={{ padding: "10px 12px", width: "100%", boxSizing: "border-box" }}
                    />
                  </Field>
                  <Field label="Slug">
                    <input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="e.g. ioic"
                      style={{ padding: "10px 12px", width: "100%", boxSizing: "border-box" }}
                    />
                  </Field>

                  <h3 style={{ margin: "20px 0 8px 0", fontSize: 15 }}>Billing</h3>
                  <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "var(--lc-muted)" }}>
                    Enable for customers who pay by invoice. They get publish and embed access without a Stripe
                    subscription record.
                  </p>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={subscriptionActiveOverride}
                      onChange={(e) => setSubscriptionActiveOverride(e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <strong>Pays by invoice</strong>
                      <span style={{ display: "block", fontSize: 13, color: "var(--lc-muted)", marginTop: 4 }}>
                        Treat as an active paying customer (subscription override)
                      </span>
                    </span>
                  </label>

                  <h3 style={{ margin: "20px 0 8px 0", fontSize: 15 }}>Primary contact</h3>
                  <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "var(--lc-muted)" }}>
                    The primary contact is edited here. To add more users or set permissions, use the Users tab.
                  </p>
                  <Field label="Contact name">
                    <input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g. Jane Smith"
                      style={{ padding: "10px 12px", width: "100%", boxSizing: "border-box" }}
                    />
                  </Field>
                  <Field label="Contact email">
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="e.g. jane@example.com"
                      required
                      style={{ padding: "10px 12px", width: "100%", boxSizing: "border-box" }}
                    />
                  </Field>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button className="btn btn-primary" type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {activeTab === "users" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Users</h3>
                  <form onSubmit={handleAddUser} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <input
                      type="email"
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="Email"
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--lc-border)", minWidth: 180 }}
                    />
                    <input
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      placeholder="Name"
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--lc-border)", minWidth: 140 }}
                      required
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={addCanManageMaps}
                        onChange={(e) => setAddCanManageMaps(e.target.checked)}
                      />
                      Manage maps
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={addCanManageUsers}
                        onChange={(e) => setAddCanManageUsers(e.target.checked)}
                      />
                      Manage users
                    </label>
                    <button type="submit" className="btn btn-primary" disabled={adding}>
                      {adding ? "Adding…" : "Add user"}
                    </button>
                  </form>
                </div>

                {err ? <p style={{ margin: "0 0 12px 0", color: "#b91c1c" }}>{err}</p> : null}
                {notice ? (
                  <div
                    style={{
                      margin: "0 0 12px 0",
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: "1px solid rgba(59, 130, 246, 0.35)",
                      background: "rgba(59, 130, 246, 0.12)",
                      color: "#1e40af",
                    }}
                  >
                    {notice}
                  </div>
                ) : null}
                {usersWarning ? (
                  <div
                    style={{
                      margin: "0 0 12px 0",
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: "1px solid #b45309",
                      background: "rgba(251, 191, 36, 0.18)",
                      color: "#78350f",
                    }}
                  >
                    {usersWarning}
                  </div>
                ) : null}

                {contactsList.length === 0 ? (
                  <p style={{ marginTop: 8, opacity: 0.8 }}>No users yet. Add one above or set the primary contact in Customer details.</p>
                ) : (
                  <table className="admin-table" style={{ marginTop: 0 }}>
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Primary</th>
                        <th>Manage maps</th>
                        <th>Manage users</th>
                        <th>Has login</th>
                        <th></th>
                        <th></th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {contactsList.map((c) => (
                        <tr key={c.id}>
                          <td>{c.email}</td>
                          <td>{c.name || "—"}</td>
                          <td>{c.is_primary ? "Yes" : "—"}</td>
                          <td>
                            {c.is_primary ? (
                              <span className="badge">Yes (primary)</span>
                            ) : (
                              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input
                                  type="checkbox"
                                  checked={!!c.can_manage_maps}
                                  onChange={(e) => updateContactPermissions(c.id, e.target.checked, c.can_manage_users)}
                                />
                                {c.can_manage_maps ? "Yes" : "No"}
                              </label>
                            )}
                          </td>
                          <td>
                            {c.is_primary ? (
                              <span className="badge">Yes (primary)</span>
                            ) : (
                              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input
                                  type="checkbox"
                                  checked={!!c.can_manage_users}
                                  onChange={(e) => updateContactPermissions(c.id, c.can_manage_maps, e.target.checked)}
                                />
                                {c.can_manage_users ? "Yes" : "No"}
                              </label>
                            )}
                          </td>
                          <td>{c.user_id ? "Yes" : "Pending"}</td>
                          <td>
                            {c.user_id ? (
                              <button
                                type="button"
                                className="admin-table__icon-btn"
                                title="Impersonate this user in client portal"
                                aria-label={`Impersonate ${c.email}`}
                                onClick={() => handleImpersonate(c)}
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z" />
                                  <path d="M5 20c0-3.31 3.134-6 7-6s7 2.69 7 6" />
                                </svg>
                              </button>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--lc-muted)" }}>—</span>
                            )}
                          </td>
                          <td>
                            <Link to={`/admin/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(c.id)}`}>
                              Edit
                            </Link>
                          </td>
                          <td style={{ width: 44, textAlign: "right" }}>
                            <button
                              type="button"
                              className="admin-table__delete-btn"
                              onClick={() => {
                                setContactToDelete({ id: c.id, email: c.email, name: c.name });
                                setDeleteConfirmText("");
                              }}
                              title="Delete user"
                              aria-label={`Delete user ${c.email}`}
                            >
                              {TRASH_ICON}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === "messaging" && (
              <MessagingSettings
                clientId={clientId}
                clientName={client?.name}
                eventSource="admin_dashboard"
                showPageTitle={false}
              />
            )}
          </>
        )}
      </div>
      {contactToDelete ? (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
          <div className="admin-modal">
            <h2 id="delete-user-title" className="admin-modal__title">Delete user</h2>
            <p className="admin-modal__message">
              Are you sure you want to remove &quot;{contactToDelete.name || contactToDelete.email}&quot; from this customer?
              This cannot be undone.
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
                  setContactToDelete(null);
                  setDeleteConfirmText("");
                }}
                disabled={deletingContact}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDeleteContact}
                disabled={deleteConfirmText.trim().toLowerCase() !== "delete" || deletingContact}
              >
                {deletingContact ? "Deleting…" : "Delete user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}