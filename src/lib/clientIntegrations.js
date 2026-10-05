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
