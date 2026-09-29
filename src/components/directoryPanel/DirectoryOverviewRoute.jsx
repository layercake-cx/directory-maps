import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";
import { supabase } from "../../lib/supabase.js";
import { countEntriesMissingSeoMetadata } from "../../lib/directories.js";
import { listDirectoryPublications } from "../../lib/directoryPublications.js";
import { listClaimsForDirectory } from "../../lib/claims.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function Tile({ label, value, sub }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  );
}

/**
 * Directory Overview (Phase 4, admin shell redesign) — real tiles, all backed by existing tables
 * and RPCs (see the Phase 4 plan doc's research: this needed no new schema, contrary to how
 * large BACKLOG.md's original "size L" guess assumed). Anything that genuinely needs a migration
 * (a client-facing activity feed, a directories volume entitlement) is NOT here — see BACKLOG.md.
 *
 * Uses the shell's own page-body component vocabulary (.stat-grid/.stat/.card — see
 * admin-shell.css) rather than the old admin.css/.admin-card patterns Phase 4 originally shipped
 * with — see BACKLOG.md "Page body content still uses the old design system".
 */
export default function DirectoryOverviewRoute() {
  const { directory, client, basePath } = useDirectory();
  const [changedSincePublish, setChangedSincePublish] = useState(null);
  const [missingSeo, setMissingSeo] = useState(null);
  const [missingContent, setMissingContent] = useState(null);
  const [missingLogo, setMissingLogo] = useState(null);
  const [notGeocoded, setNotGeocoded] = useState(null);
  const [lastPublication, setLastPublication] = useState(null);
  const [claimsByStatus, setClaimsByStatus] = useState(null);
  const [enquiries30d, setEnquiries30d] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!directory?.id) return;
    const directoryId = directory.id;
    const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    (async () => {
      try {
        const publications = await listDirectoryPublications(directoryId).catch(() => []);
        const latest = publications[0] ?? null;
        setLastPublication(latest);

        const [
          { count: changedCount },
          { count: contentCount },
          { count: logoCount },
          { count: geoCount },
          seoCount,
          claims,
          { count: enquiryCount },
        ] = await Promise.all([
          latest?.published_at
            ? supabase
                .from("directory_entries")
                .select("id", { count: "exact", head: true })
                .eq("directory_id", directoryId)
                .gt("updated_at", latest.published_at)
            : Promise.resolve({ count: null }),
          supabase.from("directory_entries").select("id", { count: "exact", head: true }).eq("directory_id", directoryId).is("notes_html", null),
          supabase.from("directory_entries").select("id", { count: "exact", head: true }).eq("directory_id", directoryId).is("logo_url", null),
          supabase.from("directory_entries").select("id", { count: "exact", head: true }).eq("directory_id", directoryId).is("lat", null),
          countEntriesMissingSeoMetadata(directoryId).catch(() => null),
          listClaimsForDirectory(directoryId).catch(() => []),
          supabase
            .from("directory_contact_submissions")
            .select("id", { count: "exact", head: true })
            .eq("directory_id", directoryId)
            .gte("submitted_at", since),
        ]);

        setChangedSincePublish(changedCount);
        setMissingContent(contentCount);
        setMissingLogo(logoCount);
        setNotGeocoded(geoCount);
        setMissingSeo(seoCount);
        setEnquiries30d(enquiryCount ?? 0);

        const active = claims.filter((c) => c.status === "active").length;
        const awaiting = claims.filter((c) => ["claim_started", "email_verification_pending", "verified", "payment_pending"].includes(c.status)).length;
        setClaimsByStatus({ total: claims.length, active, awaiting });
      } catch (e) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [directory?.id]);

  if (!directory) return null;

  const publicUrl = directory.published_at && client?.slug && directory.slug ? `https://maps.layercake-cx.biz/directories/${client.slug}/${directory.slug}` : null;

  return (
    <div>
      {directory.description && <p style={{ margin: "0 0 16px", color: "var(--shell-text-soft)" }}>{directory.description}</p>}
      {err && <p style={{ color: "var(--shell-danger)" }}>{err}</p>}

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <Tile label="Entries changed since publish" value={lastPublication ? (changedSincePublish ?? "…") : "—"} sub={!lastPublication ? "Not yet published" : undefined} />
        <Tile label="Missing SEO metadata" value={missingSeo ?? "…"} />
        <Tile label="Missing page content" value={missingContent ?? "…"} />
        <Tile label="Missing logo" value={missingLogo ?? "…"} />
        <Tile label="Not geocoded" value={notGeocoded ?? "…"} />
        <Tile label="Enquiries (30 days)" value={enquiries30d ?? "…"} />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <p className="card-title">Publishing</p>
        {lastPublication ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            Last published {new Date(lastPublication.published_at).toLocaleString()} — version {lastPublication.version}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "var(--shell-text-muted)" }}>Not yet published.</p>
        )}
        {publicUrl && (
          <p style={{ margin: 0, fontSize: 13 }}>
            <a href={publicUrl} target="_blank" rel="noreferrer">View live site ↗</a>
            {" · "}
            <a href={`${publicUrl}/sitemap.xml`} target="_blank" rel="noreferrer">sitemap.xml</a>
            {" · "}
            <a href={`${publicUrl}/robots.txt`} target="_blank" rel="noreferrer">robots.txt</a>
            {" · "}
            <a href={`${publicUrl}/llms.txt`} target="_blank" rel="noreferrer">llms.txt</a>
          </p>
        )}
        <p style={{ margin: 0, fontSize: 13 }}>
          <Link to={`${basePath}/publishing`}>Manage publishing →</Link>
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <p className="card-title">Claims</p>
        {claimsByStatus ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            {claimsByStatus.total} total — {claimsByStatus.active} active, {claimsByStatus.awaiting} awaiting verification
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "var(--shell-text-muted)" }}>…</p>
        )}
        <p style={{ margin: 0, fontSize: 13 }}>
          <Link to={`${basePath}/claims`}>View claims →</Link>
        </p>
      </div>

      <div className="card card-pad">
        <p className="card-title">Visitor features</p>
        <p style={{ margin: 0, fontSize: 13 }}>
          Location search: {directory.location_search_enabled ? "On" : "Off"} · Help me choose (AI web search): {directory.ai_search_web_enabled ? "On" : "Off"}
        </p>
      </div>

      <p style={{ margin: "16px 0 0" }}>
        <Link to={`${basePath}/entries`}>View entries →</Link>
      </p>
    </div>
  );
}
