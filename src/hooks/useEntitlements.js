import { useContext } from "react";
import { EntitlementsContext } from "../context/entitlementsContext.js";

export function useEntitlements() {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error("useEntitlements must be used within EntitlementsProvider");
  return ctx;
}

/** Convenience: returns the resolved entitlement object for a single feature key, plus loading. */
export function useEntitlement(key) {
  const { entitlements, loading } = useEntitlements();
  return { ...(entitlements?.[key] ?? {}), loading };
}
