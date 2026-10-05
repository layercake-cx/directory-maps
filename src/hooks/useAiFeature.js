import { useContext } from "react";
import { DirectoryContext } from "../context/directoryContext.js";
import { useAiRoutePreview } from "./useAiRoutePreview.js";

/**
 * Whether one AI feature can run for the current directory's organisation, and why not.
 * Optimistic while loading or if the check itself fails -- the server is the real gate, this
 * only lets the UI explain a missing provider up front instead of after a failed click.
 * Safe outside a DirectoryProvider (returns available).
 */
export function useAiFeature(featureKey) {
  const ctx = useContext(DirectoryContext);
  const clientId = ctx?.clientId ?? null;
  const { data, loading } = useAiRoutePreview(clientId, ctx?.directoryId ?? null);
  const plan = data?.features?.find((f) => f.key === featureKey) ?? null;
  return {
    loading,
    available: loading || !plan ? true : plan.available,
    message: plan && !plan.available ? plan.message : null,
    plan,
    catalogue: data?.catalogue ?? [],
    clientId,
    directoryId: ctx?.directoryId ?? null,
    integrationsHref: ctx?.isAdminView && clientId ? `/admin/clients/${encodeURIComponent(clientId)}/integrations` : "/client/integrations",
  };
}
