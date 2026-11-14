import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import {
  AI_PROVIDERS,
  integrationStatusLabel,
  integrationStatusTone,
  invokeManageClientIntegrations,
} from "../../lib/clientIntegrations.js";
import { Button, Callout, Field, Pill, Section, Skeleton, TextInput, useConfirm } from "../ui/index.js";
import "../../styles/wave-a/batch-4.css";

function formatWhen(iso) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Never" : d.toLocaleString();
}

/**
 * AI provider connections for one organisation: connect, test, replace key, disconnect.
 * Keys are write-only -- they are sent once and never shown again (only the last four characters).
 * @param {{ clientId: string, eventSource?: string }} props
 */
export default function AiProvidersTab({ clientId, eventSource = "client_portal", onConnectionsChanged }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [integrations, setIntegrations] = useState([]);
  // Which provider's key form is open ("connect" or "replace"), and its draft key.
  const [editing, setEditing] = useState(null); // { provider, mode }
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(null); // provider id while a request is in flight
  const confirm = useConfirm();

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setErr("");
    try {
      const data = await invokeManageClientIntegrations({ clientId, action: "list" });
      setIntegrations(data.integrations ?? []);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  function event(eventType, provider, extra = {}) {
    recordAdminEvent(supabase, {
      eventType,
      clientId,
      meta: { client_id: clientId, provider, source: eventSource, ...extra },
    });
  }

  function closeForm() {
    setEditing(null);
    setApiKey("");
  }

  async function handleSaveKey(e) {
    e.preventDefault();
    if (!editing) return;
    const { provider, mode } = editing;
    setErr("");
    setMsg("");
    setBusy(provider);
    try {
      const data = await invokeManageClientIntegrations({
        clientId,
        action: mode === "replace" ? "replace" : "connect",
        provider,
        apiKey,
      });
      event(mode === "replace" ? "integration_credentials_replaced" : "integration_connected", provider, {
        status: "connected",
      });
      setIntegrations((rows) => {
        const rest = rows.filter((r) => r.provider !== provider);
        return data.integration ? [...rest, data.integration] : rest;
      });
      closeForm();
      setMsg(mode === "replace" ? "API key replaced." : "Connected.");
      onConnectionsChanged?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setBusy(null);
    }
  }

  async function handleTest(provider) {
    setErr("");
    setMsg("");
    setBusy(provider);
    try {
      const data = await invokeManageClientIntegrations({ clientId, action: "test", provider });
      setIntegrations(data.integrations ?? []);
      onConnectionsChanged?.();
      event("integration_tested", provider, { status: data.ok ? "connected" : "error", ok: !!data.ok });
      if (data.ok) setMsg("Connection test passed.");
      else setErr(data.test_error || "Connection test failed.");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect(provider, label) {
    const ok = await confirm({
      title: `Disconnect ${label}?`,
      body: "AI features that use it will stop working until a provider is connected. The stored key is deleted.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (!ok) return;
    setErr("");
    setMsg("");
    setBusy(provider);
    try {
      await invokeManageClientIntegrations({ clientId, action: "disconnect", provider });
      event("integration_disconnected", provider);
      setIntegrations((rows) => rows.filter((r) => r.provider !== provider));
      if (editing?.provider === provider) closeForm();
      setMsg(`${label} disconnected.`);
      onConnectionsChanged?.();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  const TONE = { success: "live", error: "danger", muted: "neutral" };

  return (
    <>
      <Callout tone="info">
        Connect your own AI provider account. Layercake&apos;s AI features (search, content and metadata
        generation) then use your account, and the provider bills you directly for that usage. Most tasks work
        well on small, low-cost models, so Layercake recommends the cheapest suitable model for each task.
      </Callout>
      <p className="b4-note">
        Using your own provider means the listing and visitor information needed for each AI request is sent to
        that provider under your own agreement with them.
      </p>

      {err ? <Callout tone="danger">{err}</Callout> : null}
      {msg ? <Callout tone="ok">{msg}</Callout> : null}

      {loading ? (
        <Skeleton variant="list" rows={3} label="Loading AI providers" />
      ) : (
        <div className="b4-provider-grid">
          {AI_PROVIDERS.map((p) => {
            const row = integrations.find((i) => i.provider === p.id) ?? null;
            const status = row?.status ?? "not_connected";
            const tone = integrationStatusTone(status);
            const isEditing = editing?.provider === p.id;
            const working = busy === p.id;
            return (
              <Section
                key={p.id}
                title={p.label}
                className={status === "connected" ? "b4-provider-active" : ""}
                actions={<Pill tone={TONE[tone] || "neutral"}>{integrationStatusLabel(status)}</Pill>}
              >
                {row ? (
                  <p className="field-hint">
                    Key ending <strong>…{row.key_hint ?? "????"}</strong> · last tested {formatWhen(row.last_tested_at)}
                  </p>
                ) : (
                  <p className="field-hint">Use {p.models} models with your own {p.label} account.</p>
                )}
                {row?.status === "error" && row.last_error ? <Callout tone="danger">{row.last_error}</Callout> : null}

                {isEditing ? (
                  <form onSubmit={handleSaveKey} className="b4-stack">
                    <Field
                      label="API key"
                      required
                      hint={
                        <>
                          We test the key before saving it. It is stored encrypted and can&apos;t be viewed again.{" "}
                          <a href={p.keyUrl} target="_blank" rel="noreferrer">
                            Get a key from {p.label}
                          </a>
                          .
                        </>
                      }
                    >
                      <TextInput
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={p.keyPlaceholder}
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                      />
                    </Field>
                    <div className="b4-actions">
                      <Button type="submit" variant="primary" loading={working} loadingLabel="Testing…" disabled={!apiKey.trim()}>
                        {editing.mode === "replace" ? "Test & replace key" : "Test & connect"}
                      </Button>
                      <Button onClick={closeForm} disabled={working}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="b4-actions b4-actions--end">
                    {row ? (
                      <>
                        <Button loading={working} loadingLabel="Testing…" onClick={() => handleTest(p.id)}>
                          Test connection
                        </Button>
                        <Button
                          disabled={working}
                          onClick={() => {
                            setErr("");
                            setMsg("");
                            setApiKey("");
                            setEditing({ provider: p.id, mode: "replace" });
                          }}
                        >
                          Replace key
                        </Button>
                        <Button variant="danger" disabled={working} onClick={() => handleDisconnect(p.id, p.label)}>
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={() => {
                          setErr("");
                          setMsg("");
                          setApiKey("");
                          setEditing({ provider: p.id, mode: "connect" });
                        }}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                )}
                <p className="field-hint">
                  <a href={p.pricingUrl} target="_blank" rel="noreferrer">
                    {p.label} pricing
                  </a>
                </p>
              </Section>
            );
          })}
        </div>
      )}
    </>
  );
}
