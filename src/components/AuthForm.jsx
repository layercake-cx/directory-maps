import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  authOtpErrorHint,
  checkClientSlugAvailable,
  OTP_REQUEST_TIMEOUT_MS,
  SLUG_RPC_WAIT_MS,
  getEmailAuthRedirectUrl,
  shouldRetrySignUpOtpAsSignIn,
  withTimeout,
} from "../lib/authHelpers";
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

export default function AuthForm({ mode, onSuccess, variant = "default" }) {
  const isSignUp = mode === "signup";
  const isSplitSignup = isSignUp && variant === "split";

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

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
        const cleanCompany = company.trim();
        const orgLabel = cleanCompany || cleanFull;
        const slug = slugify(orgLabel);
        if (!slug) {
          setMsg("Could not generate an organisation URL from your name. Add a company name or use more letters.");
          return;
        }
        const slugCheck = await checkClientSlugAvailable(supabase, slug);
        let slugCheckSkipped = false;
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

        let otpData;
        let error;
        let signInFallback = false;

        ({ data: otpData, error } = await withTimeout(
          supabase.auth.signInWithOtp({
            email: trimmedEmail,
            options: {
              shouldCreateUser: true,
              emailRedirectTo: redirectTo,
              data: {
                signup_org_name: orgLabel,
                signup_org_slug: slug,
                full_name: cleanFull,
                first_name: cleanFirst,
                last_name: cleanLast,
              },
            },
          }),
          OTP_REQUEST_TIMEOUT_MS,
          "Send sign-up email"
        ));
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.debug("[auth] signUp OTP", { email: trimmedEmail, redirectTo, error, otpData, code: error?.code });
        }

        if (error && shouldRetrySignUpOtpAsSignIn(error)) {
          signInFallback = true;
          ({ data: otpData, error } = await withTimeout(
            supabase.auth.signInWithOtp({
              email: trimmedEmail,
              options: {
                shouldCreateUser: false,
                emailRedirectTo: redirectTo,
              },
            }),
            OTP_REQUEST_TIMEOUT_MS,
            "Send sign-in email"
          ));
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug("[auth] signUp→signIn OTP fallback", { email: trimmedEmail, redirectTo, error, otpData, code: error?.code });
          }
        }

        if (error) {
          const redirectHint =
            import.meta.env.DEV && error.message?.toLowerCase().includes("redirect")
              ? ` Allowed redirect must include: ${redirectTo}`
              : "";
          const codeHint = import.meta.env.DEV && error.code ? ` (${error.code})` : "";
          setMsg(error.message + authOtpErrorHint(error) + redirectHint + codeHint);
          return;
        }
        const baseSignUpMsg = slugCheckSkipped
          ? "Check your email for the sign-up link. You must verify your email before your account is active. We could not verify your organisation name in time; if that name is already taken, you will see an error after you confirm your email."
          : "Check your email for the sign-up link. You must verify your email before your account is active.";
        setMsg(
          signInFallback
            ? "An account with this email already exists. We sent a sign-in link instead—check your inbox."
            : baseSignUpMsg
        );
        return;
      }

      const { data: otpData, error } = await withTimeout(
        supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: redirectTo,
          },
        }),
        OTP_REQUEST_TIMEOUT_MS,
        "Send sign-in email"
      );
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug("[auth] login OTP", { email: trimmedEmail, redirectTo, error, otpData });
      }
      if (error) {
        const redirectHint =
          import.meta.env.DEV && error.message?.toLowerCase().includes("redirect")
            ? ` Allowed redirect must include: ${redirectTo}`
            : "";
        const codeHint = import.meta.env.DEV && error.code ? ` (${error.code})` : "";
        setMsg(error.message + authOtpErrorHint(error) + redirectHint + codeHint);
        return;
      }
      setMsg(
        "If an account exists for this email, we sent a sign-in link. " +
          "If nothing arrives, use Sign up first (new emails get no message on Log in for privacy). Check spam."
      );
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
            />
            <label className="auth-float__label" htmlFor="signup-email">
              Email address
            </label>
          </div>
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
            {loading ? "Sending…" : "Continue"}
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
        />
        <button type="submit" className="btn btn-primary auth-form__submit" disabled={loading}>
          {loading ? "Sending..." : "Email me a sign-in link"}
        </button>
      </form>

      {msg ? <p className="auth-form__msg">{msg}</p> : null}
    </div>
  );
}
