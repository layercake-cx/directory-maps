import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Callout, DataTable, EmptyState, PageLayout, Pill, Section, SegmentedControl, Toolbar } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";
import { listDirectories, getMapsLinkedToDirectories } from "../../lib/directories.js";
import { listPlans, fetchClientEntitlements, listFeatures, getClientPlanKey } from "../../lib/entitlements.js";

const VIEWS = [
  { key: "all", label: "All directories" },
  { key: "published", label: "Published" },
  { key: "unpublished", label: "Not yet published" },
  { key: "archived", label: "Archived" },
];

function statusTone(directory) {
  if (!directory.is_active) return "neutral";
  if (directory.published_at) return "live";
  return "warn";
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
 * Built on the Discover UI kit (PageLayout, DataTable, Pill, Callout).
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

  const columns = [
    {
      key: "name",
      label: "Directory",
      render: (d) => (
        <span className="b1-dir-name">
          {d.seo_og_image_url ? <img className="b1-dir-thumb" src={d.seo_og_image_url} alt="" /> : null}
          <span>
            {d.name}
            {(linkedMapsByDirectory[d.id] ?? []).length > 0 ? (
              <span className="b1-cell-sub">Linked to {linkedMapsByDirectory[d.id].map((m) => m.name).join(", ")}</span>
            ) : null}
          </span>
        </span>
      ),
    },
    { key: "status", label: "Status", render: (d) => <Pill tone={statusTone(d)}>{statusLabel(d)}</Pill> },
    { key: "entries", label: "Entries", align: "right", render: (d) => d.directory_entries?.[0]?.count ?? 0 },
  ];

  const emptyState = directories.length === 0 ? (
    <EmptyState
      title="No directories yet"
      body="Create a browsable, publishable list of entries."
      actions={canManage ? <Button as={Link} to={newHref} variant="primary">Create your first directory</Button> : null}
    />
  ) : (
    <EmptyState art="searching" title="No directories in this view" />
  );

  return (
    <PageLayout
      head={{
        title: "Directories",
        subtitle: "Browsable, publishable lists of entries — separate from your maps.",
        actions: canManage ? <Button as={Link} to={newHref} variant="primary">New directory</Button> : null,
      }}
    >
      <Toolbar>
        <SegmentedControl
          label="Filter directories"
          value={view}
          onChange={setView}
          options={VIEWS.map((v) => ({ value: v.key, label: `${v.label} (${counts[v.key]})` }))}
        />
      </Toolbar>

      {err ? <Callout tone="danger">{err}</Callout> : null}

      <Section flush>
        <DataTable
          caption="Directories"
          columns={columns}
          rows={filtered}
          getRowId={(d) => d.id}
          getRowLabel={(d) => d.name}
          rowLink={(d) => `${basePath}/${encodeURIComponent(d.id)}`}
          loading={loading}
          empty={emptyState}
        />
      </Section>

      {planName || lockedFeatureNames.length > 0 ? (
        <Section title="Plan">
          {planName ? <p className="setting-row-label">Plan: {planName}</p> : null}
          {lockedFeatureNames.length > 0 ? (
            <Callout tone="info">Needs a higher plan: {lockedFeatureNames.join(", ")}</Callout>
          ) : null}
        </Section>
      ) : null}
    </PageLayout>
  );
}
