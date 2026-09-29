import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { signOut } from "../../lib/auth";
import MapEditSubNav from "../../components/MapEditSubNav.jsx";
import AppShell from "../../components/shell/AppShell.jsx";
import DirectoryFeaturePanel from "../../components/shell/DirectoryFeaturePanel.jsx";
import { ClientProvider } from "../../context/ClientContext.jsx";
import { DirectoryProvider } from "../../context/DirectoryContext.jsx";
import { MapDraftContext } from "../../context/MapDraftContext.js";
import { getClientAndContact } from "../../lib/getClientAndContact.js";
import { useAuth } from "../../hooks/useAuth.js";
import { readHashSearchParams, replaceHashSearchParams } from "../../lib/hashSearchParams.js";
import {
  markPublishPanelOpen,
  clearPublishPanelOpen,
  isPublishPanelOpenInStorage,
} from "../../lib/publishPanelStorage.js";
import "../admin/admin.css";

function isClientMapDesignPath(pathname) {
  return /^\/client\/maps\/[^/]+$/.test(pathname || "");
}

export default function ClientLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname || "/";
  const mapIdFromPath = pathname.match(/^\/client\/maps\/([^/]+)/)?.[1] ?? null;
  const directoryIdMatch = pathname.match(/^\/client\/directories\/([^/]+)/);
  const directoryIdFromPath = directoryIdMatch && directoryIdMatch[1] !== "new" ? directoryIdMatch[1] : null;

  const [hasDraft, setHasDraft] = useState(false);
  const [publishPanelOpen, setPublishPanelOpenState] = useState(false);
  const openPublishRef = useRef(null);
  const closePublishRef = useRef(null);
  const migratedPanelParamRef = useRef(false);
  const restoredPublishRef = useRef(false);
  const lastMapIdRef = useRef(mapIdFromPath);
  const { isAdmin, roleLoading, signupProvisionError, clearSignupProvisionError, provisionVersion } = useAuth();
  const kickedUnlinkedRef = useRef(false);
  const clientLoadedRef = useRef(false);
  const [showVerifiedBanner, setShowVerifiedBanner] = useState(false);

  const isMapDetailRoute = pathname.startsWith("/client/maps/");
  const isMapDesignRoute = isClientMapDesignPath(pathname);

  useEffect(() => {
    if (mapIdFromPath) lastMapIdRef.current = mapIdFromPath;
    restoredPublishRef.current = false;
  }, [mapIdFromPath]);

  const setPublishPanelOpen = useCallback((open) => {
    setPublishPanelOpenState(open);
    const id = mapIdFromPath || lastMapIdRef.current;
    if (!id) return;
    if (open) markPublishPanelOpen(id);
    else clearPublishPanelOpen(id);
  }, [mapIdFromPath]);

  // Close publish when leaving the map design route (Data / Stats / My Maps).
  useEffect(() => {
    if (!isMapDesignRoute) {
      setPublishPanelOpen(false);
    }
  }, [pathname, isMapDesignRoute, setPublishPanelOpen]);

  // Restore publish panel after layout remount (auth refresh, hash cleanup, etc.).
  useEffect(() => {
    if (restoredPublishRef.current || !isMapDesignRoute || !mapIdFromPath) return;
    restoredPublishRef.current = true;
    if (isPublishPanelOpenInStorage(mapIdFromPath)) {
      setPublishPanelOpenState(true);
    }
  }, [isMapDesignRoute, mapIdFromPath]);

  // Legacy ?panel=publish — open publish and strip param without React Router setSearchParams.
  useEffect(() => {
    if (!isMapDetailRoute || migratedPanelParamRef.current) return;
    const params = readHashSearchParams();
    if (params.get("panel") !== "publish") return;
    migratedPanelParamRef.current = true;
    setPublishPanelOpen(true);
    replaceHashSearchParams((p) => {
      p.delete("panel");
    });
  }, [isMapDetailRoute, pathname, setPublishPanelOpen]);

  useEffect(() => {
    const params = readHashSearchParams();
    if (params.get("verified") !== "1") return;
    setShowVerifiedBanner(true);
    replaceHashSearchParams((p) => {
      p.delete("verified");
    });
    const t = setTimeout(() => setShowVerifiedBanner(false), 8000);
    return () => clearTimeout(t);
  }, []);

  const [client, setClient] = useState(null);
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const isBackgroundRefresh = clientLoadedRef.current;
    try {
      if (!isBackgroundRefresh) setLoading(true);
      setErr("");
      const { client: c, contact: ct } = await getClientAndContact();
      setClient(c);
      setContact(ct);
      clientLoadedRef.current = true;
    } catch (e) {
      setErr(e?.message ?? String(e));
      if (!isBackgroundRefresh) {
        setClient(null);
        setContact(null);
        clientLoadedRef.current = false;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, provisionVersion]);

  useEffect(() => {
    if (loading || roleLoading) return;
    if (provisionVersion === 0) return;
    if (isAdmin) return;
    if (client !== null) return;
    if (signupProvisionError) return;
    if (err) return;
    if (kickedUnlinkedRef.current) return;
    kickedUnlinkedRef.current = true;
    signOut()
      .catch(() => {})
      .finally(() => {
        navigate("/login?unlinked=1", { replace: true });
      });
  }, [loading, roleLoading, provisionVersion, isAdmin, client, signupProvisionError, err, navigate]);

  function handleSignOut() {
    signOut().catch(() => {});
  }

  const draftContextValue = useMemo(
    () => ({
      hasDraft,
      setHasDraft,
      publishPanelOpen,
      setPublishPanelOpen,
      openPublishRef,
      closePublishRef,
    }),
    [hasDraft, publishPanelOpen, setPublishPanelOpen],
  );

  let inner = null;

  if ((loading && client === null) || (roleLoading && client === null)) {
    inner = (
      <div className="page-main">
        <p>Loading…</p>
      </div>
    );
  } else if (err && client === null) {
    inner = (
      <div className="page-main">
        <div className="admin-card" style={{ maxWidth: 560 }}>
          <p>{err}</p>
        </div>
      </div>
    );
  } else if (client === null) {
    if (signupProvisionError) {
      inner = (
        <div className="page-main">
          <div className="admin-card" style={{ maxWidth: 560 }}>
            <h2 style={{ marginTop: 0 }}>Could not finish signup</h2>
            <p>{signupProvisionError}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-primary" onClick={() => clearSignupProvisionError()}>
                Dismiss
              </button>
              <button type="button" className="btn" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    } else if (isAdmin) {
      inner = (
        <div className="page-main">
          <div className="admin-card" style={{ maxWidth: 560 }}>
            <h2 style={{ marginTop: 0 }}>Admin account</h2>
            <p>You're signed in as an admin. Client accounts are not created for admin users.</p>
            <p>
              Use the <a href="/admin/clients">Admin area</a> to manage clients and maps, or sign out and sign in with a
              client account to use the client portal.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <a href="/admin/clients" className="btn btn-primary">
                Go to Admin
              </a>
              <button type="button" className="btn" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    } else {
      inner = (
        <div className="page-main">
          <div className="admin-card" style={{ maxWidth: 560 }}>
            <h2 style={{ marginTop: 0 }}>No organisation linked</h2>
            <p>
              Your account is not linked to an organisation yet. Complete email sign-up from the link we sent you, or
              contact support.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <a href="/signup" className="btn btn-primary">
                Sign up with email
              </a>
              <button type="button" className="btn" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    }
  } else {
    const verifiedBanner = showVerifiedBanner && (
      <div
        style={{
          background: "#ecfdf5",
          color: "#065f46",
          padding: "12px 20px",
          fontSize: 14,
          fontWeight: 500,
          textAlign: "center",
          borderBottom: "1px solid #a7f3d0",
        }}
      >
        Email verified successfully — your account is ready to go.
      </div>
    );

    const shellBody = directoryIdFromPath ? (
      <AppShell
        context="client"
        isStaff={isAdmin}
        homeHref="/client"
        orgName={client?.name}
        contact={contact}
        panel={<DirectoryFeaturePanel />}
      >
        {verifiedBanner}
        <Outlet />
      </AppShell>
    ) : (
      <AppShell context="client" isStaff={isAdmin} homeHref="/client" orgName={client?.name} contact={contact}>
        {verifiedBanner}
        {isMapDetailRoute && <MapEditSubNav standalone />}
        {isMapDetailRoute ? <Outlet /> : <div className="page-main"><Outlet /></div>}
      </AppShell>
    );

    inner = (
      <ClientProvider client={client} contact={contact} loading={loading} error={err} refetch={load}>
        {directoryIdFromPath ? (
          <DirectoryProvider directoryId={directoryIdFromPath} client={client} contact={contact}>
            {shellBody}
          </DirectoryProvider>
        ) : (
          shellBody
        )}
      </ClientProvider>
    );
  }

  return <MapDraftContext.Provider value={draftContextValue}>{inner}</MapDraftContext.Provider>;
}
