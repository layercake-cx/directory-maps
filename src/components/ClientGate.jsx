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

    async function run() {
      try {
        setState((s) => ({ ...s, loading: true, error: "" }));

        const { data } = await supabase.auth.getUser();
        const user = data?.user;

        if (!mounted) return;

        if (!user) {
          setState({ loading: false, authed: false, error: "" });
          return;
        }

        // Check whether this newly-logged-in user has a pending invitation.
        // If they don't have a contact record yet, acceptPendingInvitation will
        // create one for them and wire up their map permissions.
        const { data: existingContact } = await supabase
          .from("contacts")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!existingContact && user.email) {
          await acceptPendingInvitation(user.id, user.email);
        }

        if (mounted) {
          setState({ loading: false, authed: true, error: "" });
        }
      } catch (e) {
        if (mounted) {
          setState({
            loading: false,
            authed: false,
            error: e?.message ?? String(e),
          });
        }
      }
    }

    run();
    const { data: sub } = supabase.auth.onAuthStateChange(() => run());

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
