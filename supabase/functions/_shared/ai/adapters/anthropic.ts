// Anthropic Messages API adapter. The only place that knows Anthropic's wire
// format -- everything above it speaks the provider-neutral types in ../types.ts.

import {
  AiAdapter,
  AiAdapterResult,
  AiContentBlock,
  AiGenerateRequest,
  AiProviderError,
  AiStopReason,
  AiToolCall,
} from "../types.ts";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const WEB_SEARCH_TOOL_TYPE = "web_search_20250305";

function toAnthropicContent(content: string | AiContentBlock[]): unknown {
  if (typeof content === "string") return content;
  const out: unknown[] = [];
  for (const block of content) {
    if (block.type === "text") out.push({ type: "text", text: block.text });
    else if (block.type === "image") {
      out.push({ type: "image", source: { type: "base64", media_type: block.mediaType, data: block.base64 } });
    } else if (block.type === "provider_raw") {
      if (block.provider === "anthropic") out.push(...block.blocks);
    }
  }
  return out;
}

function toStopReason(reason: string | undefined): AiStopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "max_tokens":
      return "max_tokens";
    case "tool_use":
      return "tool";
    case "pause_turn":
      return "pause";
    default:
      return "other";
  }
}

type AnthropicBlock = { type?: string; text?: string; name?: string; input?: unknown };
type AnthropicResponse = {
  stop_reason?: string;
  content?: AnthropicBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

export const anthropicAdapter: AiAdapter = {
  provider: "anthropic",
  capabilities: { tools: true, vision: true, webSearch: true },

  async generate(apiKey: string, model: string, req: AiGenerateRequest): Promise<AiAdapterResult> {
    const tools: unknown[] = (req.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
    if (req.webSearch) {
      tools.unshift({ type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: req.webSearch.maxUses });
    }

    const body: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
    };
    if (tools.length > 0) body.tools = tools;
    if (req.toolChoice) body.tool_choice = req.toolChoice;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": API_VERSION, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AiProviderError(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`, res.status);
    }

    const json = (await res.json()) as AnthropicResponse;
    const blocks = json.content ?? [];
    const toolCalls: AiToolCall[] = blocks
      .filter((b) => b.type === "tool_use" && typeof b.name === "string" && b.input && typeof b.input === "object")
      .map((b) => ({ name: b.name as string, input: b.input as Record<string, unknown> }));
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");

    const u = json.usage ?? {};
    const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    const cachedInputTokens = u.cache_read_input_tokens ?? 0;
    const outputTokens = u.output_tokens ?? 0;

    return {
      text,
      toolCalls,
      stopReason: toStopReason(json.stop_reason),
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens,
        totalTokens: inputTokens + cachedInputTokens + outputTokens,
      },
      rawAssistantContent: blocks,
    };
  },
};
