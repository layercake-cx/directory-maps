import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth.js";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");

    if (password.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMsg(error.message);
        return;
      }
      setDone(true);
    } catch (e) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="page-main auth-page">
        <div className="admin-card auth-page__card">
          <h1 className="auth-page__title">Password updated</h1>
          <p className="auth-page__sub">
            Your password has been changed successfully.
          </p>
          <button
            type="button"
            className="btn btn-primary auth-form__submit"
            onClick={() => navigate("/client")}
          >
            Continue to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-main auth-page">
        <div className="admin-card auth-page__card">
          <h1 className="auth-page__title">Reset your password</h1>
          <p className="auth-page__sub">
            This link may have expired or already been used. Request a new one.
          </p>
          <p className="auth-page__footer">
            <Link to="/forgot-password">Request a new reset link</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-main auth-page">
      <div className="admin-card auth-page__card">
        <h1 className="auth-page__title">Set a new password</h1>
        <p className="auth-page__sub">
          Choose a new password for <strong>{user.email}</strong>.
        </p>
        <form onSubmit={handleSubmit} className="auth-form__form">
          <label className="auth-form__label">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="auth-form__input"
            placeholder="Min 8 characters"
            autoComplete="new-password"
          />
          <label className="auth-form__label">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="auth-form__input"
            placeholder="Re-enter password"
            autoComplete="new-password"
          />
          <button
            type="submit"
            className="btn btn-primary auth-form__submit"
            disabled={loading}
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
        {msg ? <p className="auth-form__msg">{msg}</p> : null}
      </div>
    </div>
  );
}
