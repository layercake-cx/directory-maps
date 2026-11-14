import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ChevronLeftIcon, Pill } from "./ui/index.js";
import "../styles/wave-b/map-pages.css";
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
      statsPath: `${base}/stats`,
      showStats: true,
      isDesign: !rest,
      isData: rest === "data",
      isStats: rest === "stats" || rest.startsWith("stats/"),
    };
  }

  return null;
}

/** Inline variant: renders as siblings inside a navigation bar (kept for callers that pass `linkClassName`). */
function InlineMapEditSubNav({ route, mapName, linkClassName }) {
  const navLinkClass = (active) =>
    [linkClassName, active && linkClassName ? `${linkClassName}--active` : ""].filter(Boolean).join(" ");
  const { hasDraft, publishPanelOpen, openPublishRef, closePublishRef } = useMapDraft();

  return (
    <>
      <span className="mp-subnav-sep" aria-hidden>|</span>
      <span className="mp-subnav-name" title={mapName}>{mapName}</span>
      <Link to={route.designPath} className={navLinkClass(route.isDesign)} onClick={() => closePublishRef.current?.()}>Design</Link>
      <Link to={route.dataPath} className={navLinkClass(route.isData)} onClick={() => closePublishRef.current?.()}>Data</Link>
      {route.showStats ? (
        <Link to={route.statsPath} className={navLinkClass(route.isStats)}>Stats</Link>
      ) : null}
      <button
        type="button"
        onClick={() => openPublishRef.current?.()}
        className="tab"
        aria-current={publishPanelOpen ? "page" : undefined}
      >
        Publish
        {hasDraft ? <Pill tone="warn">Unpublished changes</Pill> : null}
      </button>
    </>
  );
}

/** Standalone variant: its own bar below the page header, using the kit's tab styling. */
function StandaloneMapEditSubNav({ route, mapName, hasDraft, onPublish, isPublishOpen, onLeavePublish, actions }) {
  return (
    <nav className="mp-subnav" aria-label="Map sections">
      <div className={`mp-subnav-inner ${actions ? "mp-subnav-inner--full" : ""}`.trim()}>
        <div className="mp-subnav-left">
          <Link to={route.backPath} className="mp-subnav-back" aria-label={`Back to ${route.backLabel}`}>
            <ChevronLeftIcon size={18} />
          </Link>
          <span className="mp-subnav-name" title={mapName}>{mapName}</span>
        </div>
        <div className="tabs mp-subnav-tabs">
          <Link
            to={route.designPath}
            className="tab"
            aria-current={route.isDesign && !isPublishOpen ? "page" : undefined}
            onClick={onLeavePublish}
          >
            Design
          </Link>
          <Link
            to={route.dataPath}
            className="tab"
            aria-current={route.isData ? "page" : undefined}
            onClick={onLeavePublish}
          >
            Data
          </Link>
          {route.showStats ? (
            <Link
              to={route.statsPath}
              className="tab"
              aria-current={route.isStats ? "page" : undefined}
              onClick={onLeavePublish}
            >
              Stats
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onPublish}
            className="tab"
            aria-current={isPublishOpen ? "page" : undefined}
          >
            Publish Map
            {hasDraft ? <Pill tone="warn">Unpublished changes</Pill> : null}
          </button>
        </div>
        {actions ? <div className="mp-subnav-actions">{actions}</div> : null}
      </div>
    </nav>
  );
}

/** `actions`: optional right-aligned slot (standalone only) — also lets the bar span the full width. */
export default function MapEditSubNav({ linkClassName = "", standalone = false, actions = null }) {
  const { pathname } = useLocation();
  const route = useMemo(() => parseMapEditRoute(pathname || "/"), [pathname]);
  const [mapName, setMapName] = useState("");
  const { hasDraft, publishPanelOpen, openPublishRef, closePublishRef } = useMapDraft();

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
        isPublishOpen={publishPanelOpen}
        onLeavePublish={() => closePublishRef.current?.()}
        actions={actions}
      />
    );
  }

  return <InlineMapEditSubNav route={route} mapName={mapName} linkClassName={linkClassName} />;
}
