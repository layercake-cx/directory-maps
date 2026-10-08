import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import {
  AI_PROVIDERS,
  costTierLabel,
  costTierSymbol,
  invokeSaveModelConfig,
  modelAdvisory,
} from "../../lib/clientIntegrations.js";
import { invalidateAiRoutePreview, useAiRoutePreview } from "../../hooks/useAiRoutePreview.js";
import styles from "../../pages/client/ClientEmail.module.css";

const providerLabel = (id) => AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;
const providerPricing = (id) => AI_PROVIDERS.find((p) => p.id === id)?.pricingUrl;

function draftFromConfig(cfg) {
  return {
    provider: cfg?.provider ?? "",
    useRecommended: cfg ? cfg.use_recommended !== false : true,
    model: cfg?.model ?? "",
  };
}

/**
 * Which connected provider and model each Directory Maps AI feature uses. Recommended setup is the
 * default (Layercake picks the cheapest suitable model); advanced users can choose provider and model
 * per feature. Layercake advises on cost but never blocks a choice.
 * @param {{ clientId: string, eventSource?: string, refreshKey?: number }} props
 */
export default function AiFeaturesConfig({ clientId, eventSource = "client_portal", refreshKey = 0 }) {
  const { data, loading, error, refresh } = useAiRoutePreview(clientId, null);
  const [drafts, setDrafts] = useState({}); // featureKey|"default" -> draft
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (refreshKey > 0) {
      invalidateAiRoutePreview();
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Reset drafts whenever fresh data arrives.
  useEffect(() => {
    if (!data) return;
    const next = { default: draftFromConfig(data.config?.default) };
    for (const f of data.features) next[f.key] = draftFromConfig(data.config?.features?.[f.key]);
    setDrafts(next);
  }, [data]);

  const connected = data?.connected_providers ?? [];
  const catalogue = data?.catalogue ?? [];
  const profiles = data?.profiles ?? [];

  const modelsFor = (provider) => catalogue.filter((m) => m.provider === provider && m.status !== "disabled");
  const recommendedRow = (provider, capability) => {
    const modelId = profiles.find((p) => p.provider === provider && p.capability === capability)?.model_id;
    return catalogue.find((m) => m.provider === provider && m.model_id === modelId) ?? null;
  };
  const rationale = (provider, capability) => profiles.find((p) => p.provider === provider && p.capability === capability)?.rationale;

  function setDraft(key, patch) {
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  }

  async function save(key, feature) {
    const draft = drafts[key];
    setErr("");
    setMsg("");
    setBusy(key);
    try {
      await invokeSaveModelConfig({
        clientId,
        scope: key === "default" ? "default" : "feature",
        feature: key === "default" ? undefined : key,
        provider: draft.provider,
        useRecommended: key === "default" ? true : draft.useRecommended,
        model: draft.useRecommended ? undefined : draft.model,
      });
      recordAdminEvent(supabase, {
        eventType: "ai_model_config_updated",
        clientId,
        meta: {
          client_id: clientId,
          product: key === "default" ? null : "directory_maps",
          feature: key === "default" ? null : key,
          provider: draft.provider || null,
          model: draft.useRecommended ? null : draft.model,
          use_recommended: key === "default" ? true : draft.useRecommended,
          source: eventSource,
        },
      });
      invalidateAiRoutePreview();
      await refresh();
      setMsg(`${key === "default" ? "Default provider" : feature.label} saved.`);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  const same = (a, b) => a && b && a.provider === b.provider && a.useRecommended === b.useRecommended && (a.useRecommended || a.model === b.model);

  const baseline = useMemo(() => {
    const out = { default: draftFromConfig(data?.config?.default) };
    for (const f of data?.features ?? []) out[f.key] = draftFromConfig(data?.config?.features?.[f.key]);
    return out;
  }, [data]);

  return (
    <section className={`${styles.panelBox} ${styles.panelBoxFull}`} style={{ marginTop: 16 }}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>AI features</h2>
      </div>
      <p className={styles.hint}>
        <strong>Most Layercake AI tasks don&apos;t require the most powerful AI models.</strong> Tasks such as SEO
        metadata generation, classification and search interpretation can usually be handled well by smaller,
        significantly cheaper models. Layercake recommends a suitable model for each task to help keep your AI costs
        low. You can choose a different provider or model if you have your own policies or agreements.
      </p>

      {err ? <p className={styles.error}>{err}</p> : null}
      {msg ? <p className={styles.success}>{msg}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading && !data ? <p>Loading…</p> : null}

      {data ? (
        <>
          <div className={styles.panelSubsection}>
            <label className={styles.field}>
              <span>Default AI provider</span>
              <select
                value={drafts.default?.provider ?? ""}
                onChange={(e) => setDraft("default", { provider: e.target.value })}
              >
                <option value="">Automatic{connected.length ? ` (${providerLabel(connected[0])})` : ""}</option>
                {connected.map((p) => (
                  <option key={p} value={p}>{providerLabel(p)}</option>
                ))}
              </select>
            </label>
            <p className={styles.fieldHint}>Used for every feature below unless it has its own provider.</p>
            {!same(drafts.default, baseline.default) ? (
              <div className={styles.actions}>
                <button type="button" className="btn btn-primary" disabled={busy === "default"} onClick={() => save("default")}>
                  {busy === "default" ? "Saving…" : "Save default"}
                </button>
              </div>
            ) : null}
          </div>

          {data.features.map((f) => {
            const draft = drafts[f.key] ?? draftFromConfig(null);
            const effProvider = draft.provider || f.provider || connected[0] || "anthropic";
            const rec = recommendedRow(effProvider, f.capability);
            const manualModels = modelsFor(effProvider);
            const chosen = !draft.useRecommended ? catalogue.find((m) => m.provider === effProvider && m.model_id === draft.model) : null;
            const advisory = chosen ? modelAdvisory(chosen, f.capability, rec) : null;
            const dirty = !same(draft, baseline[f.key]);
            const running = catalogue.find((m) => m.provider === f.provider && m.model_id === f.model);
            return (
              <div key={f.key} className={styles.panelSubsection} style={{ borderTop: "1px solid var(--lc-border)", paddingTop: 12 }}>
                <div className={styles.sectionHeader}>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{f.label}</h3>
                  {f.available ? (
                    <span className={`${styles.badge} ${styles["badge--success"]}`}>
                      {running?.label ?? f.model} · {providerLabel(f.provider)}
                    </span>
                  ) : (
                    <span className={`${styles.badge} ${styles["badge--warning"]}`}>Unavailable</span>
                  )}
                </div>
                <p className={styles.fieldHint}>{f.description}</p>
                {!f.available ? <p className={styles.note}>{f.message}</p> : null}

                <div className={styles.fromAddressRow}>
                  <label className={styles.field}>
                    <span>Provider</span>
                    <select
                      value={draft.provider}
                      onChange={(e) => setDraft(f.key, { provider: e.target.value, model: "" })}
                    >
                      <option value="">Default{connected.length ? ` (${providerLabel(drafts.default?.provider || connected[0])})` : ""}</option>
                      {connected.map((p) => (
                        <option key={p} value={p}>{providerLabel(p)}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "8px 0 4px", fontSize: 13 }}>
                  <input
                    type="radio"
                    name={`mode-${f.key}`}
                    checked={draft.useRecommended}
                    onChange={() => setDraft(f.key, { useRecommended: true, model: "" })}
                  />
                  <span>
                    <strong>Use recommended model</strong>
                    {rec ? <> — {rec.label} <span title={costTierLabel(rec.cost_tier)}>{costTierSymbol(rec.cost_tier)}</span></> : null}
                    <br />
                    <span className={styles.fieldHint}>{rationale(effProvider, f.capability) ?? f.recommendation}</span>
                  </span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "4px 0", fontSize: 13 }}>
                  <input
                    type="radio"
                    name={`mode-${f.key}`}
                    checked={!draft.useRecommended}
                    disabled={connected.length === 0}
                    onChange={() =>
                      setDraft(f.key, {
                        useRecommended: false,
                        provider: draft.provider || connected[0] || "",
                        model: draft.model || rec?.model_id || manualModels[0]?.model_id || "",
                      })
                    }
                  />
                  <span><strong>Select model manually</strong></span>
                </label>

                {!draft.useRecommended ? (
                  <label className={styles.field} style={{ marginLeft: 24 }}>
                    <span>Model</span>
                    <select value={draft.model} onChange={(e) => setDraft(f.key, { model: e.target.value })}>
                      {manualModels.map((m) => (
                        <option key={m.model_id} value={m.model_id}>
                          {m.label} — {costTierSymbol(m.cost_tier)} {costTierLabel(m.cost_tier)}
                          {m.status === "deprecated" ? " (deprecated)" : ""}
                          {m.model_id === rec?.model_id ? " — recommended" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {advisory ? <p className={styles.note} style={{ marginLeft: 24 }}>{advisory}</p> : null}
                {chosen?.guidance ? <p className={styles.fieldHint} style={{ marginLeft: 24 }}>{chosen.guidance}</p> : null}

                {dirty ? (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy === f.key || (!draft.useRecommended && !draft.model)}
                      onClick={() => save(f.key, f)}
                    >
                      {busy === f.key ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className="btn" disabled={busy === f.key} onClick={() => setDraft(f.key, baseline[f.key])}>
                      Reset
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}

          <p className={styles.fieldHint} style={{ marginTop: 12 }}>
            Cost symbols are a rough guide only (£ very low cost, ££ low, £££ higher, ££££ premium); providers change
            their prices often.{" "}
            {connected.map((p, i) => (
              <span key={p}>
                {i > 0 ? ", " : ""}
                <a href={providerPricing(p)} target="_blank" rel="noreferrer">{providerLabel(p)} pricing</a>
              </span>
            ))}
            {connected.length ? "." : ""}
          </p>
        </>
      ) : null}
    </section>
  );
}
