import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthForm from "../components/AuthForm.jsx";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") || "/client";

  function handleSuccess() {
    const path = (redirect || "/client").replace(/^#/, "");
    navigate(path.startsWith("/") ? path : `/${path}`);
  }

  return (
    <div className="page-main auth-page">
      <div className="admin-card auth-page__card">
        <h1 className="auth-page__title">Log in</h1>
        <p className="auth-page__sub">Sign in to manage your maps and listings.</p>
        <AuthForm mode="login" onSuccess={handleSuccess} />
        <p className="auth-page__footer">
          Don’t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
