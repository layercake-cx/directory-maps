// Shared messaging helpers: resolve a map's or directory's messaging settings
// and the From header of its chosen sending profile.
//
// Messaging is "ready" only when the toggle is on, a messaging profile is
// chosen, and the client's "messaging" entitlement resolves true. There is no
// fallback for "no profile" -- sending is blocked until one is chosen.
import { createServiceClient } from "./supabase.ts";
import { buildFromHeader, parsePlatformFrom } from "./resend.ts";

export type MessagingEntity = {
  clientId: string;
  profileId: string | null;
  enabled: boolean;
  testMode: boolean;
  testRecipient: string;
  prompt: string | null;
  subject: string | null;
  intro: string | null;
};

type ServiceClient = ReturnType<typeof createServiceClient>;

const COLUMNS =
  "client_id, messaging_profile_id, messaging_enabled, email_test_mode, email_test_recipient, message_prompt, message_subject, message_intro";

function readEntity(row: Record<string, unknown>): MessagingEntity {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    clientId: String(row.client_id),
    profileId: str(row.messaging_profile_id),
    enabled: row.messaging_enabled === true,
    testMode: row.email_test_mode !== false,
    testRecipient: (str(row.email_test_recipient) ?? "").trim(),
    prompt: str(row.message_prompt),
    subject: str(row.message_subject),
    intro: str(row.message_intro),
  };
}

export async function loadMapMessaging(service: ServiceClient, mapId: string): Promise<MessagingEntity | null> {
  const { data } = await service.from("maps").select(COLUMNS).eq("id", mapId).maybeSingle();
  return data ? readEntity(data as Record<string, unknown>) : null;
}

export async function loadDirectoryMessaging(service: ServiceClient, directoryId: string): Promise<MessagingEntity | null> {
  const { data } = await service.from("directories").select(COLUMNS).eq("id", directoryId).maybeSingle();
  return data ? readEntity(data as Record<string, unknown>) : null;
}

/** Returns a human-readable reason messaging is blocked, or null when ready to send. */
export async function messagingBlockedReason(
  service: ServiceClient,
  entity: MessagingEntity,
  noun: "map" | "directory",
): Promise<string | null> {
  if (!entity.profileId) return `Messaging is not set up for this ${noun}: no sending profile has been chosen.`;
  if (!entity.enabled) return `Messaging is not enabled for this ${noun}.`;
  const { data: entitled } = await service.rpc("resolve_messaging_entitlement", { p_client_id: entity.clientId });
  if (entitled !== true) return `Messaging is not available on this organisation's plan.`;
  return null;
}

/**
 * From header for a profile. A verified domain sends from the profile's own
 * address; otherwise the platform address is used with the profile's display
 * name (same behaviour as the old per-client settings).
 */
export async function resolveProfileFrom(service: ServiceClient, profileId: string, clientId: string): Promise<string> {
  const { name: platformName, email: platformEmail } = parsePlatformFrom();
  const fallbackName = platformName || "Layercake Maps";

  const { data: profile } = await service
    .from("messaging_profiles")
    .select("email_from_name, email_from_address, email_domain_status")
    .eq("id", profileId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (
    profile?.email_domain_status === "verified" &&
    typeof profile.email_from_address === "string" &&
    profile.email_from_address.trim()
  ) {
    return buildFromHeader(profile.email_from_name, profile.email_from_address);
  }
  const displayName = (profile?.email_from_name as string | null | undefined)?.trim() || fallbackName;
  return buildFromHeader(displayName, platformEmail);
}
