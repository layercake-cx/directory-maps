import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useClient } from "../../hooks/useClient.js";
import { supabase } from "../../lib/supabase";
import { listDirectories, countEntriesMissingSeoMetadata } from "../../lib/directories.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function Tile({ label, value, sub, to }) {
  return (
    <Link to={to} className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </Link>
  );
}

/**
 * Organisation home (Phase 4, admin shell redesign) — /client's new default, replacing the maps
 * grid (now at /client/maps — see BACKLOG.md "My maps as distinct from Home", resolved here).
 * Every tile is a real query; nothing here is a placeholder count. No "Recent activity feed" —
 * admin_events has no client-scoped RLS policy today, so a real client contact would just see an
 * empty/broken feed; logged in BACKLOG.md as needing a migration, not built on a guess.
 *
 * Uses the shell's own page-body component vocabulary (.stat-grid/.stat/.card/.action-row — see
 * admin-shell.css) rather than the old admin.css/.admin-card patterns Phase 4 originally shipped
 * with — see BACKLOG.md "Page body content still uses the old design system".
 */
export default function ClientHome() {
  const { client } = useClient();
  const [stats, setStats] = useState(null);
  const [needsAttention, setNeedsAttention] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!client?.id) return;
    const clientId = client.id;
    const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    (async () => {
      try {
        const [
          { count: mapsCount },
          { count: mapsPublished },
          directories,
          { count: teamSize },
          { data: dirEnquiries },
          { data: mapEnquiries },
          { data: failedSyncs },
        ] = await Promise.all([
          supabase.from("maps").select("id", { count: "exact", head: true }).eq("client_id", clientId),
          supabase.from("maps").select("id", { count: "exact", head: true }).eq("client_id", clientId).not("published_at", "is", null),
          listDirectories(clientId, { includeArchived: false }),
          supabase.from("contacts").select("id", { count: "exact", head: true }).eq("client_id", clientId),
          supabase.from("directory_contact_submissions").select("submitted_at, directories!inner(client_id)").eq("directories.client_id", clientId).gte("submitted_at", since),
          supabase.rpc("list_client_contact_submissions", { p_client_id: clientId }).then((r) => ({ data: (r.data ?? []).filter((s) => s.submitted_at >= since) })).catch(() => ({ data: [] })),
          supabase.from("sync_logs").select("map_id, started_at, maps(name)").eq("client_id", clientId).eq("status", "error").order("started_at", { ascending: false }),
        ]);

        const directoriesPublished = directories.filter((d) => d.published_at).length;
        const enquiries30d = (dirEnquiries?.length ?? 0) + (mapEnquiries?.length ?? 0);

        setStats({
          mapsCount: mapsCount ?? 0,
          mapsPublished: mapsPublished ?? 0,
          directoriesCount: directories.length,
          directoriesPublished,
          teamSize: teamSize ?? 0,
          enquiries30d,
        });

        const attention = [];
        const seenMaps = new Set();
        for (const f of failedSyncs ?? []) {
          if (seenMaps.has(f.map_id)) continue;
          seenMaps.add(f.map_id);
          attention.push({
            key: `sync-${f.map_id}`,
            text: `"${f.maps?.name ?? f.map_id}" data sync failed`,
            sub: relativeTime(f.started_at),
            to: `/client/maps/${encodeURIComponent(f.map_id)}/data`,
          });
        }
        const seoCounts = await Promise.all(directories.map((d) => countEntriesMissingSeoMetadata(d.id).catch(() => 0)));
        directories.forEach((d, i) => {
          if (seoCounts[i] > 0) {
            attention.push({
              key: `seo-${d.id}`,
              text: `"${d.name}" has ${seoCounts[i]} ${seoCounts[i] === 1 ? "entry" : "entries"} missing SEO metadata`,
              to: `/client/directories/${encodeURIComponent(d.id)}/seo`,
            });
          }
        });
        setNeedsAttention(attention);
      } catch (e) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [client?.id]);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{client?.name}</h1>
      </div>

      {err && <p style={{ color: "var(--shell-danger)" }}>{err}</p>}

      <div className="stat-grid">
        <Tile label="Maps" value={stats ? stats.mapsCount : "…"} sub={stats ? `${stats.mapsPublished} published` : undefined} to="/client/maps" />
        <Tile label="Directories" value={stats ? stats.directoriesCount : "…"} sub={stats ? `${stats.directoriesPublished} published` : undefined} to="/client/directories" />
        <Tile label="Team" value={stats ? stats.teamSize : "…"} to="/client/team" />
        <Tile label="Enquiries (30 days)" value={stats ? stats.enquiries30d : "…"} to="/client/maps" />
      </div>

      <div className="card card-pad">
        <p className="card-title">Needs attention</p>
        {needsAttention.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--shell-text-muted)" }}>Nothing needs attention right now.</p>
        ) : (
          <div>
            {needsAttention.map((a) => (
              <Link key={a.key} to={a.to} className="action-row">
                <span className="action-count">!</span>
                <span>
                  {a.text}
                  {a.sub && <span style={{ color: "var(--shell-text-muted)" }}> — {a.sub}</span>}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
