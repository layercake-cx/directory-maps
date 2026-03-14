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
  const [maps, setMaps] = useState([]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

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
      ]);

      if (ce) throw ce;
      if (me) throw me;

      setClient(c);
      setMaps(m ?? []);

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
    if (!cleanName) return setErr("Client name is required.");
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

  return (
    <AdminLayout
      title="Admin · Client"
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ marginBottom: 12 }}>
          <Link to="/admin/clients">← Back to clients</Link>
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
                className={`admin-map-tabs__tab ${activeTab === "client" ? "is-active" : ""}`}
                onClick={() => setActiveTab("client")}
              >
                Client & contact
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
                  <p style={{ marginTop: 8, opacity: 0.8 }}>No maps yet for this client.</p>
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

            {activeTab === "client" && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <h2 style={{ margin: "0 0 8px 0" }}>Edit client</h2>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>ID: {client?.id ?? "—"}</div>
                </div>

                {err ? <p style={{ margin: "0 0 12px 0" }}>{err}</p> : null}

                <form onSubmit={handleSave} style={{ display: "grid", gap: 14, maxWidth: 560 }}>
                  <Field label="Client name">
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
                  <Field label="Contact name">
                    <input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g. Jane Smith"
                      style={{ padding: "10px 12px", width: "100%", boxSizing: "border-box" }}
                    />
                  </Field>
                  <Field label="Contact email">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="e.g. jane@example.com"
                        required
                        style={{ padding: "10px 12px", width: "100%", boxSizing: "border-box" }}
                      />
                      {client && contactEmail ? (
                        <button
                          type="button"
                          className="admin-table__icon-btn"
                          title="Impersonate client in portal"
                          aria-label={`Impersonate client ${client.name}`}
                          onClick={() => {
                            const ok = window.confirm(`Are you sure you wish to impersonate ${client.name}?`);
                            if (!ok) return;
                            startImpersonatingClient(client.id);
                            navigate("/client");
                          }}
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z" />
                            <path d="M5 20c0-3.31 3.134-6 7-6s7 2.69 7 6" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </Field>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button className="btn btn-primary" type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}