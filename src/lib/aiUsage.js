import { supabase } from "./supabase";

/** Rough size of an AI run, used only to describe it ("Light", "Moderate", "Heavy"). */
export function usageBand(totalTokens) {
  if (totalTokens == null) return null;
  if (totalTokens < 200_000) return "Light";
  if (totalTokens < 2_000_000) return "Moderate";
  return "Heavy";
}

/**
 * Average tokens per request for a feature, from this organisation's own usage history
 * (this directory first, then any directory). Null when there is no history to base an estimate on.
 */
export async function fetchAverageTokens(clientId, directoryId, feature) {
  async function sample(scopeToDirectory) {
    let q = supabase
      .from("ai_usage_events")
      .select("input_tokens, cached_input_tokens, output_tokens")
      .eq("client_id", clientId)
      .eq("feature", feature)
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(100);
    if (scopeToDirectory) q = q.eq("product_instance_id", directoryId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }
  try {
    let rows = directoryId ? await sample(true) : [];
    if (rows.length < 5) rows = await sample(false);
    if (rows.length === 0) return null;
    const avg = (k) => rows.reduce((sum, r) => sum + (r[k] ?? 0), 0) / rows.length;
    return {
      sample: rows.length,
      input: avg("input_tokens") + avg("cached_input_tokens"),
      output: avg("output_tokens"),
    };
  } catch {
    return null;
  }
}

/** Estimated provider cost for `count` requests, or null unless both the history and model prices are known. */
export function estimateRunCost(plan, avgTokens, count) {
  if (!plan || !avgTokens || plan.price_input_per_mtok == null || plan.price_output_per_mtok == null) return null;
  const cost =
    (avgTokens.input * count * Number(plan.price_input_per_mtok) + avgTokens.output * count * Number(plan.price_output_per_mtok)) /
    1_000_000;
  return { amount: cost, currency: plan.currency ?? "" };
}

export function formatTokens(n) {
  if (n == null) return "–";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

export function formatMoney(amount, currency) {
  if (amount == null) return null;
  const digits = amount < 1 ? 3 : 2;
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "";
  return `${symbol}${amount.toFixed(digits)}${symbol ? "" : currency ? ` ${currency}` : ""}`;
}

/** Latest bulk run summary: failed jobs, first failure reason, tokens and estimated cost. target: "content" | "seo". */
export async function getAiBulkRunSummary(directoryId, target) {
  const { data, error } = await supabase.rpc("get_ai_bulk_run_summary", { p_directory_id: directoryId, p_target: target });
  if (error) throw error;
  return data;
}

/** Re-queue the failed jobs from the latest bulk run. Returns how many were re-queued. */
export async function retryFailedBulkJobs(directoryId, target) {
  const fn = target === "content" ? "retry_failed_entry_content_jobs" : "retry_failed_entry_seo_metadata_jobs";
  const { data, error } = await supabase.rpc(fn, { p_directory_id: directoryId });
  if (error) throw error;
  return data ?? 0;
}

// ---- Usage dashboard (Integrations -> AI usage) -------------------------------------------------

/** Display names for the AI features and products that appear in ai_usage_events. */
export const AI_FEATURE_LABELS = {
  seo_metadata: "SEO & social metadata",
  alt_text: "Image alt text",
  intent_search: "Help me choose (search)",
  content_generation: "Listing content",
  content_page_draft: "Content page drafts",
};
export const AI_PRODUCT_LABELS = { directory_maps: "Directory Maps" };

export const USAGE_PERIODS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
];

const DAY_MS = 86_400_000;
const utcMidnight = (y, m, d) => new Date(Date.UTC(y, m, d));

/** [since, until) in UTC for a usage period. Days are bucketed in UTC to match the database. */
export function usagePeriodRange(period, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const tomorrow = utcMidnight(y, m, d + 1);
  switch (period) {
    case "7d":
      return { since: utcMidnight(y, m, d - 6), until: tomorrow };
    case "90d":
      return { since: utcMidnight(y, m, d - 89), until: tomorrow };
    case "this_month":
      return { since: utcMidnight(y, m, 1), until: tomorrow };
    case "last_month":
      return { since: utcMidnight(y, m - 1, 1), until: utcMidnight(y, m, 1) };
    case "30d":
    default:
      return { since: utcMidnight(y, m, d - 29), until: tomorrow };
  }
}

/** One entry per UTC day in [since, until), so empty days show as zero rather than being skipped. */
export function fillUsageDays(byDay, since, until) {
  const lookup = new Map((byDay ?? []).map((r) => [r.day, r]));
  const out = [];
  for (let t = since.getTime(); t < until.getTime(); t += DAY_MS) {
    const iso = new Date(t).toISOString().slice(0, 10);
    const row = lookup.get(iso);
    out.push({
      day: iso,
      label: new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
      tokens: row?.total_tokens ?? 0,
      requests: row?.requests ?? 0,
    });
  }
  return out;
}

/** Layercake-attributable AI usage for an organisation (see get_ai_usage_summary). */
export async function getAiUsageSummary({ clientId, since, until, directoryId = null, provider = null }) {
  const { data, error } = await supabase.rpc("get_ai_usage_summary", {
    p_client_id: clientId,
    p_since: since.toISOString(),
    p_until: until.toISOString(),
    p_directory_id: directoryId,
    p_provider: provider,
  });
  if (error) throw error;
  return data;
}
