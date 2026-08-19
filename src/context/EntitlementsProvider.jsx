import React, { useCallback, useEffect, useMemo, useState } from "react";
import { EntitlementsContext } from "./entitlementsContext.js";
import { useAuth } from "../hooks/useAuth.js";
import { fetchMyEntitlements } from "../lib/entitlements.js";

/**
 * Loads the current user's resolved entitlements once per session (and on
 * auth change) and exposes them to the tree. Fails closed: if resolution
 * errors, entitlements are empty so gated capability stays hidden/blocked.
 */
export function EntitlementsProvider({ children }) {
  const { isAuthed, user } = useAuth();
  const [entitlements, setEntitlements] = useState({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!isAuthed) {
      setEntitlements({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const resolved = await fetchMyEntitlements();
      setEntitlements(resolved);
    } catch {
      setEntitlements({});
    } finally {
      setLoading(false);
    }
  }, [isAuthed]);

  useEffect(() => {
    reload();
  }, [reload, user?.id]);

  const value = useMemo(
    () => ({ entitlements, loading, reload }),
    [entitlements, loading, reload]
  );

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}
