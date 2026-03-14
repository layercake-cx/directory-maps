import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof console !== "undefined" && console.error) {
      console.error("App error:", error, info?.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div
          style={{
            padding: 24,
            maxWidth: 560,
            margin: "40px auto",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
            lineHeight: 1.5,
            color: "#111",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
          }}
        >
          <h2 style={{ margin: "0 0 12px 0", fontSize: 18, color: "#b91c1c" }}>
            Something went wrong
          </h2>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 13,
              color: "#991b1b",
            }}
          >
            {e?.message ?? String(e)}
          </pre>
          <p style={{ margin: "16px 0 0 0", opacity: 0.9 }}>
            If you’re the deployer: set <strong>VITE_SUPABASE_URL</strong> and{" "}
            <strong>VITE_SUPABASE_ANON_KEY</strong> in Vercel (Project → Settings → Environment
            Variables), then redeploy.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
