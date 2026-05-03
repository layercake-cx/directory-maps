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

async function getClientAndContactForUser() {
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
    if (clientErr || !client) return { client: null, contact: null };
    return { client: { ...client, __impersonated: true }, contact: { role: "owner" } };
  }

  if (role === "admin") {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, client_id, role, is_primary")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!contact) return { client: null, contact: null };
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id,name,slug,created_at,updated_at")
      .eq("id", contact.client_id)
      .single();
    if (clientErr || !client) return { client: null, contact: null };
    return { client, contact };
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, client_id, role, is_primary")
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
    return { client: client ?? null, contact };
  }

  // Legacy: client.id === user.id
  const { data: legacyClient, error: legacyErr } = await supabase
    .from("clients")
    .select("id,name,slug,created_at,updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (legacyErr) throw legacyErr;
  if (legacyClient) {
    const { data: newContact } = await supabase
      .from("contacts")
      .insert({
        client_id: legacyClient.id,
        user_id: user.id,
        email: user.email ?? "Legacy contact",
        is_primary: true,
        role: "owner",
      })
      .select("id, client_id, role, is_primary")
      .single();
    return { client: legacyClient, contact: newContact ?? { role: "owner" } };
  }

  return { client: null, contact: null };
}

export default function ClientDashboard() {
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [contact, setContact] = useState(null);
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { client: c, contact: ct } = await getClientAndContactForUser();
        setClient(c);
        setContact(ct);

        if (c === null) {
          setMaps([]);
          return;
        }

        const isPrivileged = ct?.role === "owner" || ct?.role === "manager";

        if (isPrivileged) {
          const { data: ms, error: mErr } = await supabase
            .from("maps")
            .select("id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering")
            .eq("client_id", c.id)
            .order("name", { ascending: true });
          if (mErr) throw mErr;
          setMaps(ms ?? []);
        } else {
          // member: only maps explicitly granted
          const { data: perms, error: pErr } = await supabase
            .from("contact_map_permissions")
            .select("map_id")
            .eq("contact_id", ct.id);
          if (pErr) throw pErr;

          const mapIds = (perms ?? []).map((p) => p.map_id);
          if (mapIds.length === 0) {
            setMaps([]);
            return;
          }

          const { data: ms, error: mErr } = await supabase
            .from("maps")
            .select("id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering")
            .in("id", mapIds)
            .order("name", { ascending: true });
          if (mErr) throw mErr;
          setMaps(ms ?? []);
        }
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

  const canManage = contact?.role === "owner" || contact?.role === "manager";

  if (!loading && client === null) {
    return (
      <div className="page-main">
        <div className="admin-card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Admin account</h2>
          <p>You're signed in as an admin. Client accounts are not created for admin users.</p>
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
          {canManage && (
            <button type="button" className="btn" onClick={() => navigate("/client/team")}>
              Team
            </button>
          )}
          {canManage && (
            <button type="button" className="btn btn-primary" onClick={() => navigate("/client/maps/new")}>
              New map
            </button>
          )}
          <button type="button" className="btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="admin-card">
        {loading ? <p>Loading…</p> : null}
        {err ? <p>{err}</p> : null}

        {!loading && maps.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.8 }}>
            {canManage
              ? "You do not have any maps yet. Create one to get started."
              : "You have not been granted access to any maps yet."}
          </p>
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
