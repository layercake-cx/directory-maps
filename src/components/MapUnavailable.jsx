import React from "react";

/**
 * Shown to visitors when a map (or its customer) is archived. Deliberately neutral: no client branding, no
 * Discover marketing, and a noindex hint. Compact enough to fit inside an embed iframe.
 * (Static pages get a real HTTP 410 from middleware.js; a single-page app can only set the meta tag.)
 */
export default function MapUnavailable() {
  React.useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  return (
    <main
      style={{
        minHeight: "100%", height: "100vh", display: "grid", placeItems: "center", boxSizing: "border-box",
        padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#2c3338", background: "#f4f2ee",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>This map is no longer available.</h1>
        <p style={{ margin: 0, lineHeight: 1.5, color: "#5c6469" }}>
          It may have moved or been taken down by the organisation that ran it.
        </p>
      </div>
    </main>
  );
}
