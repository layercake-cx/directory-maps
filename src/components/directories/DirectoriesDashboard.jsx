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

function statusPillClass(directory) {
  if (!directory.is_active) return "pill pill--neutral";
  if (directory.published_at) return "pill pill--ok";
  return "pill pill--warn";
}

function statusLabel(directory) {
  if (!directory.is_active) return "Archived";
  if (directory.published_at) return "Published";
  return "Not yet published";
}

/**
 * Directories dashboard (Phase 4, admin shell redesign) — shared by ClientDirectories.jsx and
 * AdminClientDetail.jsx's "directories" tab, per the "one component, two contexts" pattern
 * (Phases 1-2). Views/plan box are real data (see BUILD_BRIEF.md's "no fake numbers" rule) —
 * "directories used of allowance" is omitted, not faked: no max_directories entitlement exists
 * today (unlike the real seeded max_maps one) — see BACKLOG.md.
 *
 * Uses the shell's own page-body component vocabulary (.card/.pill/.stat-grid/.shell-btn — see
 * admin-shell.css) rather than the old admin.css/.admin-card patterns Phase 4 originally shipped
 * with — see BACKLOG.md "Page body content still uses the old design system".
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
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Directories</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--shell-text-muted)" }}>
            Browsable, publishable lists of entries — separate from your maps.
          </p>
        </div>
        {canManage && (
          <Link className="shell-btn shell-btn--primary" to={newHref}>
            New directory
          </Link>
        )}
      </div>

      <div className="toolbar" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className={`shell-btn shell-btn--sm${view === v.key ? " shell-btn--primary" : ""}`}
            onClick={() => setView(v.key)}
          >
            {v.label} ({counts[v.key]})
          </button>
        ))}
      </div>

      {err && <p style={{ color: "var(--shell-danger)" }}>{err}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card card-pad">
          <p style={{ margin: 0 }}>{directories.length === 0 ? "No directories yet." : "No directories in this view."}</p>
          {canManage && directories.length === 0 && (
            <Link className="shell-btn shell-btn--primary" to={newHref} style={{ alignSelf: "flex-start" }}>
              Create your first directory
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {filtered.map((d) => {
            const linkedMaps = linkedMapsByDirectory[d.id] ?? [];
            return (
              <Link key={d.id} to={`${basePath}/${encodeURIComponent(d.id)}`} className="card card-pad" style={{ textDecoration: "none", color: "inherit", display: "block", gap: 0 }}>
                {d.seo_og_image_url && (
                  <img
                    src={d.seo_og_image_url}
                    alt=""
                    style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: "var(--radius-item)", marginBottom: 12 }}
                  />
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <strong>{d.name}</strong>
                  <span className={statusPillClass(d)} style={{ whiteSpace: "nowrap" }}>
                    {statusLabel(d)}
                  </span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--shell-text-soft)" }}>{d.directory_entries?.[0]?.count ?? 0} entries</p>
                {linkedMaps.length > 0 && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--shell-text-muted)" }}>
                    Linked to {linkedMaps.map((m) => m.name).join(", ")}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {(planName || lockedFeatureNames.length > 0) && (
        <div className="card card-pad" style={{ marginTop: 20, maxWidth: 420 }}>
          {planName && <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Plan: {planName}</p>}
          {lockedFeatureNames.length > 0 && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--shell-text-soft)" }}>
              Needs a higher plan: {lockedFeatureNames.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
