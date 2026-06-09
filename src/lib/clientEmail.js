import { supabase } from "./supabase";
import { invokeEdgeFunction } from "./edgeFunctionFetch.js";

export async function invokeManageClientEmail({ clientId, action, fromName, fromAddress }) {
  return invokeEdgeFunction(
    "manage_client_email",
    { clientId, action, fromName, fromAddress },
    { supabase, requireAuth: true }
  );
}

export function emailDomainStatusLabel(status) {
  switch (status) {
    case "verified":
      return "Verified";
    case "pending":
      return "Pending DNS";
    case "not_started":
      return "DNS not verified yet";
    case "failed":
    case "temporary_failure":
      return "Verification failed";
    case "not_configured":
    default:
      return "Not set up";
  }
}

export function emailDomainStatusTone(status) {
  if (status === "verified") return "success";
  if (status === "pending" || status === "not_started") return "warning";
  if (status === "failed" || status === "temporary_failure") return "error";
  return "muted";
}

/** Matches RESEND_FROM in Supabase secrets; override with VITE_PLATFORM_FROM at build time. */
export function getPlatformDefaultFromAddress() {
  const configured = import.meta.env.VITE_PLATFORM_FROM?.trim();
  if (configured) return configured;
  return "Layercake Maps <noreply@layercake-cx.biz>";
}
