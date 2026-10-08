import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";

/**
 * These routes replace outer tabs that were hidden entirely from non-managers before Phase 2
 * (no URL existed to reach them at all). Hiding the nav item is enough to stop normal
 * navigation, but not someone typing the URL directly — this preserves the exact old
 * "not rendered for non-managers" behaviour rather than quietly loosening it.
 */
export default function RequireManage({ children }) {
  const { canManage } = useDirectory();
  if (!canManage) return <p>Only an Owner or Manager can view this.</p>;
  return children;
}
