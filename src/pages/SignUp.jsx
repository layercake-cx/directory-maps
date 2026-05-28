import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import BrandLogo from "../components/BrandLogo.jsx";
import AuthForm from "../components/AuthForm.jsx";
import { fetchTeamInvitationPreview } from "../lib/inviteHelpers.js";
import "./auth-signup-split.css";

function CheckIcon() {
  return (
    <svg className="signup-split__check" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="currentColor" />
      <path
        d="M6 10.2l2.4 2.2L14 7"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SuccessBadge() {
  return (
    <div className="signup-success__badge" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="24" fill="currentColor" />
        <path
          d="M14 24.5l6.5 6.5L34 17.5"
          stroke="#fff"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function MailIcon() {
  return (
    <svg className="signup-success__tip-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3.5 5.5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="m3.5 6.5 6.5 5 6.5-5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ROLE_LABELS = { owner: "Owner", manager: "Manager", member: "Member" };

function SignUpSuccess({ email, notice, needsEmailVerification, onReset, teamInvite }) {
  const title = needsEmailVerification
    ? "Check your email to finish signing up"
    : teamInvite
      ? "You're all set—log in to join the team"
      : "You're all set—welcome aboard";

  return (
    <div className="signup-success" role="status" aria-live="polite">
      <SuccessBadge />
      <p className="signup-success__eyebrow">Account created</p>
      <h1 className="signup-success__title">{title}</h1>
      {needsEmailVerification ? (
        <>
          <p className="signup-success__body">
            We&rsquo;ve sent a verification link to
            <br />
            <strong className="signup-success__email">{email}</strong>
          </p>
          <p className="signup-success__body signup-success__body--muted">
            {teamInvite
              ? "Click the link in that email to confirm your address, then log in to join your team."
              : "Click the link in that email to confirm your address, then come back and log in to start building your map."}
          </p>

          <div className="signup-success__tip">
            <MailIcon />
            <p className="signup-success__tip-text">
              Didn&rsquo;t get it? Check spam, or wait a minute and try again.
            </p>
          </div>
        </>
      ) : (
        <p className="signup-success__body">
          {teamInvite ? (
            <>
              Log in with <strong>{email}</strong> to open the client portal.
            </>
          ) : (
            <>You can log in now with <strong>{email}</strong>.</>
          )}
        </p>
      )}
      {notice ? <p className="signup-success__body signup-success__body--muted">{notice}</p> : null}
      <div className="signup-success__actions">
        <Link to="/login" className="signup-split__continue" style={{ textAlign: "center", textDecoration: "none" }}>
          Go to log in
        </Link>
        <button type="button" className="signup-success__secondary" onClick={onReset}>
          Use a different email
        </button>
      </div>
    </div>
  );
}

export default function SignUp() {
  const [searchParams] = useSearchParams();
  const inviteId = searchParams.get("invite");
  const [submitted, setSubmitted] = useState(null);
  const [invitePreview, setInvitePreview] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(!!inviteId);
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    if (!inviteId) {
      setInvitePreview(null);
      setInviteLoading(false);
      setInviteError("");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setInviteLoading(true);
        setInviteError("");
        const row = await fetchTeamInvitationPreview(inviteId);
        if (cancelled) return;
        if (!row) {
          setInviteError("This invitation is invalid or has expired. Ask your team owner for a new link.");
          setInvitePreview(null);
        } else {
          setInvitePreview(row);
        }
      } catch (e) {
        if (!cancelled) {
          setInviteError(e?.message ?? String(e));
          setInvitePreview(null);
        }
      } finally {
        if (!cancelled) setInviteLoading(false);
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
          inviteId,
      }
    : null;

  const roleLabel = teamInvite ? ROLE_LABELS[teamInvite.role] ?? teamInvite.role : null;

  return (
    <div className="signup-split">
      <div className="signup-split__left">
        <div>
          <div className="signup-split__logo">
            <BrandLogo to="/" />
          </div>
          {teamInvite ? (
            <>
              <h1 className="signup-split__headline">
                Join <strong>{teamInvite.clientName}</strong> on Directory Maps
              </h1>
              <p className="signup-split__footnote" style={{ fontSize: 15, opacity: 0.9, marginBottom: 20 }}>
                You&rsquo;ve been invited as a <strong>{roleLabel}</strong>. Create a password for{" "}
                <strong>{teamInvite.email}</strong>, verify your email, then log in.
              </p>
            </>
          ) : (
            <>
              <h1 className="signup-split__headline">
                Start your free account and put your directory on the map—no credit card required.
              </h1>
              <ul className="signup-split__list">
                <li>
                  <CheckIcon />
                  <span>Build interactive maps with listings, pins, and your branding</span>
                </li>
                <li>
                  <CheckIcon />
                  <span>Sync data from spreadsheets and keep everything in one place</span>
                </li>
                <li>
                  <CheckIcon />
                  <span>Embed maps on your site and share with your team</span>
                </li>
              </ul>
              <h2 className="signup-split__subhead">Get set up in minutes</h2>
              <ul className="signup-split__list">
                <li>
                  <CheckIcon />
                  <span>Create your password and verify your email</span>
                </li>
                <li>
                  <CheckIcon />
                  <span>Create your first map and add locations</span>
                </li>
                <li>
                  <CheckIcon />
                  <span>Publish and embed when you’re ready</span>
                </li>
              </ul>
            </>
          )}
        </div>
        {!teamInvite ? (
          <p className="signup-split__footnote">
            Free tier limits may apply. Features and usage are subject to change—see Terms for details.
          </p>
        ) : null}
      </div>

      <div className="signup-split__right">
        <div className={`signup-split__card${submitted ? " signup-split__card--success" : ""}`}>
          {inviteLoading ? (
            <p>Loading invitation…</p>
          ) : inviteError ? (
            <div>
              <h1 className="signup-split__cardTitle">Invitation not found</h1>
              <p className="signup-split__cardSub">{inviteError}</p>
              <p className="signup-split__footer" style={{ marginTop: 16 }}>
                <Link to="/signup">Create a new organisation</Link>
                {" · "}
                <Link to="/login">Log in</Link>
              </p>
            </div>
          ) : submitted ? (
            <SignUpSuccess
              email={submitted.email}
              notice={submitted.notice}
              needsEmailVerification={submitted.needsEmailVerification}
              teamInvite={submitted.teamInvite}
              onReset={() => setSubmitted(null)}
            />
          ) : (
            <>
              <h1 className="signup-split__cardTitle">
                {teamInvite ? `Join ${teamInvite.clientName}` : "Sign up for free"}
              </h1>
              <p className="signup-split__cardSub">
                {teamInvite
                  ? "Create your account with email and password to join your team."
                  : "Create your Layercake Maps account with email and password. We will email a verification link before first login."}
              </p>
              {teamInvite ? (
                <p
                  className="auth-page__sub"
                  style={{
                    background: "rgba(59, 130, 246, 0.12)",
                    padding: "12px 14px",
                    borderRadius: 8,
                    marginBottom: 16,
                    fontSize: 14,
                  }}
                >
                  Already have an account?{" "}
                  <Link to={`/login?invite=${inviteId}`}>Log in</Link> with {teamInvite.email} instead.
                </p>
              ) : null}
              <AuthForm
                mode="signup"
                variant="split"
                teamInvite={teamInvite}
                onSubmitted={({ email, needsEmailVerification, notice, teamInvite: isTeam }) =>
                  setSubmitted({
                    email,
                    needsEmailVerification,
                    teamInvite: isTeam,
                    notice:
                      notice ||
                      (needsEmailVerification
                        ? null
                        : isTeam
                          ? "Log in to join your team."
                          : "Your email is already verified—you can log in now."),
                  })
                }
              />
              <p className="signup-split__footer">
                {teamInvite ? (
                  <>
                    Already have an account? <Link to={`/login?invite=${inviteId}`}>Log in</Link>
                  </>
                ) : (
                  <>
                    Already have an account? <Link to="/login">Log in</Link>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
