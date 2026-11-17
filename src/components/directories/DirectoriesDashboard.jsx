import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BulkBar, Button, Callout, EmptyState, ListPage, NameCell, Pill, Section, formatListDate, useListView,
} from "../ui/index.js";
import { useArchiveFlow } from "../archive/useArchiveFlow.jsx";
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
export default function DirectoriesDashboard({ clientId, clientSlug, canManage, isStaff = false, basePath, newHref }) {
  const [directories, setDirectories] = useState([]);
  const [linkedMapsByDirectory, setLinkedMapsByDirectory] = useState({});
  const [planName, setPlanName] = useState(null);
  const [lockedFeatureNames, setLockedFeatureNames] = useState([]);
  const [view, setView] = useListView(VIEWS.map((v) => v.key));
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState([]);
  const { requestArchive, restore, dialog } = useArchiveFlow({
    entityType: "directory",
    isStaff,
    clientId,
    onChanged: () => { setSelected([]); setReloadKey((k) => k + 1); },
  });
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
  }, [clientId, reloadKey]);

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

  const liveUrl = (d) =>
    d.is_active && d.published_at && clientSlug && d.slug
      ? `https://maps.layercake-cx.biz/directories/${clientSlug}/${d.slug}`
      : null;

  const rowMenu = (d) => {
    const open = { label: "Open", href: `${basePath}/${encodeURIComponent(d.id)}` };
    if (!d.is_active) return canManage ? [{ label: "Restore", onSelect: () => restore([d]) }, open] : [open];
    const items = [open];
    const url = liveUrl(d);
    if (url) items.push({ label: "View live site ↗", href: url });
    if (canManage) items.push({ divider: true }, { label: "Archive…", danger: true, onSelect: () => requestArchive([d]) });
    return items;
  };

  const columns = [
    {
      key: "name",
      label: "Directory",
      render: (d) => {
        const linked = linkedMapsByDirectory[d.id] ?? [];
        return (
          <span className="b1-dir-name">
            {d.seo_og_image_url ? <img className="b1-dir-thumb" src={d.seo_og_image_url} alt="" /> : null}
            <NameCell name={d.name} sub={linked.length > 0 ? `Linked to ${linked.map((m) => m.name).join(", ")}` : null} />
          </span>
        );
      },
    },
    { key: "status", label: "Status", render: (d) => <Pill tone={statusTone(d)}>{statusLabel(d)}</Pill> },
    { key: "entries", label: "Entries", className: "cell-num", align: "right", render: (d) => d.directory_entries?.[0]?.count ?? 0 },
    { key: "updated", label: "Updated", render: (d) => formatListDate(d.updated_at) },
  ];

  const emptyAll = (
    <EmptyState
      title="No directories yet"
      body="Create a browsable, publishable list of entries."
      actions={canManage ? <Button as={Link} to={newHref} variant="primary">Create your first directory</Button> : null}
    />
  );

  return (
    <>
    <ListPage
      head={{
        title: "Directories",
        subtitle: "Browsable, publishable lists of entries — separate from your maps.",
        actions: canManage ? <Button as={Link} to={newHref} variant="primary">New directory</Button> : null,
      }}
      noun="directories"
      error={err}
      itemCount={directories.length}
      views={{
        label: "Filter directories",
        value: view,
        onChange: setView,
        options: VIEWS.map((v) => ({ ...v, count: counts[v.key] })),
      }}
      emptyAll={emptyAll}
      table={{
        caption: "Directories",
        columns,
        rows: filtered,
        getRowId: (d) => d.id,
        getRowLabel: (d) => d.name,
        rowLink: (d) => `${basePath}/${encodeURIComponent(d.id)}`,
        rowMenu,
        loading,
        selectable: canManage && view !== "archived",
        selected,
        onSelectedChange: setSelected,
      }}
      bulkBar={
        selected.length > 0 ? (
          <BulkBar count={selected.length} onClear={() => setSelected([])}>
            <Button variant="danger" onClick={() => requestArchive(directories.filter((d) => selected.includes(d.id)), "bulk")}>Archive…</Button>
          </BulkBar>
        ) : null
      }
      below={
        planName || lockedFeatureNames.length > 0 ? (
          <Section title="Plan">
            {planName ? <p className="setting-row-label">Plan: {planName}</p> : null}
            {lockedFeatureNames.length > 0 ? (
              <Callout tone="info">Needs a higher plan: {lockedFeatureNames.join(", ")}</Callout>
            ) : null}
          </Section>
        ) : null
      }
    />
    {dialog}
    </>
  );
}