// Google Gemini generateContent adapter. Maps the provider-neutral request in
// ../types.ts onto the Gemini REST format. Not yet exercised against the live
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

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function toGeminiParts(content: string | AiContentBlock[]): unknown[] {
  if (typeof content === "string") return [{ text: content }];
  const parts: unknown[] = [];
  for (const block of content) {
    if (block.type === "text") parts.push({ text: block.text });
    else if (block.type === "image") parts.push({ inlineData: { mimeType: block.mediaType, data: block.base64 } });
  }
  return parts;
}

function toStopReason(reason: string | undefined, hasToolCalls: boolean): AiStopReason {
  if (reason === "MAX_TOKENS") return "max_tokens";
  if (hasToolCalls) return "tool";
  if (reason === "STOP") return "end";
  return "other";
}

type GeminiResponse = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; functionCall?: { name?: string; args?: unknown } }[] };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
};

export const geminiAdapter: AiAdapter = {
  provider: "gemini",
  capabilities: { tools: true, vision: true, webSearch: false },

  async generate(apiKey: string, model: string, req: AiGenerateRequest): Promise<AiAdapterResult> {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: toGeminiParts(m.content),
      })),
      generationConfig: { maxOutputTokens: req.maxTokens },
    };
    if (req.tools?.length) {
      body.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          })),
        },
      ];
      if (req.toolChoice) {
        const mode = req.toolChoice.type === "auto" ? "AUTO" : "ANY";
        body.toolConfig = {
          functionCallingConfig: {
            mode,
            ...(req.toolChoice.type === "tool" ? { allowedFunctionNames: [req.toolChoice.name] } : {}),
          },
        };
      }
    }

    const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AiProviderError(`Gemini API error ${res.status}: ${text.slice(0, 500)}`, res.status);
    }

    const json = (await res.json()) as GeminiResponse;
    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const toolCalls: AiToolCall[] = parts
      .filter((p) => p.functionCall?.name && p.functionCall.args && typeof p.functionCall.args === "object")
      .map((p) => ({ name: p.functionCall!.name as string, input: p.functionCall!.args as Record<string, unknown> }));
    const text = parts.filter((p) => typeof p.text === "string").map((p) => p.text).join("");

    const u = json.usageMetadata ?? {};
    const cachedInputTokens = u.cachedContentTokenCount ?? 0;
    const inputTokens = Math.max(0, (u.promptTokenCount ?? 0) - cachedInputTokens);
    // Thinking tokens are billed as output.
    const outputTokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);

    return {
      text,
      toolCalls,
      stopReason: toStopReason(candidate?.finishReason, toolCalls.length > 0),
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
