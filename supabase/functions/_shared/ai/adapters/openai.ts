// OpenAI Chat Completions adapter. Maps the provider-neutral request in
// ../types.ts onto OpenAI's wire format. Not yet exercised against the live
// API in CI -- the Integrations "Test connection" action is the first real call,
// so a changed endpoint or model id surfaces there with a clear error.

import {
  AiAdapter,
  AiAdapterResult,
  AiContentBlock,
  AiGenerateRequest,
  AiProviderError,
  AiStopReason,
  AiToolCall,
} from "../types.ts";

const API_URL = "https://api.openai.com/v1/chat/completions";

function toOpenAiContent(content: string | AiContentBlock[]): unknown {
  if (typeof content === "string") return content;
  const parts: unknown[] = [];
  for (const block of content) {
    if (block.type === "text") parts.push({ type: "text", text: block.text });
    else if (block.type === "image") {
      parts.push({ type: "image_url", image_url: { url: `data:${block.mediaType};base64,${block.base64}` } });
    }
    // provider_raw blocks are provider-specific echoes (e.g. web search); not applicable here.
  }
  return parts;
}

function toStopReason(reason: string | undefined, hasToolCalls: boolean): AiStopReason {
  if (reason === "length") return "max_tokens";
  if (reason === "tool_calls" || hasToolCalls) return "tool";
  if (reason === "stop") return "end";
  return "other";
}

type OpenAiResponse = {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: { function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
};

export const openaiAdapter: AiAdapter = {
  provider: "openai",
  capabilities: { tools: true, vision: true, webSearch: false },

  async generate(apiKey: string, model: string, req: AiGenerateRequest): Promise<AiAdapterResult> {
    const body: Record<string, unknown> = {
      model,
      max_completion_tokens: req.maxTokens,
      messages: [
        { role: "system", content: req.system },
        ...req.messages.map((m) => ({ role: m.role, content: toOpenAiContent(m.content) })),
      ],
    };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));
      if (req.toolChoice) {
        body.tool_choice = req.toolChoice.type === "tool"
          ? { type: "function", function: { name: req.toolChoice.name } }
          : req.toolChoice.type === "any"
          ? "required"
          : "auto";
      }
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AiProviderError(`OpenAI API error ${res.status}: ${text.slice(0, 500)}`, res.status);
    }

    const json = (await res.json()) as OpenAiResponse;
    const choice = json.choices?.[0];
    const toolCalls: AiToolCall[] = [];
    for (const call of choice?.message?.tool_calls ?? []) {
      const name = call.function?.name;
      if (!name) continue;
      try {
        const input = JSON.parse(call.function?.arguments ?? "{}");
        if (input && typeof input === "object") toolCalls.push({ name, input });
      } catch {
        // Malformed arguments (usually truncation): surfaced by requireToolInput as "no valid tool call".
      }
    }

    const u = json.usage ?? {};
    const cachedInputTokens = u.prompt_tokens_details?.cached_tokens ?? 0;
    const inputTokens = Math.max(0, (u.prompt_tokens ?? 0) - cachedInputTokens);
    const outputTokens = u.completion_tokens ?? 0;

    return {
      text: choice?.message?.content ?? "",
      toolCalls,
      stopReason: toStopReason(choice?.finish_reason, toolCalls.length > 0),
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens,
        totalTokens: inputTokens + cachedInputTokens + outputTokens,
      },
      rawAssistantContent: [],
    };
  },
};
