import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { getMyClaimContext } from "../../lib/claims.js";
import { getClaimedListing } from "../../lib/claimManager.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import { CLAIM_SEO_FIELDS, saveClaimSeo } from "../../lib/seoAdapters.js";
import FocusedBlockEditor from "../../components/blockEditor/FocusedBlockEditor.jsx";

/**
 * /claim/edit/:claimId — the focused page editor for a listing owner (a claim owner or editor), on their own listing.
 * Same editor as the CMS; the rules differ only by what the server allows a claim user: they are bound by the locks an
 * administrator set, can edit the page's title and description (not its URL or social settings), and can publish
 * only this listing. Needs an ACTIVE claim to edit; otherwise it opens read-only.
 */
export default function ClaimFocusedEditor() {
  const { claimId } = useParams();
  const { user, initializing } = useAuth();
  const [context, setContext] = useState(undefined); // undefined = loading, null = not linked
  const [err, setErr] = useState("");

  useEffect(() => {
    if (initializing || !user) return;
    getMyClaimContext()
      .then((rows) => setContext(rows.find((r) => r.claim_id === claimId) ?? null))
      .catch((e) => setErr(e?.message ?? String(e)));
  }, [initializing, user, claimId]);

  const recordEvent = useCallback((eventType, meta) => {
    recordAdminEvent(supabase, { eventType, meta, source: "claim_manager" });
  }, []);

  if (initializing || (user && context === undefined && !err)) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!user) return <Navigate to="/claim/login" replace />;
  if (err) return <p style={{ padding: 24 }}>{err}</p>;
  if (!context) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Not found</h1>
        <p>This claim isn&rsquo;t linked to your account, or no longer exists.</p>
        <p><Link to="/claim/login">Back to sign in</Link></p>
      </div>
    );
  }

  return (
    <FocusedBlockEditor
      kind="entry"
      id={context.directory_item_id}
      directoryId={context.directory_id}
      claimId={claimId}
      backHref={`/claim/manage/${claimId}`}
      canEdit={context.claim_status === "active"}
      recordEvent={recordEvent}
      loadRecordOverride={() => getClaimedListing(claimId)}
      seoFields={CLAIM_SEO_FIELDS}
      saveSeoOverride={(patch, record) => saveClaimSeo(claimId, record)(patch)}
      urlPrefix="/"
      siteName=""
    />
  );
}
