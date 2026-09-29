import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listDirectories, getMapsLinkedToDirectories } from "../../lib/directories.js";
import { listPlans, fetchClientEntitlements, listFeatures, getClientPlanKey } from "../../lib/entitlements.js";

const VIEWS = [
  { key: "all", label: "All directories" },
  { key: "published", label: "Published" },
  { key: "unpublished", label: "Not yet published" },
  { key: "archived", label: "Archived" },
];

/**
 * Directories dashboard (Phase 4, admin shell redesign) — shared by ClientDirectories.jsx and
 * AdminClientDetail.jsx's "directories" tab, per the "one component, two contexts" pattern
 * (Phases 1-2). Views/plan box are real data (see BUILD_BRIEF.md's "no fake numbers" rule) —
 * "directories used of allowance" is omitted, not faked: no max_directories entitlement exists
 * today (unlike the real seeded max_maps one) — see BACKLOG.md.
 */
export default function DirectoriesDashboard({ clientId, canManage, basePath, newHref }) {
  const [directories, setDirectories] = useState([]);
  const [linkedMapsByDirectory, setLinkedMapsByDirectory] = useState({});
  const [planName, setPlanName] = useState(null);
  const [lockedFeatureNames, setLockedFeatureNames] = useState([]);
  const [view, setView] = useState("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const dirs = await listDirectories(clientId, { includeArchived: true });
        setDirectories(dirs);
        const linked = await getMapsLinkedToDirectories(dirs.map((d) => d.id)).catch(() => ({}));
        setLinkedMapsByDirectory(linked);

        const [plans, entitlements, features, resolvedPlanKey] = await Promise.all([
          listPlans().catch(() => []),
          fetchClientEntitlements(clientId).catch(() => ({})),
          listFeatures().catch(() => []),
          getClientPlanKey(clientId).catch(() => null),
        ]);
        setPlanName(plans.find((p) => p.key === resolvedPlanKey)?.name ?? resolvedPlanKey ?? null);
        setLockedFeatureNames(
          features.filter((f) => f.entitlement_type === "boolean" && entitlements[f.key]?.enabled === false).map((f) => f.name),
        );
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId]);

  const counts = useMemo(
    () => ({
      all: directories.length,
      published: directories.filter((d) => d.is_active && d.published_at).length,
      unpublished: directories.filter((d) => d.is_active && !d.published_at).length,
      archived: directories.filter((d) => !d.is_active).length,
    }),
    [directories],
  );

  const filtered = useMemo(() => {
    switch (view) {
      case "published":
        return directories.filter((d) => d.is_active && d.published_at);
      case "unpublished":
        return directories.filter((d) => d.is_active && !d.published_at);
      case "archived":
        return directories.filter((d) => !d.is_active);
      default:
        return directories.filter((d) => d.is_active);
    }
  }, [directories, view]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Directories</h2>
          <p style={{ margin: "4px 0 0", opacity: 0.75, fontSize: 13 }}>Browsable, publishable lists of entries — separate from your maps.</p>
        </div>
        {canManage && (
          <Link className="btn btn-primary" to={newHref}>
            New directory
          </Link>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className="btn"
            style={view === v.key ? { background: "var(--lc-brand, #0f5e63)", color: "#fff", borderColor: "transparent" } : undefined}
            onClick={() => setView(v.key)}
          >
            {v.label} ({counts[v.key]})
          </button>
        ))}
      </div>

      {err && <p style={{ color: "#b91c1c" }}>{err}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="admin-card">
          <p style={{ margin: 0 }}>{directories.length === 0 ? "No directories yet." : "No directories in this view."}</p>
          {canManage && directories.length === 0 && (
            <Link className="btn btn-primary" to={newHref} style={{ marginTop: 12, display: "inline-block" }}>
              Create your first directory
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {filtered.map((d) => {
            const linkedMaps = linkedMapsByDirectory[d.id] ?? [];
            return (
              <Link key={d.id} to={`${basePath}/${encodeURIComponent(d.id)}`} className="admin-card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                {d.seo_og_image_url && (
                  <img
                    src={d.seo_og_image_url}
                    alt=""
                    style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8, marginBottom: 12 }}
                  />
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <strong>{d.name}</strong>
                  <span
                    className="pill"
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: !d.is_active ? "#efece6" : d.published_at ? "#e6f0ef" : "#fbefd9",
                      color: !d.is_active ? "#454d52" : d.published_at ? "#0b4a4e" : "#7a4a06",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {!d.is_active ? "Archived" : d.published_at ? "Published" : "Not yet published"}
                  </span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.75 }}>{d.directory_entries?.[0]?.count ?? 0} entries</p>
                {linkedMaps.length > 0 && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.65 }}>
                    Linked to {linkedMaps.map((m) => m.name).join(", ")}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {(planName || lockedFeatureNames.length > 0) && (
        <div className="admin-card" style={{ marginTop: 20, maxWidth: 420 }}>
          {planName && <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Plan: {planName}</p>}
          {lockedFeatureNames.length > 0 && (
            <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.75 }}>
              Needs a higher plan: {lockedFeatureNames.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
