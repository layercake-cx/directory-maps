import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  checkClientSlugAvailable,
  SLUG_RPC_WAIT_MS,
  getEmailAuthRedirectUrl,
  withTimeout,
} from "../lib/authHelpers";
import { completeInvitedSignup } from "../lib/inviteHelpers.js";
import { logClientError } from "../lib/errorLogger.js";
import { hasSupabaseConfig } from "../lib/supabase";

function slugify(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * @param {object} props
 * @param {'signup'|'login'} props.mode
 * @param {() => void} [props.onSuccess]
 * @param {(payload: object) => void} [props.onSubmitted]
 * @param {'default'|'split'} [props.variant]
 * @param {{ email: string, clientName: string, role: string, inviteId?: string }} [props.teamInvite] — join existing org (no new org signup)
 */
export default function AuthForm({ mode, onSuccess, onSubmitted, variant = "default", teamInvite = null }) {
  const isSignUp = mode === "signup";
  const isTeamInviteSignup = isSignUp && !!teamInvite;
  const isSplitSignup = isSignUp && variant === "split";

  const [email, setEmail] = useState(teamInvite?.email ?? "");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (teamInvite?.email) setEmail(teamInvite.email);
  }, [teamInvite?.email]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      if (!hasSupabaseConfig) {
        setMsg("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local and restart the dev server.");
        return;
      }

      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setMsg("Email is required.");
        return;
      }

      const redirectTo = getEmailAuthRedirectUrl();

      if (isSignUp) {
        try { await supabase.auth.signOut(); } catch { /* ignore */ }

        if (!acceptedTerms) {
          setMsg("Please accept the terms and privacy notice to continue.");
          return;
        }
        const cleanFirst = firstName.trim();
        const cleanLast = lastName.trim();
        if (!cleanFirst || !cleanLast) {
          setMsg("First name and last name are required.");
          return;
        }
        const cleanFull = `${cleanFirst} ${cleanLast}`.trim();

        if (isTeamInviteSignup) {
          if (trimmedEmail.toLowerCase() !== teamInvite.email.trim().toLowerCase()) {
            setMsg("Use the same email address this invitation was sent to.");
            return;
          }
        }

        let slugCheckSkipped = false;
        let orgLabel = null;
        let slug = null;

        if (!isTeamInviteSignup) {
          const cleanCompany = company.trim();
          orgLabel = cleanCompany || cleanFull;
          slug = slugify(orgLabel);
          if (!slug) {
            setMsg("Could not generate an organisation URL from your name. Add a company name or use more letters.");
            return;
          }
          const slugCheck = await checkClientSlugAvailable(supabase, slug);
          if (slugCheck.status === "taken") {
            setMsg(
              "That name is already in use. Try a different company name, or add your company if you left it blank."
            );
            return;
          }
          if (slugCheck.status === "error") {
            const er = slugCheck.error;
            setMsg(
              (er?.message ?? String(er)) +
                (import.meta.env.DEV && er?.code ? ` (${er.code})` : "") +
                " If the function is missing, apply the is_client_slug_available migration in Supabase."
            );
            return;
          }
          if (slugCheck.status === "skipped") {
            slugCheckSkipped = true;
            logClientError({
              type: "slug_check.skipped",
              severity: "warning",
              message: `is_client_slug_available did not respond within ${SLUG_RPC_WAIT_MS / 1000}s; signup continued (duplicate slug handled after email).`,
              context: { slug, step: "signup" },
            });
          }
        }

        const signUpMetadata = isTeamInviteSignup
          ? {
              full_name: cleanFull,
              first_name: cleanFirst,
              last_name: cleanLast,
            }
          : {
              signup_org_name: orgLabel,
              signup_org_slug: slug,
              full_name: cleanFull,
              first_name: cleanFirst,
              last_name: cleanLast,
            };

        let needsEmailVerification = false;
        if (isTeamInviteSignup) {
          const inviteId = teamInvite?.inviteId ?? "";
          if (!inviteId) {
            setMsg("Invitation id is missing. Ask your team owner for a new invite link.");
            return;
          }
          await withTimeout(
            completeInvitedSignup({
              invitationId: inviteId,
              email: trimmedEmail,
              password,
              firstName: cleanFirst,
              lastName: cleanLast,
            }),
            30000,
            "Create invited account"
          );
          const { error: signInError } = await withTimeout(
            supabase.auth.signInWithPassword({ email: trimmedEmail, password }),
            30000,
            "Sign in"
          );
          if (signInError) {
            const codeHint = import.meta.env.DEV && signInError.code ? ` (${signInError.code})` : "";
            setMsg(signInError.message + codeHint);
            return;
          }
          needsEmailVerification = false;
        } else {
          const { data: signUpData, error } = await withTimeout(
            supabase.auth.signUp({
              email: trimmedEmail,
              password,
              options: {
                emailRedirectTo: redirectTo,
                data: signUpMetadata,
              },
            }),
            30000,
            "Create account"
          );

          if (error) {
            const codeHint = import.meta.env.DEV && error.code ? ` (${error.code})` : "";
            setMsg(error.message + codeHint);
            return;
          }
          needsEmailVerification = !signUpData?.session;
        }

        const slugNotice =
          !isTeamInviteSignup && slugCheckSkipped
            ? "We could not verify your organisation name in time; if that name is already taken, you'll see an error after verification."
            : null;
        const teamNotice = isTeamInviteSignup
          ? `Your account is ready. You can now use ${teamInvite.clientName}.`
          : null;
        setMsg("");
        onSubmitted?.({
          email: trimmedEmail,
          needsEmailVerification,
          notice: teamNotice || slugNotice,
          teamInvite: isTeamInviteSignup,
        });
        if (!needsEmailVerification) {
          onSuccess?.();
        }
        return;
      }

      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        }),
        30000,
        "Sign in"
      );
      if (error) {
        const codeHint = import.meta.env.DEV && error.code ? ` (${error.code})` : "";
        setMsg(error.message + codeHint);
        return;
      }
      setMsg("Signed in.");
      onSuccess?.();
    } catch (e) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  if (isSplitSignup) {
    return (
      <div className="auth-form auth-form--split">
        <form onSubmit={handleSubmit} className="auth-form__form">
          <div className="auth-form__row2">
            <div className="auth-float">
              <input
                id="signup-first"
                className="auth-float__input"
                type="text"
                placeholder=" "
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
              <label className="auth-float__label" htmlFor="signup-first">
                First name
              </label>
            </div>
            <div className="auth-float">
              <input
                id="signup-last"
                className="auth-float__input"
                type="text"
                placeholder=" "
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
              <label className="auth-float__label" htmlFor="signup-last">
                Last name
              </label>
            </div>
          </div>
          <div className="auth-float">
            <input
              id="signup-email"
              className="auth-float__input"
              type="email"
              placeholder=" "
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              readOnly={isTeamInviteSignup}
            />
            <label className="auth-float__label" htmlFor="signup-email">
              Email address
            </label>
          </div>
          <div className="auth-float">
            <input
              id="signup-password"
              className="auth-float__input"
              type="password"
              placeholder=" "
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <label className="auth-float__label" htmlFor="signup-password">
              Password (min 8 characters)
            </label>
          </div>
          {!isTeamInviteSignup ? (
            <div className="auth-float">
              <input
                id="signup-company"
                className="auth-float__input"
                type="text"
                placeholder=" "
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoComplete="organization"
              />
              <label className="auth-float__label" htmlFor="signup-company">
                Company (optional)
              </label>
            </div>
          ) : null}

          <label className="signup-split__terms">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
            />
            <span>
              By continuing, you agree to the <Link to="/terms">Terms and conditions</Link> and the{" "}
              <Link to="/privacy">Privacy Notice</Link>.
            </span>
          </label>

          <button type="submit" className="signup-split__continue" disabled={loading}>
            {loading ? "Creating account..." : isTeamInviteSignup ? "Create account & join team" : "Create account"}
          </button>
        </form>

        {msg ? <p className="auth-form__msg">{msg}</p> : null}
      </div>
    );
  }

  return (
    <div className="auth-form">
      <form onSubmit={handleSubmit} className="auth-form__form">
        <label className="auth-form__label">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="auth-form__input"
          placeholder="you@example.com"
          autoComplete="email"
          readOnly={!!teamInvite}
        />
        <label className="auth-form__label">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="auth-form__input"
          placeholder="Your password"
          autoComplete="current-password"
        />
        <button type="submit" className="btn btn-primary auth-form__submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {msg ? <p className="auth-form__msg">{msg}</p> : null}
    </div>
  );
}
