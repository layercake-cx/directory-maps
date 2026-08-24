/**
 * Central copy for entitlement-gated UI. Update wording — including plan
 * names — here, not in each component that gates a feature. Keyed by
 * features.key (see supabase/migrations/*_entitlement*.sql).
 */
export const ENTITLEMENT_MESSAGES = {
  messaging: {
    blocked: "Messaging requires the Professional plan or above. Contact Layercake to upgrade.",
  },
  custom_domain: {
    blocked: "Custom domains require the Professional plan or above. Contact Layercake to upgrade.",
  },
  max_maps: {
    label: "maps",
    limitReached: (used, limit) =>
      `Map limit reached (${used}/${limit}). Upgrade your plan to add more maps.`,
  },
};

const DEFAULT_BLOCKED_MESSAGE = "This feature isn't included in your current plan. Contact Layercake to upgrade.";

/** Full-block message for EntitlementGate (a feature the plan doesn't include at all). */
export function getBlockedMessage(featureKey) {
  return ENTITLEMENT_MESSAGES[featureKey]?.blocked ?? DEFAULT_BLOCKED_MESSAGE;
}

/** Label for EntitlementUsageHint's "X of Y <label> used" line. */
export function getUsageLabel(featureKey, fallback = "used") {
  return ENTITLEMENT_MESSAGES[featureKey]?.label ?? fallback;
}

/** Message shown once a volume/metered feature is at its limit. */
export function getLimitReachedMessage(featureKey, used, limit) {
  const fn = ENTITLEMENT_MESSAGES[featureKey]?.limitReached;
  return fn ? fn(used, limit) : `Limit reached (${used}/${limit}). Upgrade your plan for more.`;
}
