import React, { useEffect, useState } from "react";
import DirectoryMap from "../components/DirectoryMap.jsx";
import { supabase } from "../lib/supabase";

export default function PublicMap() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const [listings, setListings] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("public_listings") // or "listings" if you didn't make the view
        .select("*");

      if (!error) setListings(data ?? []);
      // if error, we’ll surface it next
    })();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      {!apiKey ? (
        <div>Missing VITE_GOOGLE_MAPS_API_KEY</div>
      ) : null}

      <DirectoryMap
        apiKey={apiKey}
        center={{ lat: 51.5072, lng: -0.1276 }}
        zoom={4}
        listings={listings}
        onSelect={setSelected}
      />

      {selected ? (
        <pre style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          {JSON.stringify(selected, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}