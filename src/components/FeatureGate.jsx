import React from "react";
import { Navigate } from "react-router-dom";
import { useFeatureFlag } from "../hooks/useFeatureFlags.js";

/**
 * Route guard for feature-flagged pages. While flags are loading it renders
 * nothing (avoids flashing a page that will be redirected away); once known,
 * it renders children when the flag is on, otherwise redirects.
 */
export default function FeatureGate({ flag, redirectTo = "/client", children }) {
  const { enabled, loading } = useFeatureFlag(flag);
  if (loading) return null;
  if (!enabled) return <Navigate to={redirectTo} replace />;
  return children;
}
