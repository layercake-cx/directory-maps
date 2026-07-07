import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import EmbedMap from "./EmbedMap.jsx";
import founderQr from "../assets/founding-partner-qr.png";
import styles from "./MemcomMapsDemo.module.css";

// Anon-only client, same rationale as SlugMap/EmbedMap: avoids sending an
// authenticated JWT (from a logged-in admin/client session in the same
// browser) to a table whose insert/select policies expect the anon role.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? "https://placeholder.supabase.co",
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

const CLIENT_SLUG = "layercake";
const MAP_SLUG = "uk-associations-sample-map";
const SIGNUP_URL = "https://maps.layercake-cx.biz/#signup";

export default function MemcomMapsDemo() {
  const [mapId, setMapId] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_map_id_by_slugs", {
        p_client_slug: CLIENT_SLUG,
        p_map_slug: MAP_SLUG,
      });
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setMapId(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (notFound) return <div style={{ padding: 16 }}>Map not found.</div>;
  if (!mapId) return <div style={{ padding: 16 }}>Loading…</div>;

  const overlay = (
    <a href={SIGNUP_URL} target="_blank" rel="noopener noreferrer" className={styles.overlay}>
      <img src={founderQr} alt="Scan to become a founding partner" className={styles.qr} />
      <span className={styles.cta}>Become a founding partner</span>
    </a>
  );

  return <EmbedMap mapId={mapId} overlay={overlay} />;
}
