import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

export default function ClientGate({ children }) {
  const navigate = useNavigate();
  const { initializing, user } = useAuth();

  useEffect(() => {
    if (initializing) return;
    if (!user) {
      const currentHash = typeof window !== "undefined" ? window.location.hash : "";
      const redirect = currentHash || "/client";
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true });
      return;
    }
    if (!user.email_confirmed_at) {
      navigate("/login?needsVerification=1", { replace: true });
    }
  }, [initializing, user, navigate]);

  if (initializing) return <div className="page-main">Loading…</div>;
  if (!user) return null;
  if (!user.email_confirmed_at) return null;
  return children;
}

