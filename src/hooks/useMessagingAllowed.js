import { useEffect, useState } from "react";
import { useEntitlement } from "./useEntitlements.js";
import { fetchClientEntitlements } from "../lib/entitlements.js";

/**
 * UX gate for the "messaging" plan entitlement. Client portal resolves its own
 * (self-scoped) entitlement; admin resolves the arbitrary customer via the
 * admin-only get_client_entitlements() RPC. Real enforcement is server-side
 * (map/directory_messaging_settings, send_contact_message).
 */
export function useMessagingAllowed(clientId, eventSource) {
  const isClientPortal = eventSource === "client_portal";
  const { enabled: mine, loading: mineLoading } = useEntitlement("messaging");
  const [clientEnabled, setClientEnabled] = useState(null); // null = loading

  useEffect(() => {
    if (isClientPortal || !clientId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await fetchClientEntitlements(clientId);
        if (!cancelled) setClientEnabled(resolved?.messaging?.enabled === true);
      } catch {
        // Fail open on a lookup error — UX gate only.
        if (!cancelled) setClientEnabled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isClientPortal, clientId]);

  return {
    allowed: isClientPortal ? !!mine : !!clientEnabled,
    loading: isClientPortal ? mineLoading : clientEnabled === null,
  };
}
