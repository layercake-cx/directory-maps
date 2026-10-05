// AI Gateway -- the single entry point products use for LLM calls.
//
//   const result = await generate(ctx, { system, messages, maxTokens, tools, toolChoice });
//
// Resolves the organisation's provider/model/credentials (resolve.ts), runs the
// provider adapter, records one ai_usage_events row per request (success or
// failure), and returns a provider-neutral result. Products never see
// credentials and never name a provider or model.

import { getAdapter, resolveRoute } from "./resolve.ts";
import {
  AI_PRODUCT_DIRECTORY_MAPS,
  AiCapability,
  AiContext,
  AiScope,
  AiGenerateRequest,
  AiGenerateResult,
  AiAdapterResult,
  AiProviderError,
  AiRoute,
  AiUnavailableError,
  AiUsage,
} from "./types.ts";

export * from "./types.ts";

function estimateCost(route: AiRoute, usage: AiUsage): { cost: number | null; currency: string | null } {
  const row = route.modelRow;
  if (!row || row.price_input_per_mtok == null || row.price_output_per_mtok == null) return { cost: null, currency: null };
  const cost =
    ((usage.inputTokens + usage.cachedInputTokens) * Number(row.price_input_per_mtok) +
      usage.outputTokens * Number(row.price_output_per_mtok)) /
    1_000_000;
  return { cost, currency: row.currency };
}

/** Best-effort: metering must never break the feature that triggered it. */
async function recordUsage(
  ctx: AiContext,
  route: AiRoute,
  usage: AiUsage,
  durationMs: number,
  error: string | null,
): Promise<void> {
  try {
    const { cost, currency } = error ? { cost: null, currency: null } : estimateCost(route, usage);
    const { error: insertErr } = await ctx.db.from("ai_usage_events").insert({
      client_id: ctx.clientId,
      product: ctx.product,
      product_instance_id: ctx.productInstanceId ?? null,
      feature: ctx.feature,
      provider: route.provider,
      model: route.model,
      connection_source: route.source,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cached_input_tokens: usage.cachedInputTokens,
      total_tokens: usage.totalTokens,
      estimated_cost: cost,
      estimated_cost_currency: currency,
      duration_ms: Math.round(durationMs),
      status: error ? "error" : "success",
      error: error ? error.slice(0, 300) : null,
      batch_job_id: ctx.batchJobId ?? null,
    });
    if (insertErr) console.error("ai_usage_events insert failed:", insertErr.message);
  } catch (e) {
    console.error("ai_usage_events insert failed:", e instanceof Error ? e.message : String(e));
  }
}

/** Builds a Directory Maps AI context from a call site's scope plus its feature/capability. */
export function directoryMapsContext(scope: AiScope, feature: string, capability: AiCapability): AiContext {
  return { ...scope, product: AI_PRODUCT_DIRECTORY_MAPS, feature, capability };
}

/** The organisation that owns a directory -- the AI Gateway's tenant key. */
export async function getDirectoryClientId(db: AiScope["db"], directoryId: string): Promise<string> {
  const { data, error } = await db.from("directories").select("client_id").eq("id", directoryId).maybeSingle();
  if (error) throw error;
  if (!data?.client_id) throw new Error("Directory not found");
  return data.client_id as string;
}

/**
 * Response body for a feature that cannot run because no AI provider is
 * usable. Return it with HTTP 200: the client treats `error` as the message to
 * show, whereas a non-2xx would be flattened into a generic failure.
 */
export function aiUnavailableBody(err: AiUnavailableError) {
  return { error: err.message, ai_unavailable: true, ai_unavailable_code: err.code };
}

const EMPTY_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0 };

export async function generate(ctx: AiContext, req: AiGenerateRequest): Promise<AiGenerateResult> {
  const route = await resolveRoute(ctx);

  const adapter = getAdapter(route.provider);
  if (!adapter) {
    throw new AiUnavailableError("provider_unsupported", `The ${route.provider} provider isn't supported yet.`);
  }
  const needsVision = req.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "image"));
  if (needsVision && !adapter.capabilities.vision) {
    throw new AiUnavailableError("capability_unsupported", `${route.provider} models can't describe images, which this feature needs.`);
  }
  if (req.webSearch && !adapter.capabilities.webSearch) {
    throw new AiUnavailableError("capability_unsupported", `${route.provider} doesn't support web search, which this feature uses.`);
  }
  if (req.tools?.length && !adapter.capabilities.tools) {
    throw new AiUnavailableError("capability_unsupported", `${route.provider} doesn't support structured output, which this feature needs.`);
  }

  const started = performance.now();
  let result: AiAdapterResult;
  try {
    result = await adapter.generate(route.apiKey, route.model, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordUsage(ctx, route, EMPTY_USAGE, performance.now() - started, message);
    throw err instanceof AiProviderError ? err : new AiProviderError(message);
  }
  await recordUsage(ctx, route, result.usage, performance.now() - started, null);

  return { ...result, provider: route.provider, model: route.model };
}

/**
 * Returns the input of the named tool call, or throws the same user-meaningful
 * errors the pre-gateway helpers threw for a truncated or missing tool call.
 */
export function requireToolInput(result: AiGenerateResult, toolName?: string): Record<string, unknown> {
  if (result.stopReason === "max_tokens") {
    throw new AiProviderError("AI response was truncated (max_tokens reached) before completing the tool call");
  }
  const call = toolName ? result.toolCalls.find((c) => c.name === toolName) : result.toolCalls[0];
  if (!call) throw new AiProviderError("AI response did not include a valid tool call");
  return call.input;
}
