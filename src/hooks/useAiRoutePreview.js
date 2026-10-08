import { useCallback, useEffect, useState } from "react";
import { invokeGetAiRoutePreview } from "../lib/clientIntegrations.js";

const TTL_MS = 30_000;
const cache = new Map(); // key -> { at, promise }

function keyOf(clientId, directoryId) {
  return `${clientId}:${directoryId ?? ""}`;
}

function load(clientId, directoryId, force) {
  const key = keyOf(clientId, directoryId);
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = invokeGetAiRoutePreview({ clientId, directoryId }).catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/** Drop cached previews, e.g. after connecting a provider or changing model choices. */
export function invalidateAiRoutePreview() {
  cache.clear();
}

/**
 * How each Directory Maps AI feature would run for this organisation right now
 * (provider, model, availability). Shared between components via a short-lived cache.
 */
export function useAiRoutePreview(clientId, directoryId = null) {
  const [state, setState] = useState({ data: null, loading: !!clientId, error: null });

  const refresh = useCallback(
    async (force = false) => {
      if (!clientId) return;
      setState((s) => ({ ...s, loading: true }));
      try {
        const data = await load(clientId, directoryId, force);
        setState({ data, loading: false, error: null });
      } catch (e) {
        setState({ data: null, loading: false, error: e?.message ?? String(e) });
      }
    },
    [clientId, directoryId]
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return { ...state, refresh: () => refresh(true) };
}
