import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import styles from "./MapEditSubNav.module.css";
import { useMapDraft } from "../context/MapDraftContext.js";

function parseMapEditRoute(pathname) {
  const client = pathname.match(/^\/client\/maps\/([^/]+)(?:\/(.*))?$/);
  if (client) {
    const mapId = decodeURIComponent(client[1]);
    const rest = client[2] || "";
    const base = `/client/maps/${encodeURIComponent(mapId)}`;
    return {
      variant: "client",
      mapId,
      clientId: null,
      backPath: "/client",
      backLabel: "My Maps",
      designPath: base,
      dataPath: `${base}/data`,
      statsPath: `${base}/stats`,
      showStats: true,
      isDesign: !rest,
      isData: rest === "data",
      isStats: rest === "stats" || rest.startsWith("stats/"),
    };
  }

  const admin = pathname.match(/^\/admin\/clients\/([^/]+)\/maps\/([^/]+)(?:\/(.*))?$/);
  if (admin) {
    const clientId = decodeURIComponent(admin[1]);
    const mapId = decodeURIComponent(admin[2]);
    const rest = admin[3] || "";
    const base = `/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}`;
    return {
      variant: "admin",
      mapId,
      clientId,
      backPath: `/admin/clients/${encodeURIComponent(clientId)}`,
      backLabel: "Client",
      designPath: base,
      dataPath: `${base}/data`,
      statsPath: null,
      showStats: false,
      isDesign: !rest,
      isData: rest === "data",
      isStats: false,
    };
  }

  return null;
}

/** Inline variant — used by AdminLayout, renders as siblings inside the primary nav bar */
function InlineMapEditSubNav({ route, mapName, linkClassName }) {
  const navLinkClass = (active) =>
    [linkClassName, active && linkClassName ? `${linkClassName}--active` : ""].filter(Boolean).join(" ");

  return (
    <>
      <span className={styles.divider} aria-hidden>|</span>
      <span className={styles.mapName} title={mapName}>{mapName}</span>
      <Link to={route.designPath} className={navLinkClass(route.isDesign)}>Design</Link>
      <Link to={route.dataPath} className={navLinkClass(route.isData)}>Data</Link>
      {route.showStats ? (
        <Link to={route.statsPath} className={navLinkClass(route.isStats)}>Stats</Link>
      ) : null}
    </>
  );
}

/** Standalone variant — renders as its own bar below the primary nav */
function StandaloneMapEditSubNav({ route, mapName, hasDraft, onPublish, isPublishOpen }) {
  return (
    <nav className={styles.subNav} aria-label="Map sections">
      <div className={styles.subNavInner}>
        <div className={styles.subNavLeft}>
          <Link to={route.backPath} className={styles.backLink} aria-label={`Back to ${route.backLabel}`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <span className={styles.subNavMapName} title={mapName}>{mapName}</span>
        </div>
        <div className={styles.subNavTabs}>
          <Link
            to={route.designPath}
            className={`${styles.subNavTab} ${route.isDesign && !isPublishOpen ? styles.subNavTabActive : ""}`}
          >
            Design
          </Link>
          <Link
            to={route.dataPath}
            className={`${styles.subNavTab} ${route.isData ? styles.subNavTabActive : ""}`}
          >
            Data
          </Link>
          {route.showStats ? (
            <Link
              to={route.statsPath}
              className={`${styles.subNavTab} ${route.isStats ? styles.subNavTabActive : ""}`}
            >
              Stats
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onPublish}
            className={`${styles.subNavTab} ${styles.subNavTabPublish} ${isPublishOpen ? styles.subNavTabActive : ""} ${hasDraft ? styles.subNavTabDraft : ""}`}
          >
            Publish Map
          </button>
        </div>
      </div>
    </nav>
  );
}

export default function MapEditSubNav({ linkClassName = "", standalone = false }) {
  const { pathname } = useLocation();
  const route = useMemo(() => parseMapEditRoute(pathname || "/"), [pathname]);
  const [mapName, setMapName] = useState("");
  const { hasDraft, openPublishRef } = useMapDraft();

  useEffect(() => {
    if (!route?.mapId) {
      setMapName("");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("maps").select("name").eq("id", route.mapId).maybeSingle();
      if (!cancelled) setMapName(data?.name?.trim() || "Map");
    })();
    return () => { cancelled = true; };
  }, [route?.mapId]);

  if (!route) return null;

  if (standalone) {
    return (
      <StandaloneMapEditSubNav
        route={route}
        mapName={mapName}
        hasDraft={hasDraft}
        onPublish={() => openPublishRef.current?.()}
        isPublishOpen={false}
      />
    );
  }

  return <InlineMapEditSubNav route={route} mapName={mapName} linkClassName={linkClassName} />;
}
