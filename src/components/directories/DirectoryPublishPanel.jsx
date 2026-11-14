import React, { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button, Callout, DataTable, EmptyState, Field, Pill, Section, TextInput, useConfirm } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";
import { JobCard, useJob } from "../jobs/index.js";
import { listCategorisations } from "../../lib/categorisations";
import {
  buildDirectoryPublicationConfig,
  listDirectoryPublications,
  publishDirectory,
  rollbackDirectoryTo,
  triggerDirectorySiteRegeneration,
} from "../../lib/directoryPublications";

/**
 * Publish a directory — DIR-E2. The only caller of publish_directory/
 * rollback_directory_to/generate_directory_site anywhere in the app; before
 * this component, that whole pipeline (Phase 3a/3b) was unreachable.
 * Modelled on ClientMapDashboard.jsx's Publish tab, but much simpler — a
 * directory currently has no theme/branding to snapshot (Phase 4), so the
 * config is just directory settings + the categorisation taxonomy.
 */
export default function DirectoryPublishPanel({ directory, clientSlug, canPublish, recordEvent, onPublished }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [note, setNote] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [rollingBackId, setRollingBackId] = useState(null);
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  const { pathname } = useLocation();
  // Generation status, progress and the leave-the-page hint all live in the job (JobsProvider polls the server).
  const { job, running, begin, refresh, dismiss } = useJob("publish", directory?.id, { href: pathname, version: history[0]?.version });

  function handleGenerationResult(result) {
    if (result?.skipped === "flag_disabled") {
      setErr(
        "Published, but the public pages weren't generated: the Directories feature isn't enabled for this client yet. " +
        "Ask an admin to enable it under Feature access (beta) on the customer's detail page, then publish again.",
      );
    } else if (result?.skipped) {
      setErr(`Published, but page generation was skipped (${result.skipped}). Ask an admin to check the customer's plan/entitlements, then publish again.`);
    } else if (result?.error) {
      setErr(`Published, but page generation failed: ${result.error}`);
    } else {
      setErr("");
    }
  }

  const refreshHistory = useCallback(async () => {
    if (!directory?.id) return;
    try {
      setLoadingHistory(true);
      setHistory(await listDirectoryPublications(directory.id));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoadingHistory(false);
    }
  }, [directory?.id]);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  async function handlePublish() {
    setErr("");
    try {
      setPublishing(true);
      const categorisations = directory?.client_id ? await listCategorisations(directory.client_id) : [];
      const config = buildDirectoryPublicationConfig({ directory, categorisations });
      recordEvent?.("directory_publish_requested", { directory_id: directory.id, note_present: !!note.trim() });
      await publishDirectory(directory.id, config, note);
      const fresh = await listDirectoryPublications(directory.id);
      setHistory(fresh);
      begin({ variant: "publish", version: fresh[0]?.version });
      triggerDirectorySiteRegeneration(directory.id, {
        onResult: (result) => { handleGenerationResult(result); void refresh(); },
      });
      recordEvent?.("directory_published", { directory_id: directory.id, note_present: !!note.trim() });
      setNote("");
      onPublished?.();
    } catch (e) {
      recordEvent?.("directory_publish_failed", { directory_id: directory.id, error: e?.message ?? String(e) });
      setErr(e?.message ?? String(e));
    } finally {
      setPublishing(false);
    }
  }

  async function handleRollback(pub) {
    const ok = await confirm({
      title: `Restore version ${pub.version}?`,
      body: "This creates a new version with that snapshot's settings. It doesn't delete anything.",
      confirmLabel: "Restore version",
    });
    if (!ok) return;
    setErr("");
    try {
      setRollingBackId(pub.id);
      await rollbackDirectoryTo(directory.id, pub.id);
      begin({ variant: "restore", version: pub.version });
      triggerDirectorySiteRegeneration(directory.id, {
        scope: "full",
        onResult: (result) => { handleGenerationResult(result); void refresh(); },
      });
      recordEvent?.("directory_publish_rolled_back", { directory_id: directory.id, from_publication_id: directory.current_publication_id, to_publication_id: pub.id });
      await refreshHistory();
      onPublished?.();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRollingBackId(null);
    }
  }

  const publicUrl = directory?.published_at && clientSlug && directory?.slug
    ? `https://maps.layercake-cx.biz/directories/${clientSlug}/${directory.slug}`
    : null;

  async function handleRegenerate() {
    setErr("");
    begin({ variant: "regenerate" });
    triggerDirectorySiteRegeneration(directory.id, {
      onResult: (result) => { handleGenerationResult(result); void refresh(); },
    });
  }

  const pausedReason = running ? `Publishing is paused until ${job?.variant === "regenerate" ? "pages are rebuilt" : history[0]?.version ? `version ${history[0].version} is live` : "this run finishes"}.` : undefined;

  const formatWhen = (iso) => new Date(iso).toLocaleString("en-GB");

  const historyColumns = [
    {
      key: "version",
      label: "Version",
      render: (pub) => (
        <>
          <strong>Version {pub.version}</strong>
          {pub.id === directory?.current_publication_id ? <> <Pill tone="live">Current</Pill></> : null}
        </>
      ),
    },
    { key: "published_at", label: "Published", className: "b1-nowrap", render: (pub) => formatWhen(pub.published_at) },
    { key: "note", label: "Note", render: (pub) => pub.note || "—" },
    ...(canPublish ? [{
      key: "actions",
      label: "Actions",
      align: "right",
      render: (pub) => (pub.id === directory?.current_publication_id ? null : (
        <Button size="sm" onClick={() => handleRollback(pub)} loading={rollingBackId === pub.id} loadingLabel="Restoring…" disabled={running} title={running ? pausedReason : undefined}>
          Restore
        </Button>
      )),
    }] : []),
  ];

  return (
    <div className="section-stack">
      <Section
        title="Publish"
        description={directory?.published_at ? (
          <>
            Published {formatWhen(directory.published_at)}.{" "}
            {publicUrl && <a href={publicUrl} target="_blank" rel="noopener noreferrer">View public page</a>}
          </>
        ) : "Not published yet."}
        footer={canPublish ? (
          <Button variant="primary" onClick={handlePublish} loading={publishing} loadingLabel="Publishing…" disabled={running} disabledReason={pausedReason}>
            {directory?.published_at ? "Publish update" : "Publish"}
          </Button>
        ) : null}
      >
        {job ? (
          <JobCard
            job={job}
            onRetry={handleRegenerate}
            onDismiss={dismiss}
            askPip={{ question: "Can I undo a publish?" }}
            primaryAction={publicUrl ? <Button as="a" href={publicUrl} target="_blank" rel="noopener noreferrer">View live site</Button> : null}
          />
        ) : null}

        {err ? <Callout tone="danger">{err}</Callout> : null}

        {canPublish ? (
          <Field label="Note (optional)">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        ) : null}
      </Section>

      <Section title="Version history" flush>
        <DataTable
          caption="Version history"
          columns={historyColumns}
          rows={history}
          getRowId={(pub) => pub.id}
          getRowLabel={(pub) => `Version ${pub.version}`}
          loading={loadingHistory}
          empty={<EmptyState art="none" title="No publish history yet" body="Publish this directory to create the first version." />}
        />
      </Section>
    </div>
  );
}
