import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../../lib/supabase";
import { AI_PROVIDERS } from "../../lib/clientIntegrations.js";
import {
  AI_FEATURE_LABELS,
  AI_PRODUCT_LABELS,
  USAGE_PERIODS,
  fillUsageDays,
  formatMoney,
  formatTokens,
  getAiUsageSummary,
  usagePeriodRange,
} from "../../lib/aiUsage.js";
import { DataTable, EmptyChart, LoadingState, MetricCards, Panel } from "../engagement/EngagementShared.jsx";
import shared from "../engagement/EngagementShared.module.css";
import styles from "../../pages/client/ClientEmail.module.css";

const providerLabel = (id) => AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;
const featureLabel = (row) =>
  `${AI_PRODUCT_LABELS[row.product] ?? row.product} — ${AI_FEATURE_LABELS[row.feature] ?? row.feature}`;
const num = (n) => Number(n ?? 0).toLocaleString();

/** Cost cell: an amount only when every request in the row was costed; otherwise say why not. */
function costCell(row) {
  if (row.estimated_cost == null || !row.requests_costed) return "–";
  const partial = row.requests_costed < row.requests;
  return `${partial ? "≥ " : ""}${formatMoney(Number(row.estimated_cost), row.currency)}`;
}

/**
 * AI usage generated through Layercake for one organisation: requests, tokens and (where model
 * prices are known) estimated cost, by feature, directory, provider and model. This is
 * Layercake-attributable consumption, not the total usage of the customer's provider account.
 * @param {{ clientId: string }} props
 */
export default function AiUsageTab({ clientId }) {
  const [period, setPeriod] = useState("30d");
  const [directoryId, setDirectoryId] = useState("");
  const [provider, setProvider] = useState("");
  const [directories, setDirectories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const range = useMemo(() => usagePeriodRange(period), [period]);

  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("directories")
      .select("id, name")
      .eq("client_id", clientId)
      .order("name")
      .then(({ data }) => setDirectories(data ?? []));
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    setLoading(true);
    setErr("");
    getAiUsageSummary({
      clientId,
      since: range.since,
      until: range.until,
      directoryId: directoryId || null,
      provider: provider || null,
    })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message ?? String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, range, directoryId, provider]);

  const totals = summary?.totals;
  const days = useMemo(() => fillUsageDays(summary?.by_day, range.since, range.until), [summary, range]);
  const totalTokens = Number(totals?.total_tokens ?? 0);

  const costValue = (() => {
    if (!totals || !totals.requests) return "–";
    if (totals.estimated_cost == null || !totals.requests_costed) return "Not available";
    const partial = totals.requests_costed < totals.requests;
    return `${partial ? "≥ " : ""}${formatMoney(Number(totals.estimated_cost), totals.currency)}`;
  })();
  const uncosted = totals ? totals.requests - totals.requests_costed : 0;

  const featureRows = (summary?.by_feature ?? []).map((r, i) => ({ ...r, id: `f${i}` }));
  const directoryRows = (summary?.by_directory ?? []).map((r, i) => ({ ...r, id: `d${i}` }));
  const modelRows = (summary?.by_model ?? []).map((r, i) => ({ ...r, id: `m${i}` }));

  return (
    <div style={{ marginTop: 16 }}>
      <p className={styles.hint}>
        This is the AI usage generated through Layercake. It is <strong>not</strong> your total provider account
        usage: your provider account may also be used for other things, and your provider is the authoritative source
        for what you owe.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
        <label className={shared.dateRange}>
          <span className={shared.dateRangeLabel}>Period</span>
          <select className={shared.dateRangeSelect} value={period} onChange={(e) => setPeriod(e.target.value)}>
            {USAGE_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className={shared.dateRange}>
          <span className={shared.dateRangeLabel}>Directory</span>
          <select className={shared.dateRangeSelect} value={directoryId} onChange={(e) => setDirectoryId(e.target.value)}>
            <option value="">All directories</option>
            {directories.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className={shared.dateRange}>
          <span className={shared.dateRangeLabel}>Provider</span>
          <select className={shared.dateRangeSelect} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">All providers</option>
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>

      {err ? <p className={styles.error}>{err}</p> : null}
      {loading && !summary ? <LoadingState /> : null}

      {totals ? (
        <>
          <MetricCards
            items={[
              { label: "Requests", value: num(totals.requests) },
              { label: "Input tokens", value: formatTokens(Number(totals.input_tokens)) },
              { label: "Output tokens", value: formatTokens(Number(totals.output_tokens)) },
              { label: "Total tokens", value: formatTokens(totalTokens) },
              { label: "Estimated provider cost", value: costValue },
            ]}
          />

          {totals.requests > 0 ? (
            <div style={{ fontSize: 12, margin: "8px 0 16px", display: "grid", gap: 4 }}>
              <span style={{ opacity: 0.75 }}>
                Estimated cost is based on published provider pricing. Your AI provider account is the authoritative
                source for billing. Actual costs may differ because of pricing changes, cached tokens, volume
                discounts, agreements, credits and currency conversion.
              </span>
              {uncosted > 0 ? (
                <span style={{ opacity: 0.75 }}>
                  {uncosted} of {totals.requests} requests used a model whose price isn&apos;t known, so they aren&apos;t
                  included in the estimate.
                </span>
              ) : null}
              {totals.platform_requests > 0 ? (
                <span style={{ color: "#92400e" }}>
                  {num(totals.platform_requests)} of these requests ran on Layercake&apos;s own AI account rather than
                  your provider account, so your provider doesn&apos;t bill them.
                </span>
              ) : null}
              {totals.failed > 0 ? (
                <span style={{ opacity: 0.75 }}>{num(totals.failed)} requests failed and used no tokens.</span>
              ) : null}
            </div>
          ) : null}

          <Panel title="Tokens per day" subtitle="Input plus output tokens across all AI requests.">
            {totals.requests === 0 ? (
              <EmptyChart message="No AI usage in this period." />
            ) : (
              <div className={shared.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} tickFormatter={(v) => formatTokens(v)} />
                    <Tooltip formatter={(v, name) => [num(v), name]} />
                    <Bar dataKey="tokens" name="Tokens" fill="#378ADD" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="By feature" subtitle="Which AI features are responsible for the usage.">
            <DataTable
              emptyMessage="No AI usage in this period."
              rows={featureRows}
              columns={[
                { key: "feature", label: "Product / feature", render: featureLabel },
                { key: "requests", label: "Requests", render: (r) => num(r.requests) },
                { key: "input_tokens", label: "Input", render: (r) => formatTokens(Number(r.input_tokens)) },
                { key: "output_tokens", label: "Output", render: (r) => formatTokens(Number(r.output_tokens)) },
                { key: "total_tokens", label: "Total", render: (r) => formatTokens(Number(r.total_tokens)) },
                {
                  key: "share",
                  label: "Share",
                  render: (r) => (totalTokens > 0 ? `${Math.round((Number(r.total_tokens) / totalTokens) * 100)}%` : "–"),
                },
                { key: "estimated_cost", label: "Est. cost", render: costCell },
              ]}
            />
          </Panel>

          <Panel title="By directory" subtitle="Which of your directories generate the usage.">
            <DataTable
              emptyMessage="No AI usage in this period."
              rows={directoryRows}
              columns={[
                { key: "instance_name", label: "Directory", render: (r) => r.instance_name ?? r.instance_id ?? "Not directory-specific" },
                { key: "requests", label: "Requests", render: (r) => num(r.requests) },
                { key: "input_tokens", label: "Input", render: (r) => formatTokens(Number(r.input_tokens)) },
                { key: "output_tokens", label: "Output", render: (r) => formatTokens(Number(r.output_tokens)) },
                { key: "total_tokens", label: "Total", render: (r) => formatTokens(Number(r.total_tokens)) },
                { key: "estimated_cost", label: "Est. cost", render: costCell },
              ]}
            />
          </Panel>

          <Panel title="By provider and model" subtitle="Which models did the work, and whose account they ran on.">
            <DataTable
              emptyMessage="No AI usage in this period."
              rows={modelRows}
              columns={[
                { key: "provider", label: "Provider", render: (r) => providerLabel(r.provider) },
                { key: "model", label: "Model" },
                {
                  key: "connection_source",
                  label: "Account",
                  render: (r) => (r.connection_source === "platform" ? "Layercake's" : "Yours"),
                },
                { key: "requests", label: "Requests", render: (r) => num(r.requests) },
                { key: "total_tokens", label: "Total tokens", render: (r) => formatTokens(Number(r.total_tokens)) },
                { key: "estimated_cost", label: "Est. cost", render: costCell },
              ]}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
