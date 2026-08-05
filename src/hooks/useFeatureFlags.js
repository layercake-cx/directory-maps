import { useContext } from "react";
import { FeatureFlagsContext } from "../context/featureFlagsContext.js";

export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) throw new Error("useFeatureFlags must be used within FeatureFlagsProvider");
  return ctx;
}

/** Convenience: returns { enabled, loading } for a single flag key. */
export function useFeatureFlag(key) {
  const { flags, loading } = useFeatureFlags();
  return { enabled: !!flags?.[key], loading };
}
