import React, { useEffect, useState } from "react";
import { AskPipLink, Button, Callout, PageLayout, Pill, Section, SettingRow, StatGrid, StatTile } from "../ui/index.js";
import { Link } from "react-router-dom";
import "../../styles/wave-a/batch-1.css";
import { useDirectory } from "../../hooks/useDirectory.js";
import { supabase } from "../../lib/supabase.js";
import { countEntriesMissingSeoMetadata } from "../../lib/directories.js";
import { listDirectoryPublications } from "../../lib/directoryPublications.js";
import { listClaimsForDirectory } from "../../lib/claims.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** `action` true = amber (needs attention), false = green (nothing to do), null = neutral/loading. Links when `to` is set. */
function Tile({ label, value, sub, action = null, to }) {
  const tone = action === true ? "warn" : action === false ? "ok" : "default";
  return <StatTile compact label={label} value={value} sub={sub} tone={tone} href={to} />;
}

/** Counts rows matching a gap filter; when exactly one matches, also returns its id so the tile can open that entry directly. */
async function gapCount(directoryId, apply) {
  const { data, count } = await apply(
    supabase.from("directory_entries").select("id", { count: "exact" }).eq("directory_id", directoryId)
  ).limit(1);
  return { count: count ?? 0, id: count === 1 ? data?.[0]?.id ?? null : null };
}

/**
 * Directory Overview (Phase 4, admin shell redesign) — real tiles, all backed by existing tables
 * and RPCs (see the Phase 4 plan doc's research: this needed no new schema, contrary to how
 * large BACKLOG.md's original "size L" guess assumed). Anything that genuinely needs a migration
 * (a client-facing activity feed, a directories volume entitlement) is NOT here — see BACKLOG.md.
 *
 * Built on the Discover UI kit (PageLayout, StatTile, Section).
 */
export default function DirectoryOverviewRoute() {
  const { directory, client, basePath, canManage } = useDirectory();
  const [totalEntries, setTotalEntries] = useState(null);
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
          contentGap,
          logoGap,
          geoGap,
          { count: entryCount },
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
          gapCount(directoryId, (q) => q.is("notes_html", null)),
          gapCount(directoryId, (q) => q.is("logo_url", null)),
          gapCount(directoryId, (q) => q.is("lat", null)),
          supabase.from("directory_entries").select("id", { count: "exact", head: true }).eq("directory_id", directoryId),
          countEntriesMissingSeoMetadata(directoryId).catch(() => null),
          listClaimsForDirectory(directoryId).catch(() => []),
          supabase
            .from("directory_contact_submissions")
            .select("id", { count: "exact", head: true })
            .eq("directory_id", directoryId)
            .gte("submitted_at", since),
        ]);

        setChangedSincePublish(changedCount);
        setMissingContent(contentGap);
        setMissingLogo(logoGap);
        setNotGeocoded(geoGap);
        setTotalEntries(entryCount ?? 0);
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

  const entriesPath = `${basePath}/entries`;
  /** One match → straight to that entry (on the relevant tab); several → the entries list pre-filtered by gap. */
  const gapTile = (gap, found, tab) => ({
    action: found == null ? null : found.count > 0,
    value: found?.count ?? "…",
    to: !found || found.count === 0 ? undefined : found.id ? `${entriesPath}/${found.id}${tab}` : `${entriesPath}?gap=${gap}`,
  });
  const seoTo = missingSeo ? (canManage ? `${basePath}/seo` : `${entriesPath}?gap=no_seo`) : undefined;
  const unpublished = lastPublication ? changedSincePublish > 0 : true;

  return (
    <PageLayout
      head={{ title: "Overview", subtitle: directory.description || undefined }}
      summary={(
        <>
          {err ? <Callout tone="danger">{err}</Callout> : null}

          <StatGrid compact>
            <Tile label="Entries" value={totalEntries ?? "…"} action={totalEntries == null ? null : totalEntries === 0} to={entriesPath} sub={totalEntries === 0 ? "Add your first entry" : undefined} />
            <Tile
              label="Changed since publish"
              value={lastPublication ? (changedSincePublish ?? "…") : "—"}
              action={lastPublication && changedSincePublish == null ? null : unpublished}
              to={unpublished ? `${basePath}/publishing` : undefined}
              sub={!lastPublication ? "Not yet published" : undefined}
            />
            <Tile label="Missing SEO metadata" value={missingSeo ?? "…"} action={missingSeo == null ? null : missingSeo > 0} to={seoTo} />
            <Tile label="Missing page content" {...gapTile("no_content", missingContent, "/content")} />
            <Tile label="Missing logo" {...gapTile("no_logo", missingLogo, "")} />
            <Tile label="Not geocoded" {...gapTile("not_geocoded", notGeocoded, "")} />
            <Tile label="Enquiries (30 days)" value={enquiries30d ?? "…"} to={enquiries30d ? `${basePath}/email-log` : undefined} />
          </StatGrid>

          <AskPipLink question="What should I fix first?" context="Needs attention" />
        </>
      )}
    >
      <div className="section-stack">
        <Section
          title="Publishing"
          actions={<Button as={Link} to={`${basePath}/publishing`} size="sm">Manage publishing</Button>}
        >
          <p>
            {lastPublication
              ? `Last published ${new Date(lastPublication.published_at).toLocaleString()} — version ${lastPublication.version}`
              : "Not yet published."}
          </p>
          {publicUrl && (
            <ul className="b1-link-list">
              <li><a href={publicUrl} target="_blank" rel="noreferrer">View live site ↗</a></li>
              <li><a href={`${publicUrl}/sitemap.xml`} target="_blank" rel="noreferrer">sitemap.xml</a></li>
              <li><a href={`${publicUrl}/robots.txt`} target="_blank" rel="noreferrer">robots.txt</a></li>
              <li><a href={`${publicUrl}/llms.txt`} target="_blank" rel="noreferrer">llms.txt</a></li>
            </ul>
          )}
        </Section>

        <Section
          title="Claims"
          actions={<Button as={Link} to={`${basePath}/claims`} size="sm">View claims</Button>}
        >
          <p>
            {claimsByStatus
              ? `${claimsByStatus.total} total — ${claimsByStatus.active} active, ${claimsByStatus.awaiting} awaiting verification`
              : "…"}
          </p>
        </Section>

        <Section title="Visitor features" flush>
          <SettingRow
            label="Location search"
            control={<Pill tone={directory.location_search_enabled ? "ok" : "neutral"}>{directory.location_search_enabled ? "On" : "Off"}</Pill>}
          />
          <SettingRow
            label="Help me choose (AI web search)"
            control={<Pill tone={directory.ai_search_web_enabled ? "ok" : "neutral"}>{directory.ai_search_web_enabled ? "On" : "Off"}</Pill>}
          />
        </Section>
      </div>
    </PageLayout>
  );
}
