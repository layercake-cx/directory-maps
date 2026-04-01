import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ClientGate({ children }) {
  const navigate = useNavigate();
  const { initializing, user } = useAuth();

  useEffect(() => {
    if (initializing) return;
    if (user) return;

    const currentHash = typeof window !== "undefined" ? window.location.hash : "";
    const redirect = currentHash || "/client";
    navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true });
  }, [initializing, user, navigate]);

  if (initializing) return <div className="page-main">Loading…</div>;
  if (!user) return null;
  return children;
}

