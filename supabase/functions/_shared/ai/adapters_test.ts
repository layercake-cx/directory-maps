// Run: deno test --allow-env supabase/functions/_shared/ai/adapters_test.ts
// Verifies the OpenAI and Gemini adapters build the expected provider request and
// normalise the response/usage, plus the connection-test error mapping. These
// assert our reading of each vendor's documented format; the first live call is
// the Integrations "Test connection" button.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { openaiAdapter } from "./adapters/openai.ts";
import { geminiAdapter } from "./adapters/gemini.ts";
import { testProviderKey } from "./testConnection.ts";

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function stubFetch(body: unknown, status = 200) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

const TOOL = { name: "write", description: "d", inputSchema: { type: "object", properties: { html: { type: "string" } }, required: ["html"] } };

Deno.test("openai: maps tools, forced tool choice, images and usage", async () => {
  const f = stubFetch({
    choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ function: { name: "write", arguments: '{"html":"<p>x</p>"}' } }] } }],
    usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 20 } },
  });
  try {
    const res = await openaiAdapter.generate("sk-test", "gpt-6-luna", {
      system: "sys",
      maxTokens: 50,
      tools: [TOOL],
      toolChoice: { type: "tool", name: "write" },
      messages: [{ role: "user", content: [{ type: "image", mediaType: "image/png", base64: "AAAA" }, { type: "text", text: "hi" }] }],
    });
    const call = f.calls[0];
    assertEquals(call.url, "https://api.openai.com/v1/chat/completions");
    assertEquals(call.headers.Authorization, "Bearer sk-test");
    assertEquals(call.body.max_completion_tokens, 50);
    assertEquals(call.body.reasoning_effort, "none"); // required for function tools on chat completions
    assertEquals(call.body.tool_choice, { type: "function", function: { name: "write" } });
    const msgs = call.body.messages as { role: string; content: unknown }[];
    assertEquals(msgs[0], { role: "system", content: "sys" });
    assertEquals((msgs[1].content as { type: string }[])[0].type, "image_url");
    assertEquals(res.toolCalls[0], { name: "write", input: { html: "<p>x</p>" } });
    assertEquals(res.stopReason, "tool");
    assertEquals(res.usage, { inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, totalTokens: 150 });
  } finally {
    f.restore();
  }
});

Deno.test("openai: no reasoning_effort is sent for plain text requests", async () => {
  const f = stubFetch({ choices: [{ finish_reason: "stop", message: { content: "OK" } }], usage: {} });
  try {
    await openaiAdapter.generate("k", "m", { system: "s", maxTokens: 8, messages: [{ role: "user", content: "x" }] });
    assertEquals("reasoning_effort" in f.calls[0].body, false);
  } finally {
    f.restore();
  }
});

Deno.test("openai: 'any' tool choice -> required; truncation -> max_tokens", async () => {
  const f = stubFetch({ choices: [{ finish_reason: "length", message: { content: "partial" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  try {
    const res = await openaiAdapter.generate("k", "m", { system: "s", maxTokens: 1, tools: [TOOL], toolChoice: { type: "any" }, messages: [{ role: "user", content: "x" }] });
    assertEquals(f.calls[0].body.tool_choice, "required");
    assertEquals(res.stopReason, "max_tokens");
    assertEquals(res.text, "partial");
  } finally {
    f.restore();
  }
});

Deno.test("gemini: maps system, roles, function calling and usage (thinking counts as output)", async () => {
  const f = stubFetch({
    candidates: [{ finishReason: "STOP", content: { parts: [{ functionCall: { name: "write", args: { html: "<p>y</p>" } } }] } }],
    usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 40, cachedContentTokenCount: 50, thoughtsTokenCount: 10 },
  });
  try {
    const res = await geminiAdapter.generate("g-key", "gemini-3.5-flash-lite", {
      system: "sys",
      maxTokens: 64,
      tools: [TOOL],
      toolChoice: { type: "tool", name: "write" },
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: "a" },
        { role: "user", content: [{ type: "image", mediaType: "image/jpeg", base64: "BBBB" }] },
      ],
    });
    const call = f.calls[0];
    assertEquals(call.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    assertEquals(call.headers["x-goog-api-key"], "g-key");
    assertEquals(call.body.systemInstruction, { parts: [{ text: "sys" }] });
    assertEquals((call.body.contents as { role: string }[]).map((c) => c.role), ["user", "model", "user"]);
    assertEquals((call.body.toolConfig as { functionCallingConfig: unknown }).functionCallingConfig, { mode: "ANY", allowedFunctionNames: ["write"] });
    assertEquals(res.toolCalls[0], { name: "write", input: { html: "<p>y</p>" } });
    assertEquals(res.stopReason, "tool");
    assertEquals(res.usage, { inputTokens: 150, cachedInputTokens: 50, outputTokens: 50, totalTokens: 250 });
  } finally {
    f.restore();
  }
});

/** Fake db that only answers the capability-profile lookup used by testProviderKey. */
function profileDb(modelId: string | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: modelId ? { model_id: modelId } : null, error: null }),
  };
  // deno-lint-ignore no-explicit-any
  return { from: () => builder } as any;
}

Deno.test("testProviderKey: success, and curated errors that never echo provider text", async () => {
  const ok = stubFetch({ choices: [{ finish_reason: "stop", message: { content: "OK" } }], usage: {} });
  try {
    assertEquals(await testProviderKey(profileDb("gpt-6-luna"), "openai", "sk-secret"), { ok: true, model: "gpt-6-luna" });
  } finally {
    ok.restore();
  }

  const bad = stubFetch({ error: { message: "Incorrect API key provided: sk-sec***" } }, 401);
  try {
    const res = await testProviderKey(profileDb("gpt-6-luna"), "openai", "sk-secret");
    assert(!res.ok);
    assert(res.error.includes("rejected this API key"));
    assert(!res.error.includes("sk-sec"));
  } finally {
    bad.restore();
  }

  const missing = stubFetch({}, 404);
  try {
    const res = await testProviderKey(profileDb("gpt-6-luna"), "openai", "k");
    assert(!res.ok && res.error.includes("can't access gpt-6-luna"));
  } finally {
    missing.restore();
  }

  const noModel = await testProviderKey(profileDb(null), "openai", "k");
  assert(!noModel.ok);
  const unsupported = await testProviderKey(profileDb("x"), "nope", "k");
  assert(!unsupported.ok);
});
