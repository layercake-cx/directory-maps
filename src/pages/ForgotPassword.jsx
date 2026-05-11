import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { hasSupabaseConfig } from "../lib/supabase";
import { getPasswordResetRedirectUrl, withTimeout } from "../lib/authHelpers";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      if (!hasSupabaseConfig) {
        setMsg("Supabase is not configured.");
        return;
      }

      const trimmed = email.trim();
      if (!trimmed) {
        setMsg("Email is required.");
        return;
      }

      const redirectTo = getPasswordResetRedirectUrl();

      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(trimmed, { redirectTo }),
        30000,
        "Password reset"
      );

      if (error) {
        setMsg(error.message);
        return;
      }

      setSent(true);
    } catch (e) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="page-main auth-page">
        <div className="admin-card auth-page__card">
          <h1 className="auth-page__title">Check your email</h1>
          <p className="auth-page__sub">
            If an account exists for <strong>{email.trim()}</strong>, we've sent a password reset link.
            Check your inbox and spam folder.
          </p>
          <p className="auth-page__footer">
            <Link to="/login">Back to log in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-main auth-page">
      <div className="admin-card auth-page__card">
        <h1 className="auth-page__title">Forgot your password?</h1>
        <p className="auth-page__sub">
          Enter your email address and we'll send you a link to reset your password.
        </p>
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
          <button
            type="submit"
            className="btn btn-primary auth-form__submit"
            disabled={loading}
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
        {msg ? <p className="auth-form__msg">{msg}</p> : null}
        <p className="auth-page__footer">
          Remember your password? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
