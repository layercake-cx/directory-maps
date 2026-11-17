import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { supabase } from "../lib/supabase";
import { isMyClientArchived } from "../lib/archive.js";

export default function ClientGate({ children }) {
  const navigate = useNavigate();
  const { initializing, user } = useAuth();
  // null = not checked yet. An archived customer's users are signed out and sent to the login page.
  const [archiveChecked, setArchiveChecked] = useState(false);

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

  useEffect(() => {
    if (initializing || !user?.email_confirmed_at) return undefined;
    let cancelled = false;
    setArchiveChecked(false);
    isMyClientArchived().then(async (archived) => {
      if (cancelled) return;
      if (archived) {
        await supabase.auth.signOut();
        navigate("/login?archived=1", { replace: true });
        return;
      }
      setArchiveChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initializing, user?.id, user?.email_confirmed_at, navigate]);

  if (initializing) return <div className="page-main">Loading…</div>;
  if (!user) return null;
  if (!user.email_confirmed_at) return null;
  if (!archiveChecked) return <div className="page-main">Loading…</div>;
  return children;
}
