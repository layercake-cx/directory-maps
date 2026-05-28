import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthForm from "../components/AuthForm.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { fetchTeamInvitationPreview } from "../lib/inviteHelpers.js";

const ROLE_LABELS = { owner: "Owner", manager: "Manager", member: "Member" };

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteId = searchParams.get("invite");
  const redirect = searchParams.get("redirect") || "/client";
  const showUnlinkedBanner = searchParams.get("unlinked") === "1";
  const authError = searchParams.get("authError");
  const { user } = useAuth();
  const showVerifyBanner =
    searchParams.get("needsVerification") === "1" || !!(user && !user.email_confirmed_at);

  const [invitePreview, setInvitePreview] = useState(null);
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    if (!inviteId) {
      setInvitePreview(null);
      setInviteError("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchTeamInvitationPreview(inviteId);
        if (cancelled) return;
        if (!row) setInviteError("This invitation is invalid or has expired.");
        else setInvitePreview(row);
      } catch (e) {
        if (!cancelled) setInviteError(e?.message ?? String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  const teamInvite = invitePreview
    ? {
        email: invitePreview.email,
        clientName: invitePreview.client_name,
        role: invitePreview.role,
      }
    : null;

  function handleSuccess() {
    const path = (redirect || "/client").replace(/^#/, "");
    navigate(path.startsWith("/") ? path : `/${path}`);
  }

  return (
    <div className="page-main auth-page">
      <div className="admin-card auth-page__card">
        <h1 className="auth-page__title">{teamInvite ? `Join ${teamInvite.clientName}` : "Log in"}</h1>
        <p className="auth-page__sub">
          {teamInvite
            ? `Sign in as ${teamInvite.email} (${ROLE_LABELS[teamInvite.role] ?? teamInvite.role}) to accept your team invitation.`
            : "Sign in to manage your maps and listings."}
        </p>
        {inviteError ? (
          <p
            className="auth-page__sub"
            style={{ background: "rgba(185, 28, 28, 0.12)", padding: "12px 14px", borderRadius: 8, marginBottom: 16 }}
          >
            {inviteError}
          </p>
        ) : null}
        {teamInvite && inviteId ? (
          <p
            className="auth-page__sub"
            style={{ background: "rgba(59, 130, 246, 0.12)", padding: "12px 14px", borderRadius: 8, marginBottom: 16 }}
          >
            New here?{" "}
            <Link to={`/signup?invite=${inviteId}`}>Create an account</Link> with {teamInvite.email}.
          </p>
        ) : null}
        {showVerifyBanner ? (
          <p
            className="auth-page__sub"
            style={{ background: "rgba(59, 130, 246, 0.12)", padding: "12px 14px", borderRadius: 8, marginBottom: 16 }}
          >
            Verify your email address to use the client portal. Check your inbox for the verification email, then sign in
            with your email and password.
          </p>
        ) : null}
        {authError ? (
          <p
            className="auth-page__sub"
            style={{ background: "rgba(185, 28, 28, 0.12)", padding: "12px 14px", borderRadius: 8, marginBottom: 16 }}
          >
            {authError.includes("expired")
              ? "This link has expired. Please request a new one, or log in if you've already verified."
              : authError}
          </p>
        ) : null}
        {showUnlinkedBanner ? (
          <p
            className="auth-page__sub"
            style={{ background: "rgba(185, 28, 28, 0.12)", padding: "12px 14px", borderRadius: 8, marginBottom: 16 }}
          >
            This account is not linked to an organisation yet. Ask an admin to invite you, or complete signup with a
            linked organisation account.
          </p>
        ) : null}
        <AuthForm mode="login" onSuccess={handleSuccess} teamInvite={teamInvite} />
        <p className="auth-page__footer" style={{ marginBottom: 8 }}>
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
        <p className="auth-page__footer" style={{ marginTop: 0 }}>
          Don&rsquo;t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
