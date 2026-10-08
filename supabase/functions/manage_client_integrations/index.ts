// Manage an organisation's connected AI providers (Integrations -> AI providers).
//
// Body: { clientId, action, provider?, apiKey? }
//   list        -> { integrations: [{ id, provider, status, key_hint, last_tested_at, last_error }] }
//   connect     -> tests the key first, stores it in Vault only if the test passes
//   replace     -> same as connect for an already-connected provider (new key)
//   test        -> re-tests the stored key; always HTTP 200 with { ok, error? }
//   disconnect  -> deletes the Vault secret and the connection
//   save_model_config -> { scope: "default" | "feature", feature?, provider?, useRecommended?, model? }
//                        chooses which connected provider/model an AI feature uses ("" provider =
//                        automatic). Models are advisory-only: any active catalogue model may be chosen.
//
// API keys are write-only: they go into Vault via service-role RPCs and are
// never returned, logged or placed in admin event meta. Only a last-four hint
// is ever shown. Auth: platform admin, or an organisation owner/manager/primary
// contact (or a contact with "manage maps").
import { errorMessage } from "../_shared/errors.ts";
import { createServiceClient, requireUser } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";
import { SUPPORTED_AI_PROVIDERS } from "../_shared/ai/resolve.ts";
import { AI_FEATURES, isAiFeatureKey } from "../_shared/ai/features.ts";
import { AI_PRODUCT_DIRECTORY_MAPS } from "../_shared/ai/types.ts";
import { testProviderKey } from "../_shared/ai/testConnection.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

type Service = ReturnType<typeof createServiceClient>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function requireIntegrationsAccess(req: Request, clientId: string) {
  const user = await requireUser(req);
  const service = createServiceClient();

  const { data: profile } = await service.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role === "admin") return user;

  const { data: contact } = await service
    .from("contacts")
    .select("is_primary, can_manage_maps, role")
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!contact) throw new Error("Access denied");
  const role = typeof contact.role === "string" ? contact.role : "";
  if (!contact.is_primary && !contact.can_manage_maps && role !== "owner" && role !== "manager") {
    throw new Error("You need owner or manage maps permission to manage integrations.");
  }
  return user;
}

async function listIntegrations(service: Service, clientId: string) {
  const { data, error } = await service
    .from("integrations")
    .select("id, provider, status, last_tested_at, last_error, created_at, integration_credentials(key_hint)")
    .eq("client_id", clientId)
    .eq("integration_type", "ai")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const cred = Array.isArray(row.integration_credentials) ? row.integration_credentials[0] : row.integration_credentials;
    return {
      id: row.id,
      provider: row.provider,
      status: row.status,
      key_hint: cred?.key_hint ?? null,
      last_tested_at: row.last_tested_at,
      last_error: row.last_error,
    };
  });
}

async function findIntegration(service: Service, clientId: string, provider: string) {
  const { data, error } = await service
    .from("integrations")
    .select("id")
    .eq("client_id", clientId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

/**
 * Upserts (or clears) the organisation's model choice. scope "default" is the
 * organisation-wide provider choice (product/feature NULL); scope "feature" is a
 * Directory Maps feature row. The unique index is over coalesced scope columns,
 * so this does select-then-write rather than an ON CONFLICT upsert.
 */
async function saveModelConfig(service: Service, clientId: string, body: Record<string, unknown>) {
  const scope = readString(body.scope);
  const feature = readString(body.feature);
  const provider = readString(body.provider).toLowerCase();
  const model = readString(body.model);
  const isDefault = scope === "default";
  // The organisation default only picks a provider; a model is always per feature.
  const useRecommended = isDefault ? true : body.useRecommended !== false;

  if (!isDefault && scope !== "feature") return jsonResponse({ error: "Unknown scope." }, 400);
  if (!isDefault && !isAiFeatureKey(feature)) return jsonResponse({ error: "Unknown AI feature." }, 400);

  let integrationId: string | null = null;
  if (provider) {
    if (!SUPPORTED_AI_PROVIDERS.includes(provider)) return jsonResponse({ error: "Choose a supported AI provider." }, 400);
    const { data, error } = await service
      .from("integrations")
      .select("id")
      .eq("client_id", clientId)
      .eq("provider", provider)
      .eq("status", "connected")
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonResponse({ error: "Connect this provider before choosing it." }, 400);
    integrationId = data.id as string;
  }
  if (!useRecommended) {
    if (!provider || !model) return jsonResponse({ error: "Choose a provider and a model." }, 400);
    const { data, error } = await service
      .from("ai_models")
      .select("status")
      .eq("provider", provider)
      .eq("model_id", model)
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonResponse({ error: "That model isn't in the supported list." }, 400);
    if (data.status === "disabled") return jsonResponse({ error: "That model is temporarily unavailable." }, 400);
  }

  const product = isDefault ? null : AI_PRODUCT_DIRECTORY_MAPS;
  const featureKey = isDefault ? null : feature;
  let find = service.from("ai_model_configuration").select("id").eq("client_id", clientId).is("product_instance_id", null);
  find = product === null ? find.is("product", null) : find.eq("product", product);
  find = featureKey === null ? find.is("feature", null) : find.eq("feature", featureKey);
  const { data: existing, error: findErr } = await find.maybeSingle();
  if (findErr) throw findErr;

  // Automatic + recommended is the absence of a row.
  if (!provider && useRecommended) {
    if (existing) {
      const { error } = await service.from("ai_model_configuration").delete().eq("id", existing.id);
      if (error) throw error;
    }
    return jsonResponse({ ok: true, config: null });
  }

  const row = {
    client_id: clientId,
    product,
    product_instance_id: null,
    feature: featureKey,
    capability: featureKey ? AI_FEATURES[featureKey as keyof typeof AI_FEATURES].capability : null,
    integration_id: integrationId,
    provider: provider || null,
    model: useRecommended ? null : model,
    use_recommended: useRecommended,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await service.from("ai_model_configuration").update(row).eq("id", existing.id)
    : await service.from("ai_model_configuration").insert(row);
  if (error) throw error;
  return jsonResponse({ ok: true, config: { feature: featureKey, provider: row.provider, model: row.model, use_recommended: useRecommended } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  let apiKey = "";
  try {
    const body = await req.json().catch(() => ({}));
    const clientId = readString(body?.clientId);
    const action = readString(body?.action);
    const provider = readString(body?.provider).toLowerCase();
    apiKey = readString(body?.apiKey);

    if (!clientId) return jsonResponse({ error: "Missing clientId." }, 400);
    await requireIntegrationsAccess(req, clientId);
    const service = createServiceClient();

    if (action === "list") {
      return jsonResponse({ ok: true, integrations: await listIntegrations(service, clientId) });
    }

    if (action === "save_model_config") {
      return await saveModelConfig(service, clientId, body);
    }

    if (!SUPPORTED_AI_PROVIDERS.includes(provider)) {
      return jsonResponse({ error: "Choose a supported AI provider." }, 400);
    }

    if (action === "connect" || action === "replace") {
      if (!apiKey) return jsonResponse({ error: "Enter an API key." }, 400);
      if (apiKey.length > 500) return jsonResponse({ error: "That doesn't look like an API key." }, 400);
      const existing = await findIntegration(service, clientId, provider);
      if (action === "replace" && !existing) return jsonResponse({ error: "This provider isn't connected." }, 404);

      // Test before storing: a key that doesn't work is never saved.
      const result = await testProviderKey(service, provider, apiKey);
      if (!result.ok) return jsonResponse({ error: result.error }, 400);

      const now = new Date().toISOString();
      let integrationId = existing?.id;
      if (integrationId) {
        const { error } = await service
          .from("integrations")
          .update({ status: "connected", last_tested_at: now, last_error: null, updated_at: now })
          .eq("id", integrationId);
        if (error) throw error;
      } else {
        const { data, error } = await service
          .from("integrations")
          .insert({ client_id: clientId, integration_type: "ai", provider, status: "connected", last_tested_at: now })
          .select("id")
          .single();
        if (error) throw error;
        integrationId = data.id as string;
      }
      const { error: storeErr } = await service.rpc("store_integration_secret", {
        p_integration_id: integrationId,
        p_secret: apiKey,
        p_hint: apiKey.slice(-4),
      });
      if (storeErr) {
        // Don't leave a "connected" row with no key behind.
        if (!existing) await service.from("integrations").delete().eq("id", integrationId);
        throw storeErr;
      }
      const integrations = await listIntegrations(service, clientId);
      return jsonResponse({ ok: true, integration: integrations.find((i) => i.id === integrationId), model: result.model });
    }

    const existing = await findIntegration(service, clientId, provider);
    if (!existing) return jsonResponse({ error: "This provider isn't connected." }, 404);

    if (action === "test") {
      const { data: secret, error: secretErr } = await service.rpc("read_integration_secret", { p_integration_id: existing.id });
      if (secretErr) throw secretErr;
      const now = new Date().toISOString();
      if (!secret) {
        const message = "No API key is stored for this connection. Replace the key.";
        await service.from("integrations").update({ status: "error", last_tested_at: now, last_error: message, updated_at: now }).eq("id", existing.id);
        return jsonResponse({ ok: false, test_error: message, integrations: await listIntegrations(service, clientId) });
      }
      const result = await testProviderKey(service, provider, secret as string);
      await service
        .from("integrations")
        .update(
          result.ok
            ? { status: "connected", last_tested_at: now, last_error: null, updated_at: now }
            : { status: "error", last_tested_at: now, last_error: result.error, updated_at: now },
        )
        .eq("id", existing.id);
      return jsonResponse({
        ok: result.ok,
        test_error: result.ok ? null : result.error,
        integrations: await listIntegrations(service, clientId),
      });
    }

    if (action === "disconnect") {
      const { error: delSecretErr } = await service.rpc("delete_integration_secret", { p_integration_id: existing.id });
      if (delSecretErr) throw delSecretErr;
      const { error } = await service.from("integrations").delete().eq("id", existing.id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (e) {
    // Never echo or log the submitted key.
    let message = errorMessage(e, "Request failed.");
    if (apiKey) message = message.split(apiKey).join("[redacted]");
    console.error("manage_client_integrations:", message);
    if (message !== "Not authenticated" && !message.includes("Access denied")) {
      await logEdgeFunctionError({ fn: "manage_client_integrations", message });
    }
    const status = message === "Not authenticated" ? 401 : message.includes("Access denied") ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
