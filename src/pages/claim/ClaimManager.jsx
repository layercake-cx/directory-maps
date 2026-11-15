import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { getMyClaimContext, sendClaimUserMagicLink, transferClaimOwnership } from "../../lib/claims.js";
import {
  getClaimedListing,
  getClaimUsers,
  inviteClaimEditor,
  publishDirectoryItem,
  removeClaimUser,
  generateListingDraft,
  getListingDraftingPrompt,
  updateClaimedListingBody,
  updateClaimedListingContact,
  updateClaimedListingSeo,
} from "../../lib/claimManager.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import AIButton from "../../components/ai/AIButton.jsx";
import AiProvenanceNote from "../../components/ai/AiProvenanceNote.jsx";
import DraftingPromptModal from "../../components/ai/DraftingPromptModal.jsx";
import "./listingManager.css";
import RichTextEditor from "../../components/directories/entryEdit/RichTextEditor.jsx";

const STATUS_LABELS = {
  claim_started: "Claim started",
  email_verification_pending: "Email verification pending",
  verified: "Verified",
  payment_pending: "Payment pending",
  active: "Active",
  payment_failed: "Payment issue",
  suspended: "Suspended",
  revoked: "Revoked",
};

/**
 * The restricted "Listing Manager" a claim user lands on -- Phase 4 of the
 * Claimed Directory Listings epic. Listing/SEO/Contact details are
 * read-only previews for now (Phase 5 adds editing, reusing the same
 * get_claimed_listing() read). Users is real:
 * an owner can invite/remove an editor here today.
 */
export default function ClaimManager() {
  const { claimId } = useParams();
  const { user, initializing } = useAuth();
  const [context, setContext] = useState(null);
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState("listing");

  const loadContext = useCallback(async () => {
    const rows = await getMyClaimContext();
    return rows.find((r) => r.claim_id === claimId) ?? null;
  }, [claimId]);

  useEffect(() => {
    if (initializing) return;
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const match = await loadContext();
        if (cancelled) return;
        setContext(match);
        if (match) setListing(await getClaimedListing(claimId));
      } catch (e) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initializing, user, claimId, loadContext]);

  const refreshListing = useCallback(async () => {
    setListing(await getClaimedListing(claimId));
    setContext(await loadContext());
  }, [claimId, loadContext]);

  const recordEvent = useCallback((eventType, meta) => {
    recordAdminEvent(supabase, { eventType, meta, source: "claim_manager" });
  }, []);

  const canEdit = context?.claim_status === "active";

  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");

  async function handlePublish() {
    setPublishMsg("");
    setErr("");
    try {
      setPublishing(true);
      await publishDirectoryItem(context.directory_item_id);
      recordEvent("claimed_listing_published", { directory_id: context.directory_id, directory_item_id: context.directory_item_id, claim_id: claimId });
      setPublishMsg("Published.");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setPublishing(false);
    }
  }

  if (initializing || loading) {
    return (
      <div className="page-main auth-page">
        <div className="admin-card auth-page__card">
          <p style={{ margin: 0 }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/claim/login" replace />;
  }

  if (!context) {
    return (
      <div className="page-main auth-page">
        <div className="admin-card auth-page__card">
          <h1 className="auth-page__title">Not found</h1>
          <p className="auth-page__sub">This claim isn&rsquo;t linked to your account, or no longer exists.</p>
          <p><Link to="/claim/login">Back to sign in</Link></p>
        </div>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[context.claim_status] ?? context.claim_status;
  const isActive = context.claim_status === "active";

  return (
    <div className="lm">
      {err ? <p className="lm__error">{err}</p> : null}

      <nav className="lm__crumbs" aria-label="Breadcrumb">
        <span>Listing manager</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        <span aria-current="page">{context.entry_name}</span>
      </nav>

      <div className="lm__header">
        <div className="lm__title-block">
          <h1 className="lm__title">{context.entry_name}</h1>
          <div className="lm__meta">
            <span className={`lm__pill ${isActive ? "lm__pill--active" : "lm__pill--neutral"}`}>
              {isActive && <span className="lm__dot" aria-hidden="true" />}
              {statusLabel}
            </span>
            <span className="lm__pill lm__pill--role">{context.role === "owner" ? "Owner" : "Editor"}</span>
            <span className="lm__signed">Signed in as {user.email}</span>
          </div>
          {publishMsg ? <p className="lm__ok" role="status">{publishMsg}</p> : null}
        </div>
        <div className="lm__actions">
          <button className="lm__btn lm__btn--outline" type="button" disabled title="Coming soon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            Preview
          </button>
          <button
            className="lm__btn lm__btn--primary"
            type="button"
            disabled={!canEdit || publishing}
            title={canEdit ? undefined : "Editing opens once your claim is active"}
            onClick={handlePublish}
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      <ListingTabs
        tabs={[
          { id: "listing", label: "Listing", icon: "M6 3h9l4 4v14H6z M9 11h7 M9 15h7" },
          { id: "seo", label: "SEO", icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3" },
          { id: "contact", label: "Contact details", icon: "M3 6h18v12H3z M3 7l9 6 9-6" },
          { id: "users", label: "Users", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0" },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "listing" && (
        <div role="tabpanel" id="lm-panel-listing" aria-labelledby="lm-tab-listing">
          <ListingTab
            claimId={claimId}
            entryId={context.directory_item_id}
            directoryId={context.directory_id}
            listing={listing}
            canEdit={canEdit}
            recordEvent={recordEvent}
            onSaved={refreshListing}
            onGoToContact={() => setActiveTab("contact")}
          />
        </div>
      )}

      {activeTab === "seo" && (
        <SeoTab claimId={claimId} listing={listing} canEdit={canEdit} recordEvent={recordEvent} onSaved={refreshListing} />
      )}

      {activeTab === "contact" && (
        <ContactTab claimId={claimId} listing={listing} canEdit={canEdit} recordEvent={recordEvent} onSaved={refreshListing} />
      )}

      {activeTab === "users" && (
        <UsersTab
          claimId={claimId}
          isOwner={context.role === "owner"}
          directoryId={context.directory_id}
          directoryItemId={context.directory_item_id}
          recordEvent={recordEvent}
          onOwnershipChanged={refreshListing}
        />
      )}
    </div>
  );
}

function EditNotice() {
  return (
    <p style={{ margin: "0 0 12px", fontSize: 12, background: "#fef3c7", color: "#92400e", padding: "8px 10px", borderRadius: 6 }}>
      Editing opens once your claim is active.
    </p>
  );
}

function Provenance({ listing }) {
  if (!listing) return null;
  return (
    <p style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>
      Source: {listing.content_managed_by === "claimed_org" ? "Claimed organisation" : "Platform"}
      {listing.content_last_edited_at ? ` · Last edited ${new Date(listing.content_last_edited_at).toLocaleDateString()}` : ""}
    </p>
  );
}

const TAB_ORDER_KEYS = ["ArrowLeft", "ArrowRight", "Home", "End"];

/** WAI-ARIA tabs: roving tabindex, Left/Right/Home/End. Underline style, no outline box on the active tab. */
function ListingTabs({ tabs, activeTab, onChange }) {
  function onKeyDown(e, index) {
    if (!TAB_ORDER_KEYS.includes(e.key)) return;
    e.preventDefault();
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    onChange(tabs[next].id);
    document.getElementById(`lm-tab-${tabs[next].id}`)?.focus();
  }
  return (
    <div className="lm__tabs" role="tablist" aria-label="Listing sections">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          id={`lm-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={activeTab === t.id}
          aria-controls={`lm-panel-${t.id}`}
          tabIndex={activeTab === t.id ? 0 : -1}
          className={`lm__tab${activeTab === t.id ? " is-active" : ""}`}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ListingTab({ claimId, entryId, directoryId, listing, canEdit, recordEvent, onSaved, onGoToContact }) {
  const [html, setHtml] = useState(listing?.notes_html || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => { setHtml(listing?.notes_html || ""); }, [listing?.notes_html]);

  const hasWebAddress = !!listing?.website_url?.trim();
  const aiDisabled = !canEdit || !hasWebAddress;
  const loadPrompt = useCallback(() => getListingDraftingPrompt(entryId), [entryId]);

  function openPrompt() {
    setPromptOpen(true);
    recordEvent?.("claimed_listing_ai_prompt_viewed", { directory_id: directoryId, directory_item_id: entryId, claim_id: claimId });
  }

  async function handleSave() {
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      await updateClaimedListingBody(claimId, html);
      recordEvent?.("claimed_listing_updated", { claim_id: claimId, changed_fields: ["notes_html"] });
      setMsg("Saved.");
      await onSaved?.();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  /** Puts an AI draft in the (unsaved) editor. Never saves or publishes. Errors propagate to AIButton, which shows them inline. */
  async function handleGenerate() {
    const hasHandEdits = html.trim() && html !== (listing?.notes_html || "");
    if (hasHandEdits && !window.confirm("Replace your current text with an AI draft? Your unsaved edits will be lost.")) return false;
    setErr("");
    setMsg("");
    recordEvent?.("claimed_listing_ai_draft_requested", { directory_id: directoryId, directory_item_id: entryId, claim_id: claimId, mode: "draft" });
    try {
      const draft = await generateListingDraft(entryId);
      setHtml(draft);
      setMsg("Draft ready. Review it, then press Save listing content.");
      recordEvent?.("claimed_listing_ai_draft_generated", { directory_id: directoryId, directory_item_id: entryId, claim_id: claimId, mode: "draft" });
    } catch (e) {
      recordEvent?.("claimed_listing_ai_draft_failed", { directory_id: directoryId, directory_item_id: entryId, claim_id: claimId, mode: "draft", error: e?.message ?? String(e) });
      throw e;
    }
  }

  const hintId = "lm-ai-disabled-hint";

  return (
    <div className="lm__layout">
      <div className="lm__card lm__main">
        <div className="lm__card-head">
          <div>
            <h2 className="lm__card-title">Listing content</h2>
            <p className="lm__card-sub">The main description visitors see on your public listing.</p>
          </div>
          {canEdit && (
            <AIButton
              onGenerate={handleGenerate}
              disabled={aiDisabled}
              disabledReason={!hasWebAddress ? "Add a web address in Contact details to use AI drafting." : undefined}
              describedBy={aiDisabled && canEdit ? hintId : undefined}
            />
          )}
        </div>
        {!canEdit && <EditNotice />}
        {canEdit && (
          <AiProvenanceNote onViewPrompt={openPrompt} loadPrompt={loadPrompt}>
            AI drafts this listing from the details we hold for it, including its web address, following a drafting prompt set by the directory&rsquo;s administrators. Check the draft before you save it.
          </AiProvenanceNote>
        )}
        {canEdit && !hasWebAddress && (
          <p className="ai-hint" id={hintId}>
            Add a web address in{" "}
            <button type="button" className="ai-note__link" onClick={onGoToContact}>Contact details</button>{" "}
            to use AI drafting.
          </p>
        )}
        {err && <p className="lm__error">{err}</p>}
        {msg && <p className="lm__ok" role="status">{msg}</p>}
        <div className="lm__editor">
          <RichTextEditor value={html} onChange={setHtml} editable={canEdit} />
        </div>
        <div className="lm__card-foot">
          <p className="lm__source">
            Source
            <span className="lm__chip">{listing?.content_managed_by === "claimed_org" ? "Claimed organisation" : "Platform"}</span>
            {listing?.content_last_edited_at ? <span>Last edited {new Date(listing.content_last_edited_at).toLocaleDateString("en-GB")}</span> : null}
          </p>
          {canEdit && (
            <button type="button" className="lm__btn lm__btn--primary" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save listing content"}
            </button>
          )}
        </div>
      </div>

      <aside className="lm__aside">
        <div className="lm__card lm__side">
          <div className="lm__side-head">
            <span className="ai-modal__badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 3.5l1.8 4.9 4.9 1.8-4.9 1.8L11 16.9l-1.8-4.9-4.9-1.8 4.9-1.8z" /><path d="M18.5 14l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" /></svg>
            </span>
            <h3 className="lm__side-title">Write with AI</h3>
          </div>
          <p className="lm__side-text">
            The AI uses the details we hold for this listing, including the website in Contact details, and writes to the directory&rsquo;s own drafting instructions, so every listing follows the same brief. Edit the draft into your own voice. Nothing goes live until you press Publish.
          </p>
          <button type="button" className="ai-note__link lm__prompt-link" onClick={openPrompt}>View drafting prompt</button>
        </div>
        <div className="lm__card lm__side">
          <h3 className="lm__side-title">What makes a strong listing</h3>
          <ul className="lm__side-text lm__tips">
            <li>Say who you serve in the first sentence.</li>
            <li>Name the practical help members get.</li>
            <li>Keep the web address in Contact details current: AI drafts start from it.</li>
          </ul>
        </div>
      </aside>

      <DraftingPromptModal
        opened={promptOpen}
        onClose={() => setPromptOpen(false)}
        loadPrompt={loadPrompt}
        onGenerate={handleGenerate}
        canGenerate={!aiDisabled}
      />
    </div>
  );
}

function SeoTab({ claimId, listing, canEdit, recordEvent, onSaved }) {
  const [metaTitle, setMetaTitle] = useState(listing?.meta_title || "");
  const [metaDescription, setMetaDescription] = useState(listing?.meta_description || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setMetaTitle(listing?.meta_title || "");
    setMetaDescription(listing?.meta_description || "");
  }, [listing?.meta_title, listing?.meta_description]);

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      await updateClaimedListingSeo(claimId, { metaTitle, metaDescription });
      recordEvent?.("claimed_listing_updated", { claim_id: claimId, changed_fields: ["meta_title", "meta_description"] });
      setMsg("Saved.");
      await onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const disabled = !canEdit;

  return (
    <form onSubmit={handleSave} className="admin-card" style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>SEO</p>
      {!canEdit && <EditNotice />}
      {err && <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 13, margin: 0 }}>{msg}</p>}
      <div>
        <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Page title</label>
        <input type="text" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} disabled={disabled} style={{ width: "100%", maxWidth: 480, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }} />
      </div>
      <div>
        <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Meta description</label>
        <textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} disabled={disabled} rows={3} style={{ width: "100%", maxWidth: 480, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13, resize: "vertical" }} />
      </div>
      {canEdit && (
        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save SEO"}</button>
        </div>
      )}
    </form>
  );
}

function ContactTab({ claimId, listing, canEdit, recordEvent, onSaved }) {
  const [fields, setFields] = useState({
    website_url: "", email: "", phone: "", address: "", postcode: "", country: "", city: "",
    show_phone: true, show_email: true, show_website: true, show_address: true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!listing) return;
    setFields({
      website_url: listing.website_url || "",
      email: listing.email || "",
      phone: listing.phone || "",
      address: listing.address || "",
      postcode: listing.postcode || "",
      country: listing.country || "",
      city: listing.city || "",
      show_phone: listing.show_phone !== false,
      show_email: listing.show_email !== false,
      show_website: listing.show_website !== false,
      show_address: listing.show_address !== false,
    });
  }, [listing]);

  function set(key, value) { setFields((f) => ({ ...f, [key]: value })); }

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      await updateClaimedListingContact(claimId, fields);
      recordEvent?.("claimed_listing_updated", { claim_id: claimId, changed_fields: Object.keys(fields) });
      setMsg("Saved.");
      await onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const disabled = !canEdit;
  const inputStyle = { width: "100%", maxWidth: 380, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 };

  return (
    <form onSubmit={handleSave} className="admin-card" style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Contact details</p>
      {!canEdit && <EditNotice />}
      {err && <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 13, margin: 0 }}>{msg}</p>}

      {[
        ["Website", "website_url", "show_website"],
        ["Email", "email", "show_email"],
        ["Phone", "phone", "show_phone"],
      ].map(([label, key, showKey]) => (
        <div key={key}>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>{label}</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="text" value={fields[key]} onChange={(e) => set(key, e.target.value)} disabled={disabled} style={inputStyle} />
            <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={fields[showKey]} onChange={(e) => set(showKey, e.target.checked)} disabled={disabled} />
              Show publicly
            </label>
          </div>
        </div>
      ))}

      <div>
        <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Address</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="text" value={fields.address} onChange={(e) => set("address", e.target.value)} disabled={disabled} placeholder="Street address" style={inputStyle} />
          <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={fields.show_address} onChange={(e) => set("show_address", e.target.checked)} disabled={disabled} />
            Show publicly
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input type="text" value={fields.city} onChange={(e) => set("city", e.target.value)} disabled={disabled} placeholder="City" style={{ ...inputStyle, maxWidth: 160 }} />
          <input type="text" value={fields.postcode} onChange={(e) => set("postcode", e.target.value)} disabled={disabled} placeholder="Postcode" style={{ ...inputStyle, maxWidth: 120 }} />
          <input type="text" value={fields.country} onChange={(e) => set("country", e.target.value)} disabled={disabled} placeholder="Country" style={{ ...inputStyle, maxWidth: 160 }} />
        </div>
      </div>

      {canEdit && (
        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save contact details"}</button>
        </div>
      )}
    </form>
  );
}

function UsersTab({ claimId, isOwner, directoryId, directoryItemId, recordEvent, onOwnershipChanged }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const [transferEmail, setTransferEmail] = useState("");
  const [transferName, setTransferName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await getClaimUsers(claimId));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setBusy(true);
      const newClaimUserId = await inviteClaimEditor(claimId, { email, name });
      await sendClaimUserMagicLink(email.trim(), { claimId });
      recordEvent?.("claim_user_invited", { directory_id: directoryId, directory_item_id: directoryItemId, claim_id: claimId, claim_user_id: newClaimUserId, role: "editor" });
      setMsg(`Invitation sent to ${email}.`);
      setName("");
      setEmail("");
      await load();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(claimUserId) {
    setErr("");
    setMsg("");
    try {
      setBusy(true);
      await removeClaimUser(claimId, claimUserId);
      recordEvent?.("claim_user_removed", { directory_id: directoryId, directory_item_id: directoryItemId, claim_id: claimId, claim_user_id: claimUserId, role: "editor" });
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer(targetEmail, targetName) {
    setErr("");
    setMsg("");
    try {
      setBusy(true);
      const { status, claimUserId } = await transferClaimOwnership(claimId, { email: targetEmail, name: targetName });
      recordEvent?.("claim_ownership_transfer_started", { directory_id: directoryId, directory_item_id: directoryItemId, claim_id: claimId, to_claim_user_id: claimUserId });
      if (status === "completed") {
        recordEvent?.("claim_ownership_transferred", { directory_id: directoryId, directory_item_id: directoryItemId, claim_id: claimId, to_claim_user_id: claimUserId });
        setMsg(`${targetEmail} is now the owner.`);
        await onOwnershipChanged?.();
      } else {
        await sendClaimUserMagicLink(targetEmail, { claimId });
        setMsg(`Invitation sent to ${targetEmail}. Ownership transfers once they sign in.`);
      }
      setTransferEmail("");
      setTransferName("");
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-card">
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Users</p>
      {err && <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 13 }}>{msg}</p>}

      {loading ? (
        <p style={{ fontSize: 13, opacity: 0.7 }}>Loading…</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: isOwner ? 16 : 0 }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.7 }}>
              <th style={{ padding: "6px 8px 6px 0" }}>Name</th>
              <th style={{ padding: "6px 8px" }}>Email</th>
              <th style={{ padding: "6px 8px" }}>Role</th>
              {isOwner && <th style={{ padding: "6px 0 6px 8px" }} />}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--lc-border)" }}>
                <td style={{ padding: "8px 8px 8px 0" }}>{u.name || "—"}{u.is_me ? " (you)" : ""}</td>
                <td style={{ padding: "8px" }}>{u.email}</td>
                <td style={{ padding: "8px" }}>{u.role}</td>
                {isOwner && (
                  <td style={{ padding: "8px 0 8px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {u.role === "editor" && (
                      <>
                        <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px", marginRight: 6 }} disabled={busy} onClick={() => handleTransfer(u.email, u.name)}>
                          Make owner
                        </button>
                        <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px", color: "#b91c1c" }} disabled={busy} onClick={() => handleRemove(u.id)}>
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isOwner && (
        <form onSubmit={handleInvite} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid var(--lc-border)", paddingTop: 12 }}>
          <div>
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--lc-border)", fontSize: 12 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--lc-border)", fontSize: 12 }} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ fontSize: 12 }}>Invite editor</button>
        </form>
      )}

      {isOwner && (
        <form
          onSubmit={(e) => { e.preventDefault(); handleTransfer(transferEmail, transferName); }}
          style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid var(--lc-border)", paddingTop: 12, marginTop: 12 }}
        >
          <div style={{ flexBasis: "100%", fontSize: 12, fontWeight: 600 }}>Transfer ownership to a new person</div>
          <div>
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Name</label>
            <input type="text" value={transferName} onChange={(e) => setTransferName(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--lc-border)", fontSize: 12 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Email</label>
            <input type="email" required value={transferEmail} onChange={(e) => setTransferEmail(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--lc-border)", fontSize: 12 }} />
          </div>
          <button type="submit" className="btn" disabled={busy} style={{ fontSize: 12 }}>Transfer ownership</button>
        </form>
      )}
    </div>
  );
}
