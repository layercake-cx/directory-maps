import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { getMyClaimContext, sendClaimUserMagicLink } from "../../lib/claims.js";
import {
  addClaimTeamMember,
  getClaimedListing,
  getClaimTeamMembers,
  getClaimUsers,
  inviteClaimEditor,
  publishDirectoryItem,
  removeClaimTeamMember,
  removeClaimUser,
  updateClaimedListingBody,
  updateClaimedListingContact,
  updateClaimedListingSeo,
  updateClaimTeamMember,
} from "../../lib/claimManager.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import MapDataTabs from "../../components/MapDataTabs.jsx";
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
 * Claimed Directory Listings epic. Listing/SEO/Contact details/Team are
 * read-only previews for now (Phase 5 adds editing, reusing the same
 * get_claimed_listing()/get_claim_team_members() reads). Users is real:
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

  return (
    <div className="page-main" style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.5 }}>Listing Manager</p>
          <h2 style={{ margin: "2px 0 0" }}>{context.entry_name}</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.7 }}>
            Signed in as {user.email} · {context.role} · {STATUS_LABELS[context.claim_status] ?? context.claim_status}
          </p>
          {publishMsg ? <p style={{ margin: "4px 0 0", fontSize: 13, color: "#15803d" }}>{publishMsg}</p> : null}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" type="button" disabled title="Coming soon">Preview</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canEdit || publishing}
            title={canEdit ? undefined : "Editing opens once your claim is active"}
            onClick={handlePublish}
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      <MapDataTabs
        tabs={[
          { id: "listing", label: "Listing" },
          { id: "seo", label: "SEO" },
          { id: "contact", label: "Contact details" },
          { id: "team", label: "Team" },
          { id: "users", label: "Users" },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "listing" && (
        <ListingTab claimId={claimId} listing={listing} canEdit={canEdit} recordEvent={recordEvent} onSaved={refreshListing} />
      )}

      {activeTab === "seo" && (
        <SeoTab claimId={claimId} listing={listing} canEdit={canEdit} recordEvent={recordEvent} onSaved={refreshListing} />
      )}

      {activeTab === "contact" && (
        <ContactTab claimId={claimId} listing={listing} canEdit={canEdit} recordEvent={recordEvent} onSaved={refreshListing} />
      )}

      {activeTab === "team" && <TeamTab claimId={claimId} canEdit={canEdit} recordEvent={recordEvent} />}
      {activeTab === "users" && <UsersTab claimId={claimId} isOwner={context.role === "owner"} />}
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

function ListingTab({ claimId, listing, canEdit, recordEvent, onSaved }) {
  const [html, setHtml] = useState(listing?.notes_html || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { setHtml(listing?.notes_html || ""); }, [listing?.notes_html]);

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

  return (
    <div className="admin-card">
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Listing content</p>
      {!canEdit && <EditNotice />}
      {err && <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 13 }}>{msg}</p>}
      <RichTextEditor value={html} onChange={setHtml} editable={canEdit} />
      <Provenance listing={listing} />
      {canEdit && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save listing content"}
          </button>
        </div>
      )}
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

const emptyTeamMember = { name: "", role_title: "", photo_url: "", bio: "", is_visible: true };

function TeamTab({ claimId, canEdit, recordEvent }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyTeamMember);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setMembers(await getClaimTeamMembers(claimId));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Name is required."); return; }
    setErr("");
    try {
      setSaving(true);
      const id = await addClaimTeamMember(claimId, form);
      recordEvent?.("claimed_listing_updated", { claim_id: claimId, changed_fields: ["team_members"], team_member_id: id });
      setForm(emptyTeamMember);
      setAddOpen(false);
      await load();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisible(m) {
    try {
      await updateClaimTeamMember(claimId, m.id, { ...m, is_visible: !m.is_visible });
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function remove(m) {
    try {
      await removeClaimTeamMember(claimId, m.id);
      recordEvent?.("claimed_listing_updated", { claim_id: claimId, changed_fields: ["team_members"], team_member_id: m.id });
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div className="admin-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Team</p>
        {canEdit && (
          <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setAddOpen((v) => !v)}>
            {addOpen ? "Cancel" : "+ Add team member"}
          </button>
        )}
      </div>
      {!canEdit && <EditNotice />}
      {err && <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>}

      {addOpen && canEdit && (
        <form onSubmit={handleAdd} style={{ display: "grid", gap: 8, marginBottom: 12, padding: 12, background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" required style={{ padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 }} />
          <input value={form.role_title} onChange={(e) => setForm((f) => ({ ...f, role_title: e.target.value }))} placeholder="Role / title (optional)" style={{ padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 }} />
          <textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} placeholder="Short bio (optional)" rows={2} style={{ padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13, resize: "vertical" }} />
          <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px", justifySelf: "start" }} disabled={saving}>
            {saving ? "Saving…" : "Add team member"}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ fontSize: 13, opacity: 0.7 }}>Loading…</p>
      ) : members.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>No team members yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {members.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "6px 10px", border: "1px solid var(--lc-border)", borderRadius: 7 }}>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>{m.name}{!m.is_visible ? " (hidden)" : ""}</div>
                {m.role_title && <div style={{ opacity: 0.8 }}>{m.role_title}</div>}
              </div>
              {canEdit && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px" }} onClick={() => toggleVisible(m)}>{m.is_visible ? "Hide" : "Show"}</button>
                  <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px", color: "#b91c1c" }} onClick={() => remove(m)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsersTab({ claimId, isOwner }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

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
      await inviteClaimEditor(claimId, { email, name });
      await sendClaimUserMagicLink(email.trim());
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
                  <td style={{ padding: "8px 0 8px 8px", textAlign: "right" }}>
                    {u.role === "editor" && (
                      <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px", color: "#b91c1c" }} disabled={busy} onClick={() => handleRemove(u.id)}>
                        Remove
                      </button>
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
    </div>
  );
}
