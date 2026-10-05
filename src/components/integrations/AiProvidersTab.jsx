import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import {
  AI_PROVIDERS,
  integrationStatusLabel,
  integrationStatusTone,
  invokeManageClientIntegrations,
} from "../../lib/clientIntegrations.js";
import styles from "../../pages/client/ClientEmail.module.css";

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
export default function AiProvidersTab({ clientId, eventSource = "client_portal" }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [integrations, setIntegrations] = useState([]);
  // Which provider's key form is open ("connect" or "replace"), and its draft key.
  const [editing, setEditing] = useState(null); // { provider, mode }
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(null); // provider id while a request is in flight

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
    if (
      !window.confirm(
        `Disconnect ${label}? AI features that use it will stop working until a provider is connected. The stored key is deleted.`
      )
    ) {
      return;
    }
    setErr("");
    setMsg("");
    setBusy(provider);
    try {
      await invokeManageClientIntegrations({ clientId, action: "disconnect", provider });
      event("integration_disconnected", provider);
      setIntegrations((rows) => rows.filter((r) => r.provider !== provider));
      if (editing?.provider === provider) closeForm();
      setMsg(`${label} disconnected.`);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p className={styles.hint} style={{ marginTop: 16 }}>
        Connect your own AI provider account. Layercake&apos;s AI features (search, content and metadata
        generation) then use your account, and the provider bills you directly for that usage. Most tasks work
        well on small, low-cost models, so Layercake recommends the cheapest suitable model for each task.
      </p>
      <p className={styles.note}>
        Using your own provider means the listing and visitor information needed for each AI request is sent to
        that provider under your own agreement with them.
      </p>

      {err ? <p className={styles.error}>{err}</p> : null}
      {msg ? <p className={styles.success}>{msg}</p> : null}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className={styles.messagingGrid} style={{ marginTop: 12 }}>
          {AI_PROVIDERS.map((p) => {
            const row = integrations.find((i) => i.provider === p.id) ?? null;
            const status = row?.status ?? "not_connected";
            const tone = integrationStatusTone(status);
            const isEditing = editing?.provider === p.id;
            const working = busy === p.id;
            return (
              <section
                key={p.id}
                className={`${styles.panelBox} ${status === "connected" ? styles.panelBoxActive : ""}`}
              >
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>{p.label}</h2>
                  <span className={`${styles.badge} ${styles[`badge--${tone}`]}`}>
                    {integrationStatusLabel(status)}
                  </span>
                </div>

                {row ? (
                  <p className={styles.hint}>
                    Key ending <strong>…{row.key_hint ?? "????"}</strong> · last tested {formatWhen(row.last_tested_at)}
                  </p>
                ) : (
                  <p className={styles.hint}>Use {p.models} models with your own {p.label} account.</p>
                )}
                {row?.status === "error" && row.last_error ? <p className={styles.error}>{row.last_error}</p> : null}

                {isEditing ? (
                  <form onSubmit={handleSaveKey} className={styles.panelSubsection}>
                    <label className={styles.field}>
                      <span>
                        API key <span className={styles.required}>*</span>
                      </span>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={p.keyPlaceholder}
                        autoComplete="off"
                        spellCheck={false}
                        required
                        autoFocus
                      />
                    </label>
                    <p className={styles.fieldHint}>
                      We test the key before saving it. It is stored encrypted and can&apos;t be viewed again.{" "}
                      <a href={p.keyUrl} target="_blank" rel="noreferrer">
                        Get a key from {p.label}
                      </a>
                      .
                    </p>
                    <div className={styles.actions}>
                      <button type="submit" className="btn btn-primary" disabled={working || !apiKey.trim()}>
                        {working ? "Testing…" : editing.mode === "replace" ? "Test & replace key" : "Test & connect"}
                      </button>
                      <button type="button" className="btn" onClick={closeForm} disabled={working}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className={styles.actions} style={{ marginTop: "auto", paddingTop: 12 }}>
                    {row ? (
                      <>
                        <button type="button" className="btn" disabled={working} onClick={() => handleTest(p.id)}>
                          {working ? "Testing…" : "Test connection"}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={working}
                          onClick={() => {
                            setErr("");
                            setMsg("");
                            setApiKey("");
                            setEditing({ provider: p.id, mode: "replace" });
                          }}
                        >
                          Replace key
                        </button>
                        <button type="button" className="btn" disabled={working} onClick={() => handleDisconnect(p.id, p.label)}>
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          setErr("");
                          setMsg("");
                          setApiKey("");
                          setEditing({ provider: p.id, mode: "connect" });
                        }}
                      >
                        Connect
                      </button>
                    )}
                  </div>
                )}
                <p className={styles.fieldHint} style={{ marginTop: 8 }}>
                  <a href={p.pricingUrl} target="_blank" rel="noreferrer">
                    {p.label} pricing
                  </a>
                </p>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
