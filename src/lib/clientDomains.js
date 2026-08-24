import { supabase } from "./supabase";
import { invokeEdgeFunction } from "./edgeFunctionFetch.js";

export async function invokeManageClientDomain({ clientId, action, mapId, hostname, domainId }) {
  return invokeEdgeFunction(
    "manage_client_domain",
    { clientId, action, mapId, hostname, domainId },
    { supabase, requireAuth: true }
  );
}

export function domainStatusLabel(status) {
  switch (status) {
    case "active":
      return "Active";
    case "verifying":
      return "Pending DNS";
    case "failed":
      return "Verification failed";
    case "pending":
    default:
      return "Not verified yet";
  }
}

export function domainStatusTone(status) {
  if (status === "active") return "success";
  if (status === "verifying" || status === "pending") return "warning";
  if (status === "failed") return "error";
  return "muted";
}
