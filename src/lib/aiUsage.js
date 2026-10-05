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
