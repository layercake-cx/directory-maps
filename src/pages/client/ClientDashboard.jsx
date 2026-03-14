import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut, getMyRole } from "../../lib/auth";
import { getImpersonatedClientId } from "../../lib/clientAuth";

function slugify(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Returns the client record for the current user via their contact (user_id -> contact -> client).
 * If the user is an admin with no contact, returns null. Legacy: if no contact but a client
 * exists with id = user.id, we create a contact for that client and return the client.
 */
async function getClientForUser() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user;
  if (!user) throw new Error("Not signed in.");

  const role = await getMyRole();

  const impersonatedClientId = getImpersonatedClientId();
  if (impersonatedClientId && role === "admin") {
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id,name,slug,created_at,updated_at")
      .eq("id", impersonatedClientId)
      .single();
    if (clientErr || !client) return null;
    return { ...client, __impersonated: true };
  }

  if (role === "admin") {
    const { data: contact } = await supabase
      .from("contacts")
      .select("client_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!contact) return null;
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id,name,slug,created_at,updated_at")
      .eq("id", contact.client_id)
      .single();
    if (clientErr || !client) return null;
    return client;
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, client_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (contactError) throw contactError;
  if (contact) {
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id,name,slug,created_at,updated_at")
      .eq("id", contact.client_id)
      .single();
    if (clientErr) throw clientErr;
    return client ?? null;
  }

  const { data: legacyClient, error: legacyErr } = await supabase
    .from("clients")
    .select("id,name,slug,created_at,updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (legacyErr) throw legacyErr;
  if (legacyClient) {
    await supabase.from("contacts").insert({
      client_id: legacyClient.id,
      user_id: user.id,
      email: user.email ?? "Legacy contact",
      is_primary: true,
    });
    return legacyClient;
  }

  return null;
}

export default function ClientDashboard() {
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const c = await getClientForUser();
        setClient(c);

        if (c === null) {
          setMaps([]);
          return;
        }

        const { data: ms, error: mErr } = await supabase
          .from("maps")
          .select("id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering")
          .eq("client_id", c.id)
          .order("name", { ascending: true });

        if (mErr) throw mErr;
        setMaps(ms ?? []);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleSignOut() {
    signOut().catch(() => {});
  }

  if (!loading && client === null) {
    return (
      <div className="page-main">
        <div className="admin-card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Admin account</h2>
          <p>You’re signed in as an admin. Client accounts are not created for admin users.</p>
          <p>Use the <a href="#/admin/clients">Admin area</a> to manage clients and maps, or sign out and sign in with a client account to use the client portal.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <a href="#/admin/clients" className="btn btn-primary">Go to Admin</a>
            <button type="button" className="btn" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-main">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 4px 0" }}>{client?.name || "Your maps"}</h1>
          {client?.slug ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>Client slug: {client.slug}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => navigate("/client/maps/new")}>
            New map
          </button>
          <button type="button" className="btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="admin-card">
        {loading ? <p>Loading…</p> : null}
        {err ? <p>{err}</p> : null}

        {!loading && maps.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.8 }}>You do not have any maps yet. Create one to get started.</p>
        ) : null}

        {maps.length ? (
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
                    <Link to={`/client/maps/${encodeURIComponent(m.id)}`}>{m.name}</Link>
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
        ) : null}
      </div>
    </div>
  );
}

