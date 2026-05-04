import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, useLocation } from "react-router-dom";
import App from "./App.jsx";
import SiteHeader from "./components/SiteHeader.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { supabase } from "./lib/supabase";
import { getImpersonatedClientId, stopImpersonatingClient } from "./lib/clientAuth";
import "./style.css";

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
  const isClientMapArea = location.pathname.startsWith("/client/maps/");
  const isEmbed = location.pathname === "/embed";
  const showSiteHeader = !isAdmin && !isClientMapArea;
  const showFooter = !isEmbed;
  return (
    <div className="layout-root">
      {!isAdmin && <ImpersonationBar />}
      {showSiteHeader && <SiteHeader />}
      <App />
      {showFooter && <SiteFooter />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <Layout />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);