import React, { useEffect, useState } from "react";
import { HashRouter, useLocation } from "react-router-dom";
import App from "./App.jsx";
import SiteHeader from "./components/SiteHeader.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { supabase } from "./lib/supabase";
import { getImpersonatedClientId, stopImpersonatingClient } from "./lib/clientAuth";
import { AuthProvider } from "./context/AuthContext.jsx";

function ImpersonationBar() {
  const [clientName, setClientName] = useState("");
  const [active, setActive] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchClient() {
      try {
        const clientId = getImpersonatedClientId();
        if (!clientId) {
          if (mounted) {
            setActive(false);
            setClientName("");
          }
          return;
        }

        const { data, error } = await supabase
          .from("clients")
          .select("name")
          .eq("id", clientId)
          .maybeSingle();

        if (error) throw error;
        if (!mounted) return;
        setClientName(data?.name || "this client");
        setActive(true);
      } catch {
        if (mounted) {
          setActive(false);
          setClientName("");
        }
      }
    }

    fetchClient();
    const { data: sub } = supabase.auth.onAuthStateChange(() => fetchClient());

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (!active) return null;

  return (
    <div
      style={{
        width: "100%",
        background: "crimson",
        color: "#fff",
        padding: "6px 16px",
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxSizing: "border-box",
      }}
    >
      <span>
        You are impersonating <strong>{clientName}</strong>.
      </span>
      <button
        type="button"
        className="btn"
        style={{
          background: "#fff",
          color: "crimson",
          borderColor: "#fff",
          padding: "4px 10px",
          fontSize: 13,
        }}
        onClick={() => {
          stopImpersonatingClient();
          window.location.replace("#/admin/clients");
        }}
      >
        Stop impersonating
      </button>
    </div>
  );
}

function Layout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const isEmbed = location.pathname === "/embed";
  const isSignUpSplit = location.pathname === "/signup";
  const showSiteHeader = !isAdmin && !isSignUpSplit && !isEmbed;
  const showFooter = !isEmbed && !isSignUpSplit;
  return (
    <div className={`layout-root${isEmbed ? " layout-root--embed" : ""}`}>
      {!isAdmin && <ImpersonationBar />}
      {showSiteHeader && <SiteHeader />}
      <App />
      {showFooter && <SiteFooter />}
    </div>
  );
}

/**
 * Supabase redirects with auth errors as both query params and hash fragments, e.g.
 * ?error=access_denied&error_description=...#error=access_denied&...
 * HashRouter can't route a hash that doesn't start with #/ — the page goes blank.
 * Detect these early, clean the URL, and redirect to /login with the message.
 */
function useAuthErrorRedirect() {
  useEffect(() => {
    function extractAuthError() {
      const qs = new URLSearchParams(window.location.search);
      if (qs.get("error_description")) return qs.get("error_description");

      const raw = window.location.hash.replace(/^#\/?/, "");
      if (raw.startsWith("error=") || raw.includes("error_description=")) {
        const hp = new URLSearchParams(raw);
        return hp.get("error_description") || hp.get("error") || null;
      }
      return null;
    }

    const msg = extractAuthError();
    if (msg) {
      const clean = window.location.origin + window.location.pathname;
      window.history.replaceState(null, "", clean + "#/login?authError=" + encodeURIComponent(msg));
      window.location.reload();
    }
  }, []);
}

export default function Root() {
  useAuthErrorRedirect();

  return (
    <React.StrictMode>
      <ErrorBoundary>
        <HashRouter>
          <AuthProvider>
            <Layout />
          </AuthProvider>
        </HashRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
