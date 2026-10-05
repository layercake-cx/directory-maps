// Shared types for the AI Gateway (_shared/ai/). Products ask for a
// *capability* (ECONOMY_MODEL, ...), never a provider or model name; the
// gateway resolves those. See docs/INTEGRATION_ARCHITECTURE.md (AI Gateway).

import { createServiceClient } from "../supabase.ts";

export type ServiceClient = ReturnType<typeof createServiceClient>;

export type AiCapability = "ECONOMY_MODEL" | "FAST_MODEL" | "STANDARD_MODEL" | "ADVANCED_MODEL";

export const AI_PRODUCT_DIRECTORY_MAPS = "directory_maps";

/** Who is asking and why -- drives configuration lookup and usage attribution. */
export type AiContext = {
  db: ServiceClient;
  /** Organisation (tenant) that owns the data and the provider connection. */
  clientId: string;
  product: string;
  /** Stable feature key, e.g. "seo_metadata", "intent_search". */
  feature: string;
  capability: AiCapability;
  /** For Directory Maps, the directory id. */
  productInstanceId?: string | null;
  /** entry_content_jobs.id / entry_seo_metadata_jobs.id for queue-worker calls. */
  batchJobId?: string | null;
};

/** What a call site knows about the request; the helper adds feature + capability. */
export type AiScope = Pick<AiContext, "db" | "clientId" | "productInstanceId" | "batchJobId">;

export type AiToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AiContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; base64: string }
  /**
   * Provider-native assistant content echoed back verbatim (e.g. Anthropic
   * web-search result blocks on a follow-up turn). Only meaningful to the same
   * provider that produced it (AiGenerateResult.rawAssistantContent).
   */
  | { type: "provider_raw"; provider: string; blocks: unknown[] };

export type AiMessage = {
  role: "user" | "assistant";
  content: string | AiContentBlock[];
};

export type AiToolChoice = { type: "auto" } | { type: "any" } | { type: "tool"; name: string };

export type AiGenerateRequest = {
  system: string;
  messages: AiMessage[];
  maxTokens: number;
  tools?: AiToolDef[];
  toolChoice?: AiToolChoice;
  /** Provider-hosted web search. Only some providers support it (see AiAdapter.capabilities). */
  webSearch?: { maxUses: number };
};

export type AiUsage = {
  /** Non-cached input tokens (incl. cache writes). */
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
};

export type AiStopReason = "end" | "max_tokens" | "tool" | "pause" | "other";

export type AiToolCall = { name: string; input: Record<string, unknown> };

/** What an adapter returns -- provider-agnostic. */
export type AiAdapterResult = {
  text: string;
  toolCalls: AiToolCall[];
  stopReason: AiStopReason;
  usage: AiUsage;
  rawAssistantContent: unknown[];
};

export type AiGenerateResult = AiAdapterResult & {
  provider: string;
  model: string;
};

export type AiAdapterCapabilities = { tools: boolean; vision: boolean; webSearch: boolean };

export interface AiAdapter {
  provider: string;
  capabilities: AiAdapterCapabilities;
  generate(apiKey: string, model: string, req: AiGenerateRequest): Promise<AiAdapterResult>;
}

export type AiConnectionSource = "customer" | "platform";

export type AiModelRow = {
  provider: string;
  model_id: string;
  status: string;
  price_input_per_mtok: number | null;
  price_output_per_mtok: number | null;
  currency: string | null;
};

export type AiRoute = {
  provider: string;
  model: string;
  apiKey: string;
  source: AiConnectionSource;
  integrationId: string | null;
  modelRow: AiModelRow | null;
};

export type AiUnavailableCode =
  | "no_connection"
  | "provider_not_connected"
  | "provider_unsupported"
  | "no_model"
  | "model_disabled"
  | "capability_unsupported";

/**
 * Thrown when the gateway cannot route a request (no usable provider
 * connection, model disabled, ...). `message` is safe to show to end users.
 * Callers return it as an "AI unavailable" response rather than a 500.
 */
export class AiUnavailableError extends Error {
  code: AiUnavailableCode;
  constructor(code: AiUnavailableCode, message: string) {
    super(message);
    this.name = "AiUnavailableError";
    this.code = code;
  }
}

/** A provider returned an error or an unusable response. Never contains credentials. */
export class AiProviderError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "AiProviderError";
    this.status = status;
  }
}
