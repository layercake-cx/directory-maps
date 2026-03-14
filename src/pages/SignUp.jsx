import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthForm from "../components/AuthForm.jsx";

export default function SignUp() {
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
        <h1 className="auth-page__title">Sign up</h1>
        <p className="auth-page__sub">Create an account to build and manage your directory maps.</p>
        <AuthForm mode="signup" onSuccess={handleSuccess} />
        <p className="auth-page__footer">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
