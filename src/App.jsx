import { useEffect, useRef } from "react";

export default function App() {
  const mapRef = useRef(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 51.5072, lng: -0.1276 },
        zoom: 5,
      });

      new window.google.maps.Marker({
        position: { lat: 51.5072, lng: -0.1276 },
        map,
        title: "London",
      });
    };
    document.head.appendChild(script);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Directory Map</h1>
      <div
        ref={mapRef}
        style={{ width: "100%", height: "75vh", borderRadius: 12 }}
      />
    </div>
  );
}