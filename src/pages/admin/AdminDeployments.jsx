import React, { useState } from "react";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

const DEPLOY_HOOK_PREVIEW = import.meta.env.VITE_DEPLOY_HOOK_PREVIEW || "";
const DEPLOY_HOOK_PRODUCTION = import.meta.env.VITE_DEPLOY_HOOK_PRODUCTION || "";

export default function AdminDeployments() {
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState({ test: false, live: false });

  function clearMsg() {
    setMsg({ type: "", text: "" });
  }

  async function deployToTest() {
    if (DEPLOY_HOOK_PREVIEW) {
      setLoading((l) => ({ ...l, test: true }));
      setMsg({ type: "", text: "" });
      try {
        const res = await fetch(DEPLOY_HOOK_PREVIEW, { method: "POST" });
        if (!res.ok) throw new Error(`Deploy hook returned ${res.status}`);
        setMsg({ type: "success", text: "Deployment to test triggered. Check Vercel for the preview URL." });
      } catch (e) {
        setMsg({ type: "error", text: e?.message || "Failed to trigger deploy." });
      } finally {
        setLoading((l) => ({ ...l, test: false }));
      }
      return;
    }
    const cmd = "npm run deploy:test";
    try {
      await navigator.clipboard.writeText(cmd);
      setMsg({ type: "success", text: "Command copied. Run in your terminal from the project root." });
    } catch {
      setMsg({ type: "info", text: `Run in terminal from project root: ${cmd}` });
    }
    setTimeout(clearMsg, 5000);
  }

  async function deployLive() {
    if (DEPLOY_HOOK_PRODUCTION) {
      setLoading((l) => ({ ...l, live: true }));
      setMsg({ type: "", text: "" });
      try {
        const res = await fetch(DEPLOY_HOOK_PRODUCTION, { method: "POST" });
        if (!res.ok) throw new Error(`Deploy hook returned ${res.status}`);
        setMsg({ type: "success", text: "Production deployment triggered. Check Vercel for status." });
      } catch (e) {
        setMsg({ type: "error", text: e?.message || "Failed to trigger deploy." });
      } finally {
        setLoading((l) => ({ ...l, live: false }));
      }
      return;
    }
    const cmd = "npm run deploy:live";
    try {
      await navigator.clipboard.writeText(cmd);
      setMsg({ type: "success", text: "Command copied. Run in your terminal from the project root." });
    } catch {
      setMsg({ type: "info", text: `Run in terminal from project root: ${cmd}` });
    }
    setTimeout(clearMsg, 5000);
  }

  return (
    <AdminLayout
      breadcrumbs={[{ label: "Deployments" }]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <h2 style={{ marginTop: 0 }}>Deployments</h2>
        <p style={{ color: "var(--lc-muted)", marginBottom: 24 }}>
          Deploy to test (preview) or production. If deploy hooks are configured, clicking will trigger a deploy; otherwise the command is copied so you can run it locally.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={deployToTest}
            disabled={loading.test}
          >
            {loading.test ? "Triggering…" : "Deploy to test"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={deployLive}
            disabled={loading.live}
          >
            {loading.live ? "Triggering…" : "Deploy live"}
          </button>
        </div>

        {msg.text && (
          <p
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: msg.type === "error" ? "rgba(185, 28, 28, 0.1)" : msg.type === "success" ? "rgba(22, 163, 74, 0.1)" : "var(--lc-card)",
              color: msg.type === "error" ? "#b91c1c" : msg.type === "success" ? "#16a34a" : "var(--lc-text)",
              border: `1px solid ${msg.type === "error" ? "#b91c1c" : msg.type === "success" ? "#16a34a" : "var(--lc-border)"}`,
            }}
          >
            {msg.text}
          </p>
        )}

        <div style={{ marginTop: 24, fontSize: 13, color: "var(--lc-muted)" }}>
          <p style={{ margin: "0 0 8px" }}>To run from terminal (from project root):</p>
          <code style={{ display: "block", padding: 8, background: "var(--lc-card)", borderRadius: 6, border: "1px solid var(--lc-border)" }}>
            npm run deploy:test
          </code>
          <code style={{ display: "block", marginTop: 6, padding: 8, background: "var(--lc-card)", borderRadius: 6, border: "1px solid var(--lc-border)" }}>
            npm run deploy:live
          </code>
          <p style={{ margin: "12px 0 0", fontSize: 12 }}>
            Or run the scripts directly: <code>./scripts/deploy-to-test.sh</code> and <code>./scripts/deploy-live.sh</code>. For one-click deploys, add Vercel Deploy Hook URLs to your <code>.env</code> as <code>VITE_DEPLOY_HOOK_PREVIEW</code> and <code>VITE_DEPLOY_HOOK_PRODUCTION</code>.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
