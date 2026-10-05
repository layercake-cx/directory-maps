// Run: deno test --allow-env supabase/functions/_shared/ai/gateway_test.ts
// Exercises route resolution, platform-fallback gating and usage metering with
// an in-memory fake of the Supabase client and a stubbed fetch -- no network.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { AiScope, AiUnavailableError, directoryMapsContext, generate } from "./gateway.ts";

type Row = Record<string, unknown>;

/** Minimal chainable stand-in for the bits of supabase-js the gateway uses. */
function fakeDb(tables: Record<string, Row[]>, secrets: Record<string, string> = {}) {
  const inserted: Record<string, Row[]> = {};
  function from(table: string) {
    const filters: [string, unknown][] = [];
    const builder = {
      select: () => builder,
      or: () => builder, // scope filtering is done by the gateway's own specificity()
      order: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return builder;
      },
      insert: (row: Row) => {
        (inserted[table] ??= []).push(row);
        return Promise.resolve({ error: null });
      },
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: rows(), error: null }),
    };
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
    return builder;
  }
  const rpc = (name: string, args: { p_integration_id: string }) =>
    Promise.resolve({ data: name === "read_integration_secret" ? (secrets[args.p_integration_id] ?? null) : null, error: null });
  // deno-lint-ignore no-explicit-any
  return { db: { from, rpc } as any, inserted };
}

const MODELS: Row[] = [
  { provider: "anthropic", model_id: "claude-haiku-4-5", status: "active", price_input_per_mtok: null, price_output_per_mtok: null, currency: null },
  { provider: "anthropic", model_id: "claude-sonnet-5-5", status: "active", price_input_per_mtok: 3, price_output_per_mtok: 15, currency: "USD" },
  { provider: "anthropic", model_id: "claude-opus-5-5", status: "disabled", price_input_per_mtok: null, price_output_per_mtok: null, currency: null },
];
const PROFILES: Row[] = [
  { capability: "ECONOMY_MODEL", provider: "anthropic", model_id: "claude-haiku-4-5" },
  { capability: "FAST_MODEL", provider: "anthropic", model_id: "claude-haiku-4-5" },
];

function tablesWith(extra: Record<string, Row[]> = {}) {
  return {
    ai_models: MODELS,
    ai_capability_profiles: PROFILES,
    feature_flags: [{ key: "ai_platform_provider", default_enabled: false }],
    feature_flag_overrides: [],
    integrations: [],
    ai_model_configuration: [],
    ...extra,
  };
}

function stubFetch(body: unknown, status = 200) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

const OK_RESPONSE = {
  stop_reason: "tool_use",
  content: [{ type: "tool_use", name: "t", input: { html: "<p>x</p>" } }],
  usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 },
};

const REQ = { system: "s", messages: [{ role: "user" as const, content: "hi" }], maxTokens: 10 };

function scope(db: AiScope["db"]): AiScope {
  return { db, clientId: "c1", productInstanceId: "dir1", batchJobId: "00000000-0000-0000-0000-000000000001" };
}

Deno.test("platform key is used only while the ai_platform_provider flag is on, and usage is metered", async () => {
  Deno.env.set("ANTHROPIC_API_KEY", "platform-key");
  const { db, inserted } = fakeDb(tablesWith({ feature_flag_overrides: [{ client_id: "c1", flag_key: "ai_platform_provider", enabled: true }] }));
  const f = stubFetch(OK_RESPONSE);
  try {
    const res = await generate(directoryMapsContext(scope(db), "seo_metadata", "ECONOMY_MODEL"), REQ);
    assertEquals(f.calls[0].headers["x-api-key"], "platform-key");
    assertEquals(f.calls[0].body.model, "claude-haiku-4-5");
    assertEquals(res.toolCalls[0].input, { html: "<p>x</p>" });

    const ev = inserted["ai_usage_events"][0];
    assertEquals(ev.connection_source, "platform");
    assertEquals(ev.client_id, "c1");
    assertEquals(ev.product, "directory_maps");
    assertEquals(ev.product_instance_id, "dir1");
    assertEquals(ev.feature, "seo_metadata");
    assertEquals(ev.input_tokens, 105); // input + cache writes
    assertEquals(ev.cached_input_tokens, 10);
    assertEquals(ev.output_tokens, 40);
    assertEquals(ev.total_tokens, 155);
    assertEquals(ev.status, "success");
    assertEquals(ev.batch_job_id, "00000000-0000-0000-0000-000000000001");
    assertEquals(ev.estimated_cost, null); // haiku has no price set
  } finally {
    f.restore();
  }
});

Deno.test("no customer connection and flag off -> AiUnavailableError, no provider call", async () => {
  const { db, inserted } = fakeDb(tablesWith());
  const f = stubFetch(OK_RESPONSE);
  try {
    const err = await assertRejects(
      () => generate(directoryMapsContext(scope(db), "seo_metadata", "ECONOMY_MODEL"), REQ),
      AiUnavailableError,
    );
    assertEquals(err.code, "no_connection");
    assertEquals(f.calls.length, 0);
    assertEquals(inserted["ai_usage_events"], undefined);
  } finally {
    f.restore();
  }
});

Deno.test("a connected customer integration wins over the platform key and uses the stored secret", async () => {
  Deno.env.set("ANTHROPIC_API_KEY", "platform-key");
  const { db, inserted } = fakeDb(
    tablesWith({
      integrations: [{ id: "i1", client_id: "c1", integration_type: "ai", status: "connected", provider: "anthropic" }],
      feature_flag_overrides: [{ client_id: "c1", flag_key: "ai_platform_provider", enabled: true }],
    }),
    { i1: "customer-key" },
  );
  const f = stubFetch(OK_RESPONSE);
  try {
    await generate(directoryMapsContext(scope(db), "intent_search", "FAST_MODEL"), REQ);
    assertEquals(f.calls[0].headers["x-api-key"], "customer-key");
    assertEquals(inserted["ai_usage_events"][0].connection_source, "customer");
  } finally {
    f.restore();
  }
});

Deno.test("most specific configuration wins: feature override beats product default", async () => {
  const { db } = fakeDb(
    tablesWith({
      integrations: [{ id: "i1", client_id: "c1", integration_type: "ai", status: "connected", provider: "anthropic" }],
      ai_model_configuration: [
        { client_id: "c1", product: "directory_maps", product_instance_id: null, feature: null, provider: "anthropic", model: "claude-opus-5-5", integration_id: "i1", use_recommended: false },
        { client_id: "c1", product: "directory_maps", product_instance_id: null, feature: "seo_metadata", provider: "anthropic", model: "claude-sonnet-5-5", integration_id: "i1", use_recommended: false },
      ],
    }),
    { i1: "customer-key" },
  );
  const f = stubFetch(OK_RESPONSE);
  try {
    await generate(directoryMapsContext(scope(db), "seo_metadata", "ECONOMY_MODEL"), REQ);
    assertEquals(f.calls[0].body.model, "claude-sonnet-5-5");
  } finally {
    f.restore();
  }
});

Deno.test("a disabled model is refused", async () => {
  const { db } = fakeDb(
    tablesWith({
      integrations: [{ id: "i1", client_id: "c1", integration_type: "ai", status: "connected", provider: "anthropic" }],
      ai_model_configuration: [
        { client_id: "c1", product: "directory_maps", product_instance_id: null, feature: null, provider: "anthropic", model: "claude-opus-5-5", integration_id: "i1", use_recommended: false },
      ],
    }),
    { i1: "customer-key" },
  );
  const err = await assertRejects(
    () => generate(directoryMapsContext(scope(db), "seo_metadata", "ECONOMY_MODEL"), REQ),
    AiUnavailableError,
  );
  assertEquals(err.code, "model_disabled");
});

Deno.test("provider errors are rethrown and metered as failed requests", async () => {
  Deno.env.set("ANTHROPIC_API_KEY", "platform-key");
  const { db, inserted } = fakeDb(tablesWith({ feature_flag_overrides: [{ client_id: "c1", flag_key: "ai_platform_provider", enabled: true }] }));
  const f = stubFetch("overloaded", 529);
  try {
    await assertRejects(() => generate(directoryMapsContext(scope(db), "seo_metadata", "ECONOMY_MODEL"), REQ), Error, "529");
    const ev = inserted["ai_usage_events"][0];
    assertEquals(ev.status, "error");
    assertEquals(ev.total_tokens, 0);
    assert(String(ev.error).includes("529"));
    assert(!JSON.stringify(ev).includes("platform-key"));
  } finally {
    f.restore();
  }
});
