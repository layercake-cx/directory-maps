import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FeatureFlagsContext } from "./featureFlagsContext.js";
import { useAuth } from "../hooks/useAuth.js";
import { fetchMyFeatureFlags } from "../lib/featureFlags.js";

/**
 * Loads the current user's resolved feature flags once per session (and on
 * auth change) and exposes them to the tree. Fails closed: if resolution
 * errors, flags are empty so in-development features stay hidden.
 */
export function FeatureFlagsProvider({ children }) {
  const { isAuthed, user } = useAuth();
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!isAuthed) {
      setFlags({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const resolved = await fetchMyFeatureFlags();
      setFlags(resolved);
    } catch {
      setFlags({});
    } finally {
      setLoading(false);
    }
  }, [isAuthed]);

  useEffect(() => {
    reload();
  }, [reload, user?.id]);

  const value = useMemo(() => ({ flags, loading, reload }), [flags, loading, reload]);

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}
