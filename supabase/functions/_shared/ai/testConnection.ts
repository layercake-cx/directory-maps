// Connection test for a provider API key: one minimal generation on the
// organisation's recommended economy model. Confirms the key is valid, the
// provider is reachable and the model is accessible. Never returns provider
// error text (some providers echo key fragments) -- only curated messages.

import { getAdapter, providerLabel } from "./resolve.ts";
import { AiProviderError, ServiceClient } from "./types.ts";

export type ConnectionTestResult = { ok: true; model: string } | { ok: false; error: string };

export async function testProviderKey(
  db: ServiceClient,
  provider: string,
  apiKey: string,
): Promise<ConnectionTestResult> {
  const adapter = getAdapter(provider);
  if (!adapter) return { ok: false, error: `${providerLabel(provider)} isn't supported yet.` };

  const { data: profile } = await db
    .from("ai_capability_profiles")
    .select("model_id")
    .eq("capability", "ECONOMY_MODEL")
    .eq("provider", provider)
    .maybeSingle();
  if (!profile?.model_id) return { ok: false, error: `No model is configured for ${providerLabel(provider)} yet.` };
  const model = profile.model_id as string;

  try {
    await adapter.generate(apiKey, model, {
      system: "Reply with the single word OK.",
      messages: [{ role: "user", content: "Connection test." }],
      maxTokens: 64,
    });
    return { ok: true, model };
  } catch (err) {
    const status = err instanceof AiProviderError ? err.status : null;
    const label = providerLabel(provider);
    if (status === 401 || status === 403) return { ok: false, error: `${label} rejected this API key. Check it was copied in full and has API access.` };
    if (status === 404) return { ok: false, error: `The key was accepted but can't access ${model}. Check the key's model permissions.` };
    if (status === 429) return { ok: false, error: `${label} says this key is rate limited or out of quota. Check billing on your ${label} account.` };
    if (status != null && status >= 500) return { ok: false, error: `${label} is having problems right now. Try again shortly.` };
    if (status != null) return { ok: false, error: `${label} returned an error (HTTP ${status}).` };
    return { ok: false, error: `Couldn't reach ${label}. Try again shortly.` };
  }
}
