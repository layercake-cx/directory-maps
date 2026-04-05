import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../hooks/useClient.js";

export default function ClientDashboard() {
  const { client, contact } = useClient();
  const navigate = useNavigate();
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!client?.id) return;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { data: ms, error: mErr } = await supabase
          .from("maps")
          .select("id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering")
          .eq("client_id", client.id)
          .order("name", { ascending: true });

        if (mErr) throw mErr;
        setMaps(ms ?? []);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [client?.id]);

  const primaryContactLabel = contact?.email || contact?.name || null;
  const showEmptyWelcome = !loading && maps.length === 0;

  return (
    <div className="client-dashboard" style={{ marginTop: 16, display: "grid", gap: 16 }}>
      {/* Slim summary panel */}
      <div
        className="admin-card"
        style={{
          maxWidth: 680,
          padding: 16,
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.06, opacity: 0.7 }}>
            Organisation
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            {client?.name || "Your organisation"}
          </div>
          {client?.slug ? (
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Slug: {client.slug}</div>
          ) : null}
          {primaryContactLabel ? (
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              Primary contact: {primaryContactLabel}
            </div>
          ) : null}
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            {showEmptyWelcome
              ? "You’re on My Maps — create your first map below to get started."
              : `You currently have ${maps.length} map${maps.length === 1 ? "" : "s"}.`}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          {!showEmptyWelcome ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate("/client/maps/new")}>
              Create new map
            </button>
          ) : null}
          {err ? (
            <span style={{ fontSize: 12, color: "#b91c1c", maxWidth: 260, textAlign: "right" }}>
              {err}
            </span>
          ) : null}
        </div>
      </div>

      {/* Maps list + empty-state overlay */}
      <div
        className="admin-card client-dashboard__mapsRegion"
        style={{ margin: 0, position: "relative", minHeight: showEmptyWelcome ? "min(62vh, 520px)" : undefined }}
      >
        {loading ? <p style={{ margin: 0 }}>Loading…</p> : null}

        {showEmptyWelcome ? (
          <div className="client-dashboard__emptyOverlay" aria-hidden={false}>
            <div className="client-dashboard__emptyCard">
              <h2 className="client-dashboard__emptyTitle">Welcome to My Maps</h2>
              <p className="client-dashboard__emptyText">
                Create your first directory map to add listings, customise pins and colours, and embed the map on your
                website.
              </p>
              <button
                type="button"
                className="btn client-dashboard__emptyCta"
                onClick={() => navigate("/client/maps/new")}
              >
                Create your first map
              </button>
            </div>
          </div>
        ) : null}

        {!showEmptyWelcome && maps.length > 0 ? (
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
