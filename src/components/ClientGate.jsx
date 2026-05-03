import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { acceptPendingInvitation } from "../lib/inviteHelpers";

export default function ClientGate({ children }) {
  const navigate = useNavigate();
  const [state, setState] = useState({
    loading: true,
    authed: false,
    error: "",
  });

  useEffect(() => {
    let mounted = true;

    async function checkAuth(event) {
      try {
        setState((s) => ({ ...s, loading: true, error: "" }));

        const { data } = await supabase.auth.getUser();
        const user = data?.user;

        if (!mounted) return;

        if (!user) {
          setState({ loading: false, authed: false, error: "" });
          return;
        }

        // Only attempt invitation acceptance on a genuine new sign-in, not on
        // token refreshes or session restores — avoids redundant DB queries.
        if (event === "SIGNED_IN" && user.email) {
          const { data: existingContact } = await supabase
            .from("contacts")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();

          if (!existingContact) {
            await acceptPendingInvitation(user.id, user.email);
          }
        }

        if (mounted) {
          setState({ loading: false, authed: true, error: "" });
        }
      } catch (e) {
        if (mounted) {
          setState({ loading: false, authed: false, error: e?.message ?? String(e) });
        }
      }
    }

    // Initial check — pass null so invitation acceptance is skipped on load.
    checkAuth(null);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => checkAuth(event));

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (state.loading) return <div className="page-main">Loading…</div>;

  if (!state.authed) {
    const currentHash = typeof window !== "undefined" ? window.location.hash : "";
    const redirect = currentHash || "/client";
    navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true });
    return null;
  }

  return children;
}
