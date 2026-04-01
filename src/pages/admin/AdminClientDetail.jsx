import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";
import { startImpersonatingClient } from "../../lib/clientAuth";

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.8 }}>{label}</div>
      <div className="admin-controls" style={{ marginTop: 0 }}>{children}</div>
    </div>
  );
}

export default function AdminClientDetail() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [primaryContact, setPrimaryContact] = useState(null);
  const [contactsList, setContactsList] = useState([]);
  const [maps, setMaps] = useState([]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
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
        supabase.from("clients").select("id,name,slug,created_at,updated_at").eq("id", clientId).single(),
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
        .update({ name: cleanName, slug: cleanSlug, updated_at: new Date().toISOString() })
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
    const nameVal = addName.trim() || null;
    if (!email) {
      setErr("Email is required.");
      return;
    }
    setErr("");
    setAdding(true);
    try {
      const { error } = await supabase.from("contacts").insert({
        client_id: clientId,
        email,
        name: nameVal,
        is_primary: false,
        can_manage_maps: addCanManageMaps,
        can_manage_users: addCanManageUsers,
      });
      if (error) throw error;
      setAddEmail("");
      setAddName("");
      setAddCanManageMaps(false);
      setAddCanManageUsers(false);
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setAdding(false);
    }
  }

  async function updateContactPermissions(contactId, can_manage_maps, can_manage_users) {
    setErr("");
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

  function handleImpersonate(contactRow) {
    if (!contactRow.user_id) return;
    const ok = window.confirm(`Impersonate ${contactRow.email} as ${client?.name}?`);
    if (!ok) return;
    startImpersonatingClient(clientId);
    navigate("/client");
  }

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: client?.name ?? "…", path: `/admin/clients/${encodeURIComponent(clientId)}` },
      ]}
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
            <div className="admin-map-tabs" style={{ marginBottom: 16 }}>
              <button
                type="button"
                className={`admin-map-tabs__tab ${activeTab === "maps" ? "is-active" : ""}`}
                onClick={() => setActiveTab("maps")}
              >
                Maps
              </button>
              <button
                type="button"
                className={`admin-map-tabs__tab ${activeTab === "details" ? "is-active" : ""}`}
                onClick={() => setActiveTab("details")}
              >
                Customer details
              </button>
              <button
                type="button"
                className={`admin-map-tabs__tab ${activeTab === "users" ? "is-active" : ""}`}
                onClick={() => setActiveTab("users")}
              >
                Users
              </button>
            </div>

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
                      placeholder="Name (optional)"
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--lc-border)", minWidth: 140 }}
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}