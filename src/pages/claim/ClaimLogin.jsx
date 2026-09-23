import React, { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth.js";
import { getMyClaimContext, linkClaimUserByEmail, sendClaimUserMagicLink } from "../../lib/claims.js";

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
 * Claim-user sign-in — magic link only, entirely separate from the
 * password-based admin/client-portal auth. Phase 3 of the Claimed
 * Directory Listings epic proves this mechanic end-to-end (send link ->
 * establish session -> link claim_users.user_id -> read own claims); the
 * restricted Listing Manager UI that replaces the placeholder list below
 * is Phase 4.
 */
export default function ClaimLogin() {
  const { user, initializing } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const [linking, setLinking] = useState(true);
  const [claims, setClaims] = useState([]);

  useEffect(() => {
    if (initializing) return;
    if (!user) {
      setLinking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await linkClaimUserByEmail();
        const rows = await getMyClaimContext();
        if (!cancelled) setClaims(rows);
      } catch (e) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLinking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initializing, user]);

  async function handleRequestLink(e) {
    e.preventDefault();
    setErr("");
    try {
      setSending(true);
      await sendClaimUserMagicLink(email.trim());
      setSent(true);
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSending(false);
    }
  }

  if (initializing || linking) {
    return (
      <div className="page-main auth-page">
        <div className="admin-card auth-page__card">
          <p style={{ margin: 0 }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-main auth-page">
        <div className="admin-card auth-page__card">
          <h1 className="auth-page__title">Manage your listing</h1>
          <p className="auth-page__sub">
            Enter the email your listing claim was set up with. We&rsquo;ll send you a sign-in link — no password needed.
          </p>
          {sent ? (
            <p className="auth-form__msg">Check your email for a sign-in link.</p>
          ) : (
            <form onSubmit={handleRequestLink} className="auth-form__form">
              <label className="auth-form__label">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-form__input"
                placeholder="you@yourorganisation.com"
                autoComplete="email"
              />
              <button type="submit" className="btn btn-primary auth-form__submit" disabled={sending}>
                {sending ? "Sending…" : "Send sign-in link"}
              </button>
            </form>
          )}
          {err ? <p className="auth-form__msg" style={{ color: "#b91c1c" }}>{err}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="page-main auth-page">
      <div className="admin-card auth-page__card">
        <h1 className="auth-page__title">Signed in</h1>
        <p className="auth-page__sub">Signed in as <strong>{user.email}</strong>.</p>
        {claims.length === 0 ? (
          <p style={{ fontSize: 13 }}>
            No claimed listings are linked to this email yet. If you were expecting one, ask the directory to send (or resend) your invitation.
          </p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: 13 }}>
            {claims.map((c) => (
              <li key={c.claim_id}>
                <strong>{c.entry_name}</strong> — {c.role} ({STATUS_LABELS[c.claim_status] ?? c.claim_status})
              </li>
            ))}
          </ul>
        )}
        <p style={{ opacity: 0.7, fontSize: 13, margin: 0 }}>The full listing manager is coming soon.</p>
        {err ? <p className="auth-form__msg" style={{ color: "#b91c1c" }}>{err}</p> : null}
      </div>
    </div>
  );
}
