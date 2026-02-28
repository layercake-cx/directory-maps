import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ✅ Your actual table + columns
const TABLE = "listings";
const SELECT =
  "id,name,address,website_url,logo_url,email,lat,lng";

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error("Missing VITE_GOOGLE_MAPS_API_KEY"));
    if (window.google?.maps) return resolve(window.google.maps);

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () =>
      reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function App() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  // 1️⃣ Load data from Supabase
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from(TABLE)
        .select(SELECT)
        .not("lat", "is", null)
        .not("lng", "is", null)
        .limit(5000);

      if (error) {
        setError(error.message);
      } else {
        setRows(data ?? []);
      }
    }

    load();
  }, []);

  // 2️⃣ Initialise Google Map
  useEffect(() => {
    async function init() {
      try {
        const maps = await loadGoogleMaps(
          import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        );

        const map = new maps.Map(mapRef.current, {
          center: { lat: 51.5072, lng: -0.1276 },
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });

        mapInstanceRef.current = map;
        infoWindowRef.current = new maps.InfoWindow();
      } catch (err) {
        setError(err.message);
      }
    }

    init();
  }, []);

  // 3️⃣ Render markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !rows.length) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();

    rows.forEach((r) => {
      const marker = new window.google.maps.Marker({
        position: { lat: r.lat, lng: r.lng },
        map,
        title: r.name,
      });

      bounds.extend({ lat: r.lat, lng: r.lng });

      marker.addListener("click", () => {
        const iw = infoWindowRef.current;

        const content = `
          <div style="max-width:260px;font-family:system-ui;">
            <div style="display:flex;gap:10px;align-items:center;">
              ${
                r.logo_url
                  ? `<img src="${escapeHtml(
                      r.logo_url
                    )}" style="width:50px;height:50px;object-fit:contain;border-radius:6px;border:1px solid #eee;" />`
                  : ""
              }
              <div>
                <div style="font-weight:700;font-size:15px;">
                  ${escapeHtml(r.name)}
                </div>
              </div>
            </div>
            ${
              r.address
                ? `<div style="margin-top:8px;color:#555;">${escapeHtml(
                    r.address
                  )}</div>`
                : ""
            }
            ${
              r.website_url
                ? `<div style="margin-top:8px;">
                    <a href="${escapeHtml(
                      r.website_url
                    )}" target="_blank" rel="noreferrer">
                      Visit website
                    </a>
                  </div>`
                : ""
            }
            ${
              r.email
                ? `<div style="margin-top:6px;">
                    <a href="mailto:${escapeHtml(r.email)}">
                      Email
                    </a>
                  </div>`
                : ""
            }
          </div>
        `;

        iw.setContent(content);
        iw.open({ map, anchor: marker });
      });

      markersRef.current.push(marker);
    });

    map.fitBounds(bounds);
  }, [rows]);

  return (
    <div style={{ padding: 20 }}>
      <h1>Directory Map</h1>

      <div style={{ marginBottom: 10, fontSize: 13, color: "#555" }}>
        Showing {rows.length} listings
      </div>

      {error && (
        <div style={{ color: "crimson", marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div
        ref={mapRef}
        style={{ width: "100%", height: "75vh", borderRadius: 12 }}
      />
    </div>
  );
}