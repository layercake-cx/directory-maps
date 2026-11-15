import React, { useState } from "react";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { Button, Callout, Section, SettingsLayout } from "../../components/ui/index.js";
import "../../styles/wave-c/ops.css";

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
        recordAdminEvent(supabase, {
          eventType: "ops_deploy_hook_triggered",
          source: "admin_ui",
          meta: {
            environment: "preview",
            source: "admin_ui",
            actor_admin_scope: "platform_admin",
          },
        });
        setMsg({ type: "success", text: "Deployment to test triggered. Check Vercel for the preview URL." });
      } catch (e) {
        recordAdminEvent(supabase, {
          eventType: "ops_deploy_hook_failed",
          source: "admin_ui",
          meta: {
            environment: "preview",
            source: "admin_ui",
            actor_admin_scope: "platform_admin",
            error: e?.message || "Failed to trigger deploy.",
          },
        });
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
        recordAdminEvent(supabase, {
          eventType: "ops_deploy_hook_triggered",
          source: "admin_ui",
          meta: {
            environment: "production",
            source: "admin_ui",
            actor_admin_scope: "platform_admin",
          },
        });
        setMsg({ type: "success", text: "Production deployment triggered. Check Vercel for status." });
      } catch (e) {
        recordAdminEvent(supabase, {
          eventType: "ops_deploy_hook_failed",
          source: "admin_ui",
          meta: {
            environment: "production",
            source: "admin_ui",
            actor_admin_scope: "platform_admin",
            error: e?.message || "Failed to trigger deploy.",
          },
        });
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

  const calloutTone = msg.type === "error" ? "danger" : msg.type === "success" ? "ok" : "info";

  return (
    <AdminLayout>
      <SettingsLayout
        head={{
          title: "Deployments",
          subtitle:
            "Deploy to test (preview) or production. If deploy hooks are configured, clicking will trigger a deploy; otherwise the command is copied so you can run it locally.",
        }}
      >
        <Section title="Deploy">
          <div className="ops-deploy-actions">
            <Button variant="primary" onClick={deployToTest} loading={loading.test} loadingLabel="Triggering…">
              Deploy to test
            </Button>
            <Button onClick={deployLive} loading={loading.live} loadingLabel="Triggering…">
              Deploy live
            </Button>
          </div>

          {msg.text ? <Callout tone={calloutTone}>{msg.text}</Callout> : null}
        </Section>

        <Section title="Run from the terminal">
          <div className="ops-cmd-list">
            <p className="ops-deploy-note">To run from terminal (from project root):</p>
            <code className="ops-cmd">npm run deploy:test</code>
            <code className="ops-cmd">npm run deploy:live</code>
          </div>
          <p className="ops-deploy-note">
            Or run the scripts directly: <code>./scripts/deploy-to-test.sh</code> and <code>./scripts/deploy-live.sh</code>. For one-click deploys, add Vercel Deploy Hook URLs to your <code>.env</code> as <code>VITE_DEPLOY_HOOK_PREVIEW</code> and <code>VITE_DEPLOY_HOOK_PRODUCTION</code>.
          </p>
        </Section>
      </SettingsLayout>
    </AdminLayout>
  );
}
