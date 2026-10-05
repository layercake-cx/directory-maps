import { supabase } from "./supabase";
import { invokeEdgeFunction } from "./edgeFunctionFetch.js";

/**
 * AI provider connection actions on the manage_client_integrations Edge Function.
 * action: list | connect | replace | test | disconnect. API keys are write-only: they are
 * sent once on connect/replace and never returned (only a last-four hint is).
 */
export async function invokeManageClientIntegrations({ clientId, action, provider, apiKey }) {
  return invokeEdgeFunction(
    "manage_client_integrations",
    { clientId, action, provider, apiKey },
    { supabase, requireAuth: true }
  );
}

/** Providers a customer can connect, in display order. Links are to each provider's own pages. */
export const AI_PROVIDERS = [
  {
    id: "anthropic",
    label: "Anthropic",
    models: "Claude",
    keyUrl: "https://console.anthropic.com/settings/keys",
    pricingUrl: "https://www.anthropic.com/pricing",
    keyPlaceholder: "sk-ant-…",
  },
  {
    id: "openai",
    label: "OpenAI",
    models: "GPT",
    keyUrl: "https://platform.openai.com/api-keys",
    pricingUrl: "https://openai.com/api/pricing",
    keyPlaceholder: "sk-…",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    models: "Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    keyPlaceholder: "AIza…",
  },
];

export function integrationStatusLabel(status) {
  switch (status) {
    case "connected":
      return "Connected";
    case "error":
      return "Connection error";
    default:
      return "Not connected";
  }
}

export function integrationStatusTone(status) {
  if (status === "connected") return "success";
  if (status === "error") return "error";
  return "muted";
}

/** Read-only preview of how each AI feature would run for the organisation right now. */
export async function invokeGetAiRoutePreview({ clientId, directoryId }) {
  return invokeEdgeFunction("get_ai_route_preview", { clientId, directoryId }, { supabase, requireAuth: true });
}

/**
 * Choose which connected provider/model an AI feature uses.
 * scope "default": organisation-wide provider ("" = automatic). scope "feature": one Directory Maps feature.
 */
export async function invokeSaveModelConfig({ clientId, scope, feature, provider, useRecommended, model }) {
  return invokeEdgeFunction(
    "manage_client_integrations",
    { clientId, action: "save_model_config", scope, feature, provider, useRecommended, model },
    { supabase, requireAuth: true }
  );
}

const COST_TIER_LABELS = { 1: "Very low cost", 2: "Low cost", 3: "Higher cost", 4: "Premium" };

/** £ / ££ / £££ / ££££ for a model's cost tier (1-4). */
export function costTierSymbol(tier) {
  return "£".repeat(Math.min(Math.max(Number(tier) || 1, 1), 4));
}

export function costTierLabel(tier) {
  return COST_TIER_LABELS[tier] ?? "";
}

/**
 * Advice (never a block) about a model choice for a capability. Returns null when the choice is fine.
 * `recommended` is the catalogue row of Layercake's recommended model for this provider + capability.
 */
export function modelAdvisory(model, capability, recommended) {
  if (!model) return null;
  if (model.status === "deprecated") return "This model is deprecated and may be removed. Consider switching.";
  if (model.status === "disabled") return "This model is temporarily unavailable.";
  const suitable = Array.isArray(model.recommended_for) && model.recommended_for.includes(capability);
  if (!suitable && recommended && model.cost_tier > recommended.cost_tier) {
    return "Not recommended for this task: this model is considerably more expensive than required, and is unlikely to materially improve the result.";
  }
  return null;
}
