/**
 * Whether the current user/client has subscription-level access (publish, embed).
 * Stripe subscriptions are not wired yet; invoice clients use subscription_active_override on clients.
 */
export function hasSubscriptionAccess({ client, userEmail } = {}) {
  if (client?.subscription_active_override) return true;

  const emailDomain = (userEmail ?? "").split("@")[1] ?? "";
  if (emailDomain.toLowerCase().includes("layercake")) return true;

  return false;
}
