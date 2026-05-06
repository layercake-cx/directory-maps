import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthForm from "../components/AuthForm.jsx";
import { useAuth } from "../hooks/useAuth.js";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") || "/client";
  const showUnlinkedBanner = searchParams.get("unlinked") === "1";
  const { user } = useAuth();
  const showVerifyBanner =
    searchParams.get("needsVerification") === "1" || !!(user && !user.email_confirmed_at);

  function handleSuccess() {
    const path = (redirect || "/client").replace(/^#/, "");
    navigate(path.startsWith("/") ? path : `/${path}`);
  }

  return (
    <div className="page-main auth-page">
      <div className="admin-card auth-page__card">
        <h1 className="auth-page__title">Log in</h1>
        <p className="auth-page__sub">Sign in to manage your maps and listings.</p>
        {showVerifyBanner ? (
          <p
            className="auth-page__sub"
            style={{ background: "rgba(59, 130, 246, 0.12)", padding: "12px 14px", borderRadius: 8, marginBottom: 16 }}
          >
            Verify your email address to use the client portal. Check your inbox for the verification email, then sign in
            with your email and password.
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
        <AuthForm mode="login" onSuccess={handleSuccess} />
        <p className="auth-page__footer">
          Don’t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
