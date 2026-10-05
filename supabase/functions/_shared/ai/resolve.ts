// Route resolution for the AI Gateway: organisation -> connected providers ->
// configuration (most specific wins) -> capability -> provider -> model ->
// credentials. There is no silent fallback to Layercake's own AI account: the
// platform key is used only while the `ai_platform_provider` feature flag is
// on for the organisation (see 20261005120000_integrations_ai_gateway.sql).

import { resolveFeatureFlag } from "../featureFlags.ts";
import { anthropicAdapter } from "./adapters/anthropic.ts";
import { AiAdapter, AiContext, AiModelRow, AiRoute, AiUnavailableError } from "./types.ts";

export const PLATFORM_AI_FLAG = "ai_platform_provider";

const ADAPTERS: Record<string, AiAdapter> = {
  anthropic: anthropicAdapter,
};

export function getAdapter(provider: string): AiAdapter | null {
  return ADAPTERS[provider] ?? null;
}

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Google Gemini",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

type ConfigRow = {
  product: string | null;
  product_instance_id: string | null;
  feature: string | null;
  provider: string | null;
  model: string | null;
  integration_id: string | null;
  use_recommended: boolean;
};

type IntegrationRow = { id: string; provider: string };

/**
 * Specificity of a configuration row for this request, or -1 if it does not
 * apply. Instance > feature > product, so the order of precedence is
 * (product, instance, feature) > (product, instance) > (product, feature) >
 * product > organisation default (all scope columns NULL).
 */
function specificity(row: ConfigRow, ctx: AiContext): number {
  if (row.product !== null && row.product !== ctx.product) return -1;
  if (row.product_instance_id !== null && row.product_instance_id !== (ctx.productInstanceId ?? null)) return -1;
  if (row.feature !== null && row.feature !== ctx.feature) return -1;
  return (row.product !== null ? 1 : 0) + (row.feature !== null ? 2 : 0) + (row.product_instance_id !== null ? 4 : 0);
}

async function loadModelRow(ctx: AiContext, provider: string, modelId: string): Promise<AiModelRow | null> {
  const { data } = await ctx.db
    .from("ai_models")
    .select("provider, model_id, status, price_input_per_mtok, price_output_per_mtok, currency")
    .eq("provider", provider)
    .eq("model_id", modelId)
    .maybeSingle();
  return (data as AiModelRow | null) ?? null;
}

async function recommendedModel(ctx: AiContext, provider: string): Promise<string | null> {
  const { data } = await ctx.db
    .from("ai_capability_profiles")
    .select("model_id")
    .eq("capability", ctx.capability)
    .eq("provider", provider)
    .maybeSingle();
  return data?.model_id ?? null;
}

export async function resolveRoute(ctx: AiContext): Promise<AiRoute> {
  const [{ data: configRows, error: cfgErr }, { data: integrationRows, error: intErr }] = await Promise.all([
    ctx.db
      .from("ai_model_configuration")
      .select("product, product_instance_id, feature, provider, model, integration_id, use_recommended")
      .eq("client_id", ctx.clientId)
      .or(`product.is.null,product.eq.${ctx.product}`),
    ctx.db
      .from("integrations")
      .select("id, provider")
      .eq("client_id", ctx.clientId)
      .eq("integration_type", "ai")
      .eq("status", "connected")
      .order("created_at", { ascending: true }),
  ]);
  if (cfgErr) throw cfgErr;
  if (intErr) throw intErr;

  const config = ((configRows ?? []) as ConfigRow[])
    .map((row) => ({ row, score: specificity(row, ctx) }))
    .filter((c) => c.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.row;

  const connected = (integrationRows ?? []) as IntegrationRow[];
  const usable = connected.filter((i) => getAdapter(i.provider));

  // Which connected integration does the configuration point at?
  let integration: IntegrationRow | undefined;
  if (config?.integration_id) integration = usable.find((i) => i.id === config.integration_id);
  if (!integration && config?.provider) integration = usable.find((i) => i.provider === config.provider);
  const configNamesProvider = !!(config?.integration_id || config?.provider);
  if (!integration && !configNamesProvider) integration = usable[0];

  if (integration) {
    const manual = config && !config.use_recommended && config.model && config.provider === integration.provider;
    const modelId = manual ? (config!.model as string) : await recommendedModel(ctx, integration.provider);
    if (!modelId) {
      throw new AiUnavailableError(
        "no_model",
        `No recommended ${providerLabel(integration.provider)} model is configured for this feature yet.`,
      );
    }
    const modelRow = await loadModelRow(ctx, integration.provider, modelId);
    if (modelRow?.status === "disabled") {
      throw new AiUnavailableError(
        "model_disabled",
        `The selected AI model (${modelId}) is temporarily unavailable. Choose another model in Integrations.`,
      );
    }
    const { data: secret, error: secretErr } = await ctx.db.rpc("read_integration_secret", { p_integration_id: integration.id });
    if (secretErr) throw secretErr;
    if (!secret) {
      throw new AiUnavailableError(
        "provider_not_connected",
        `The ${providerLabel(integration.provider)} connection has no stored API key. Replace the key in Integrations.`,
      );
    }
    return {
      provider: integration.provider,
      model: modelId,
      apiKey: secret as string,
      source: "customer",
      integrationId: integration.id,
      modelRow,
    };
  }

  // No usable customer connection. Layercake's own account only if explicitly allowed.
  if (await resolveFeatureFlag(ctx.db, ctx.clientId, PLATFORM_AI_FLAG)) {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
    const modelId = await recommendedModel(ctx, "anthropic");
    if (!modelId) throw new AiUnavailableError("no_model", "No recommended AI model is configured for this feature yet.");
    return {
      provider: "anthropic",
      model: modelId,
      apiKey,
      source: "platform",
      integrationId: null,
      modelRow: await loadModelRow(ctx, "anthropic", modelId),
    };
  }

  if (configNamesProvider) {
    const named = config?.provider ?? "the selected provider";
    throw new AiUnavailableError(
      "provider_not_connected",
      `The AI provider chosen for this feature (${providerLabel(named)}) isn't connected for this organisation.`,
    );
  }
  throw new AiUnavailableError(
    "no_connection",
    "AI features aren't currently available because an AI provider hasn't been connected for this organisation.",
  );
}
