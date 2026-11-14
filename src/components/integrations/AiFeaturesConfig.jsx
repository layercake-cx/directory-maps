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
import { Button, Callout, Field, Pill, Section, Select, Skeleton } from "../ui/index.js";
import "../../styles/wave-a/batch-4.css";

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
    <Section
      title="AI features"
      description={
        <>
          <strong>Most Layercake AI tasks don&apos;t require the most powerful AI models.</strong> Tasks such as SEO
          metadata generation, classification and search interpretation can usually be handled well by smaller,
          significantly cheaper models. Layercake recommends a suitable model for each task to help keep your AI costs
          low. You can choose a different provider or model if you have your own policies or agreements.
        </>
      }
    >
      {err ? <Callout tone="danger">{err}</Callout> : null}
      {msg ? <Callout tone="ok">{msg}</Callout> : null}
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {loading && !data ? <Skeleton variant="form" rows={2} label="Loading AI features" /> : null}

      {data ? (
        <>
          <div className="b4-stack">
            <Field label="Default AI provider" hint="Used for every feature below unless it has its own provider.">
              <Select
                value={drafts.default?.provider ?? ""}
                onChange={(e) => setDraft("default", { provider: e.target.value })}
              >
                <option value="">Automatic{connected.length ? ` (${providerLabel(connected[0])})` : ""}</option>
                {connected.map((p) => (
                  <option key={p} value={p}>{providerLabel(p)}</option>
                ))}
              </Select>
            </Field>
            {!same(drafts.default, baseline.default) ? (
              <div className="b4-actions">
                <Button variant="primary" loading={busy === "default"} loadingLabel="Saving…" onClick={() => save("default")}>
                  Save default
                </Button>
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
              <div key={f.key} className="b4-feature">
                <div className="b4-row b4-row--between">
                  <h3 className="b4-subhead">{f.label}</h3>
                  {f.available ? (
                    <Pill tone="live">{running?.label ?? f.model} · {providerLabel(f.provider)}</Pill>
                  ) : (
                    <Pill tone="warn">Unavailable</Pill>
                  )}
                </div>
                <p className="field-hint">{f.description}</p>
                {!f.available ? <Callout tone="warn">{f.message}</Callout> : null}

                <Field label="Provider">
                  <Select
                    value={draft.provider}
                    onChange={(e) => setDraft(f.key, { provider: e.target.value, model: "" })}
                  >
                    <option value="">Default{connected.length ? ` (${providerLabel(drafts.default?.provider || connected[0])})` : ""}</option>
                    {connected.map((p) => (
                      <option key={p} value={p}>{providerLabel(p)}</option>
                    ))}
                  </Select>
                </Field>

                <fieldset className="choice-group">
                  <legend className="field-label">Model choice for {f.label}</legend>
                  <label className="check">
                    <input
                      type="radio"
                      name={`mode-${f.key}`}
                      checked={draft.useRecommended}
                      onChange={() => setDraft(f.key, { useRecommended: true, model: "" })}
                    />
                    <span className="check-text">
                      <span className="check-label">
                        <strong>Use recommended model</strong>
                        {rec ? <> — {rec.label} <span title={costTierLabel(rec.cost_tier)}>{costTierSymbol(rec.cost_tier)}</span></> : null}
                      </span>
                      <span className="field-hint">{rationale(effProvider, f.capability) ?? f.recommendation}</span>
                    </span>
                  </label>
                  <label className="check">
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
                    <span className="check-text">
                      <span className="check-label"><strong>Select model manually</strong></span>
                    </span>
                  </label>
                </fieldset>

                {!draft.useRecommended ? (
                  <Field label="Model" className="b4-indent">
                    <Select value={draft.model} onChange={(e) => setDraft(f.key, { model: e.target.value })}>
                      {manualModels.map((m) => (
                        <option key={m.model_id} value={m.model_id}>
                          {m.label} — {costTierSymbol(m.cost_tier)} {costTierLabel(m.cost_tier)}
                          {m.status === "deprecated" ? " (deprecated)" : ""}
                          {m.model_id === rec?.model_id ? " — recommended" : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                {advisory ? <Callout tone="info" className="b4-indent">{advisory}</Callout> : null}
                {chosen?.guidance ? <p className="field-hint b4-indent">{chosen.guidance}</p> : null}

                {dirty ? (
                  <div className="b4-actions">
                    <Button
                      variant="primary"
                      loading={busy === f.key}
                      loadingLabel="Saving…"
                      disabled={!draft.useRecommended && !draft.model}
                      onClick={() => save(f.key, f)}
                    >
                      Save
                    </Button>
                    <Button disabled={busy === f.key} onClick={() => setDraft(f.key, baseline[f.key])}>
                      Reset
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}

          <p className="field-hint">
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
    </Section>
  );
}
