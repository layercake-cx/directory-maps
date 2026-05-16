import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import styles from "./MapEditSubNav.module.css";

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

export default function MapEditSubNav({ linkClassName = "" }) {
  const { pathname } = useLocation();
  const route = useMemo(() => parseMapEditRoute(pathname || "/"), [pathname]);
  const [mapName, setMapName] = useState("");

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
    return () => {
      cancelled = true;
    };
  }, [route?.mapId]);

  if (!route) return null;

  const navLinkClass = (active) =>
    [linkClassName, active && linkClassName ? `${linkClassName}--active` : ""].filter(Boolean).join(" ");

  return (
    <>
      <span className={styles.divider} aria-hidden>
        |
      </span>
      <span className={styles.mapName} title={mapName}>
        {mapName}
      </span>
      <Link to={route.designPath} className={navLinkClass(route.isDesign)}>
        Design
      </Link>
      <Link to={route.dataPath} className={navLinkClass(route.isData)}>
        Data
      </Link>
      {route.showStats ? (
        <Link to={route.statsPath} className={navLinkClass(route.isStats)}>
          Stats
        </Link>
      ) : null}
    </>
  );
}
