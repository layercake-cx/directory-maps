import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

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
        } else {
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

