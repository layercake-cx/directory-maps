import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthForm from "../components/AuthForm.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") || "/client";
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
            Verify your email address to use the client portal. Check your inbox for the link or code we sent you, or
            request a new sign-in link below.
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
