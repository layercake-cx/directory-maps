import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { getMyClaimContext, sendClaimUserMagicLink } from "../../lib/claims.js";
import { getClaimedListing, getClaimTeamMembers, getClaimUsers, inviteClaimEditor, removeClaimUser } from "../../lib/claimManager.js";
import MapDataTabs from "../../components/MapDataTabs.jsx";

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

const ROW = { display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--lc-border)", fontSize: 13 };

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

  useEffect(() => {
    if (initializing || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await getMyClaimContext();
        const match = rows.find((r) => r.claim_id === claimId) ?? null;
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
  }, [initializing, user, claimId]);

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
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" type="button" disabled title="Coming soon">Preview</button>
          <button className="btn btn-primary" type="button" disabled title="Coming soon">Publish</button>
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
        <div className="admin-card">
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Listing content</p>
          <p style={{ margin: "0 0 12px", fontSize: 12, opacity: 0.65 }}>Editing opens in a future update. This is what&rsquo;s published today.</p>
          {listing?.notes_html ? (
            // eslint-disable-next-line react/no-danger
            <div style={{ fontSize: 13, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: listing.notes_html }} />
          ) : (
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>No content yet.</p>
          )}
          {listing && (
            <p style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>
              Source: {listing.content_managed_by === "claimed_org" ? "Claimed organisation" : "Platform"}
              {listing.content_last_edited_at ? ` · Last edited ${new Date(listing.content_last_edited_at).toLocaleDateString()}` : ""}
            </p>
          )}
        </div>
      )}

      {activeTab === "seo" && (
        <div className="admin-card">
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600 }}>SEO (read-only for now)</p>
          <div style={ROW}><strong>Page title</strong><span>{listing?.meta_title || "—"}</span></div>
          <div style={ROW}><strong>Meta description</strong><span>{listing?.meta_description || "—"}</span></div>
        </div>
      )}

      {activeTab === "contact" && (
        <div className="admin-card">
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600 }}>Contact details (read-only for now)</p>
          <div style={ROW}><strong>Website</strong><span>{listing?.website_url || "—"}</span></div>
          <div style={ROW}><strong>Email</strong><span>{listing?.email || "—"}</span></div>
          <div style={ROW}><strong>Phone</strong><span>{listing?.phone || "—"}</span></div>
          <div style={ROW}><strong>Address</strong><span>{[listing?.address, listing?.city, listing?.postcode, listing?.country].filter(Boolean).join(", ") || "—"}</span></div>
        </div>
      )}

      {activeTab === "team" && <TeamTab claimId={claimId} />}
      {activeTab === "users" && <UsersTab claimId={claimId} isOwner={context.role === "owner"} />}
    </div>
  );
}

function TeamTab({ claimId }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getClaimTeamMembers(claimId);
        if (!cancelled) setMembers(rows);
      } catch (e) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claimId]);

  return (
    <div className="admin-card">
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Team (read-only for now)</p>
      <p style={{ margin: "0 0 12px", fontSize: 12, opacity: 0.65 }}>People shown publicly on your listing. Adding or editing opens in a future update.</p>
      {err && <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>}
      {loading ? (
        <p style={{ fontSize: 13, opacity: 0.7 }}>Loading…</p>
      ) : members.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>No team members yet.</p>
      ) : (
        <ul style={{ paddingLeft: 18, fontSize: 13 }}>
          {members.map((m) => (
            <li key={m.id}>{m.name}{m.role_title ? ` — ${m.role_title}` : ""}{!m.is_visible ? " (hidden)" : ""}</li>
          ))}
        </ul>
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
