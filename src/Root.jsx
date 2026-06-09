import React, { useEffect, useState } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import App from "./App.jsx";
import SiteHeader from "./components/SiteHeader.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { supabase } from "./lib/supabase";
import { getImpersonatedClientId, stopImpersonatingClient } from "./lib/clientAuth";
import { AuthProvider } from "./context/AuthContext.jsx";
import { isEmbedPath } from "./lib/embedRoutes.js";

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
          window.location.replace("/admin/clients");
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
  const isEmbed = isEmbedPath(location.pathname);
  const isSignUpSplit = location.pathname === "/signup";
  const showSiteHeader = !isAdmin && !isSignUpSplit && !isEmbed;
  const showFooter = !isEmbed && !isSignUpSplit;

  useEffect(() => {
    if (!isEmbed) {
      document.documentElement.classList.remove("embed-map-page");
      document.body.classList.remove("embed-map-page");
      return;
    }
    document.documentElement.classList.add("embed-map-page");
    document.body.classList.add("embed-map-page");
    return () => {
      document.documentElement.classList.remove("embed-map-page");
      document.body.classList.remove("embed-map-page");
    };
  }, [isEmbed]);
  return (
    <div className={`layout-root${isEmbed ? " layout-root--embed" : ""}`}>
      {!isAdmin && !isEmbed && <ImpersonationBar />}
      {showSiteHeader && <SiteHeader />}
      <App />
      {showFooter && <SiteFooter />}
    </div>
  );
}

/**
 * Supabase sends password-recovery and auth-error redirects as query params and/or
 * hash fragments (e.g. ?type=recovery&token_hash=... or #access_token=...&type=recovery).
 * With BrowserRouter the pathname is clean, so we only need to handle:
 *   1. Recovery tokens arriving as query params → redirect to /reset-password
 *   2. Recovery tokens arriving in the hash fragment → redirect to /reset-password
 *   3. Auth errors in query params or hash → redirect to /login?authError=…
 */
function useAuthErrorRedirect() {
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const alreadyOnReset = window.location.pathname.startsWith("/reset-password");

    // 1. Recovery via query params (?type=recovery&token_hash=... or ?code=...)
    if (!alreadyOnReset) {
      const isRecovery =
        query.get("type") === "recovery" ||
        query.has("token") ||
        query.has("token_hash") ||
        query.has("code");
      if (isRecovery) {
        window.history.replaceState(
          null,
          "",
          "/reset-password?" + query.toString()
        );
        return;
      }
    }

    // 2. Recovery via hash fragment (#access_token=...&type=recovery)
    if (!alreadyOnReset) {
      const rawHash = window.location.hash.replace(/^#/, "");
      if (rawHash) {
        const hashParams = new URLSearchParams(rawHash);
        if (hashParams.get("access_token") || hashParams.get("type") === "recovery") {
          window.history.replaceState(
            null,
            "",
            "/reset-password?" + hashParams.toString()
          );
          return;
        }
      }
    }

    // 3. Auth errors
    const errorMsg =
      query.get("error_description") ||
      (() => {
        const raw = window.location.hash.replace(/^#\/?/, "");
        if (raw.startsWith("error=") || raw.includes("error_description=")) {
          const hp = new URLSearchParams(raw);
          return hp.get("error_description") || hp.get("error") || null;
        }
        return null;
      })();

    if (errorMsg) {
      window.history.replaceState(
        null,
        "",
        "/login?authError=" + encodeURIComponent(errorMsg)
      );
      window.location.reload();
    }
  }, []);
}

export default function Root() {
  useAuthErrorRedirect();

  return (
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <Layout />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
