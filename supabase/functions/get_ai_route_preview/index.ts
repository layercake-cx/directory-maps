// Read-only preview of how each Directory Maps AI feature would run for an
// organisation right now: which provider and model, whether it is available at
// all, and why not. Uses the AI Gateway's own route planner (no credentials are
// read), so what the UI shows is exactly what a real request would do.
//
// Body: { clientId, directoryId? }
// Auth: platform admin, or any contact of the organisation (entry editors need to
// know whether "Generate with AI" will work).
// Returns: { features: [...], connected_providers, catalogue, profiles, config }
import { errorMessage } from "../_shared/errors.ts";
import { createServiceClient, requireUser } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";
import { AI_FEATURES, AI_FEATURE_KEYS } from "../_shared/ai/features.ts";
import { AiUnavailableError, directoryMapsContext } from "../_shared/ai/gateway.ts";
import { planRoute } from "../_shared/ai/resolve.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function requireClientMember(req: Request, clientId: string) {
  const user = await requireUser(req);
  const service = createServiceClient();
  const { data: profile } = await service.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role === "admin") return;
  const { data: contact } = await service
    .from("contacts")
    .select("id")
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!contact) throw new Error("Access denied");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    const body = await req.json().catch(() => ({}));
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
    const directoryId = typeof body?.directoryId === "string" && body.directoryId.trim() ? body.directoryId.trim() : null;
    if (!clientId) return jsonResponse({ error: "Missing clientId." }, 400);
    await requireClientMember(req, clientId);

    const db = createServiceClient();
    const platformKeyPresent = !!Deno.env.get("ANTHROPIC_API_KEY");

    const features = [];
    for (const key of AI_FEATURE_KEYS) {
      const def = AI_FEATURES[key];
      const base = { key, label: def.label, description: def.description, capability: def.capability, recommendation: def.recommendation };
      try {
        const plan = await planRoute(directoryMapsContext({ db, clientId, productInstanceId: directoryId }, key));
        if (plan.source === "platform" && !platformKeyPresent) {
          features.push({
            ...base,
            available: false,
            code: "no_connection",
            message: "AI features aren't currently available because an AI provider hasn't been connected for this organisation.",
          });
          continue;
        }
        const row = plan.modelRow;
        features.push({
          ...base,
          available: true,
          source: plan.source,
          provider: plan.provider,
          model: plan.model,
          price_input_per_mtok: row?.price_input_per_mtok ?? null,
          price_output_per_mtok: row?.price_output_per_mtok ?? null,
          currency: row?.currency ?? null,
        });
      } catch (e) {
        if (!(e instanceof AiUnavailableError)) throw e;
        features.push({ ...base, available: false, code: e.code, message: e.message });
      }
    }

    const [{ data: integrations }, { data: catalogue }, { data: profiles }, { data: configRows }] = await Promise.all([
      db.from("integrations").select("provider").eq("client_id", clientId).eq("integration_type", "ai").eq("status", "connected"),
      db
        .from("ai_models")
        .select("provider, model_id, label, cost_tier, capabilities, recommended_for, status, guidance, price_input_per_mtok, price_output_per_mtok, currency")
        .order("provider")
        .order("cost_tier"),
      db.from("ai_capability_profiles").select("capability, provider, model_id, rationale"),
      db
        .from("ai_model_configuration")
        .select("product, feature, provider, model, use_recommended")
        .eq("client_id", clientId)
        .is("product_instance_id", null),
    ]);

    const config: { default: unknown; features: Record<string, unknown> } = { default: null, features: {} };
    for (const row of configRows ?? []) {
      if (row.product === null && row.feature === null) config.default = row;
      else if (row.product === "directory_maps" && row.feature) config.features[row.feature as string] = row;
    }

    return jsonResponse({
      ok: true,
      features,
      connected_providers: (integrations ?? []).map((i) => i.provider),
      catalogue: catalogue ?? [],
      profiles: profiles ?? [],
      config,
    });
  } catch (e) {
    const message = errorMessage(e, "Request failed.");
    console.error("get_ai_route_preview:", message);
    if (message !== "Not authenticated" && !message.includes("Access denied")) {
      await logEdgeFunctionError({ fn: "get_ai_route_preview", message });
    }
    const status = message === "Not authenticated" ? 401 : message.includes("Access denied") ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
