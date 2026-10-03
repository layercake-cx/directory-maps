// Manage messaging profiles (sending identities): create, save, delete, and the
// Resend domain lifecycle (setup_domain / verify / refresh). A profile is a From
// name + address + Resend domain; which profile a map or directory sends through
// is chosen on the map/directory itself. Message text (subject/intro/prompt) is
// NOT managed here -- it lives on the map or directory.
import { errorMessage } from "../_shared/errors.ts";
import { createServiceClient, requireUser } from "../_shared/supabase.ts";
import {
  extractEmailDomain,
  resendCreateDomain,
  resendGetDomain,
  resendListDomains,
  resendVerifyDomain,
} from "../_shared/resend.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const PROFILE_COLUMNS =
  "id,client_id,name,email_from_name,email_from_address,email_domain,resend_domain_id,email_domain_status,email_dns_records";

type Service = ReturnType<typeof createServiceClient>;
type Profile = Record<string, unknown> & { id: string; client_id: string };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function requireClientEmailAccess(req: Request, clientId: string) {
  const user = await requireUser(req);
  const service = createServiceClient();

  const { data: profile } = await service.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role === "admin") return user;

  const { data: contact } = await service
    .from("contacts")
    .select("is_primary, can_manage_maps")
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!contact) throw new Error("Access denied");
  if (!contact.is_primary && !contact.can_manage_maps) {
    throw new Error("You need owner or manage maps permission to configure email.");
  }
  return user;
}

function readResendDomainList(list: unknown): Array<{ id: string; name: string }> {
  if (!list || typeof list !== "object") return [];
  const rows = (list as { data?: unknown }).data;
  return Array.isArray(rows) ? rows as Array<{ id: string; name: string }> : [];
}

function readResendDomainPayload(remote: unknown) {
  if (!remote || typeof remote !== "object") {
    return { name: null, status: "not_started", records: null as unknown[] | null };
  }
  const row = remote as Record<string, unknown>;
  return {
    name: typeof row.name === "string" ? row.name : null,
    status: typeof row.status === "string" ? row.status : "not_started",
    records: Array.isArray(row.records) ? row.records : null,
  };
}

async function writeProfileFields(service: Service, profileId: string, fields: Record<string, unknown>): Promise<Profile> {
  const { data, error } = await service
    .from("messaging_profiles")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return data as Profile;
}

/**
 * Write a Resend domain's state to a profile AND to every other profile of the
 * same client sharing that Resend domain (e.g. info@ and events@), so their
 * verification status never drifts apart.
 */
async function writeDomainState(
  service: Service,
  profile: Profile,
  domainId: string,
  state: { email_domain: string | null; email_domain_status: string; email_dns_records: unknown[] | null },
): Promise<Profile> {
  const now = new Date().toISOString();
  const { error } = await service
    .from("messaging_profiles")
    .update({ ...state, resend_domain_id: domainId, updated_at: now })
    .eq("client_id", profile.client_id)
    .eq("resend_domain_id", domainId)
    .neq("id", profile.id);
  if (error) throw error;
  return await writeProfileFields(service, profile.id, { ...state, resend_domain_id: domainId });
}

async function syncDomainFromResend(service: Service, profile: Profile, domainId: string) {
  let remote = await resendGetDomain(domainId);
  let { name, status, records } = readResendDomainPayload(remote);

  // Resend occasionally returns an empty records array immediately after create/link.
  if (!records?.length) {
    await new Promise((r) => setTimeout(r, 1500));
    remote = await resendGetDomain(domainId);
    ({ name, status, records } = readResendDomainPayload(remote));
  }

  return await writeDomainState(service, profile, domainId, {
    email_domain: name,
    email_domain_status: status,
    email_dns_records: records,
  });
}

/**
 * Resend's verify endpoint is async — it queues a background DNS check and
 * returns immediately with just { id }. Status updates arrive via webhook.
 * We don't have a webhook, so we poll GET /domains/{id} until the overall
 * domain status settles on a terminal state, or until we give up.
 *
 * Resend status lifecycle: not_started → pending → verified | failed | temporary_failure
 * "pending" means Resend's check is still running — we must keep polling through it.
 * Typical check completes in 3–8 seconds for already-propagated DNS.
 */
async function pollUntilChecked(domainId: string, attempts = 8, intervalMs = 3000): Promise<Record<string, unknown>> {
  const terminalStatuses = ["verified", "failed", "temporary_failure"];
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const remote = await resendGetDomain(domainId) as Record<string, unknown>;
    const status = typeof remote?.status === "string" ? remote.status : "";
    if (terminalStatuses.includes(status)) return remote;
  }
  // Return whatever we have after exhausting retries.
  return await resendGetDomain(domainId) as Record<string, unknown>;
}

function readString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const clientId = readString(body?.clientId);
    const action = readString(body?.action);
    const profileId = readString(body?.profileId);

    if (!clientId) return jsonResponse({ error: "Missing clientId." }, 400);
    await requireClientEmailAccess(req, clientId);

    const service = createServiceClient();

    if (action === "create") {
      const name = readString(body?.name);
      const fromName = readString(body?.fromName);
      const fromAddress = readString(body?.fromAddress).toLowerCase();
      if (!name) return jsonResponse({ error: "Profile name is required." }, 400);
      if (!fromAddress) return jsonResponse({ error: "From email address is required." }, 400);
      const domain = extractEmailDomain(fromAddress);
      if (!domain) return jsonResponse({ error: "Enter a valid email address." }, 400);

      // Reuse the domain state of a sibling profile on the same domain.
      const { data: sibling } = await service
        .from("messaging_profiles")
        .select("resend_domain_id,email_domain_status,email_dns_records")
        .eq("client_id", clientId)
        .eq("email_domain", domain)
        .not("resend_domain_id", "is", null)
        .limit(1)
        .maybeSingle();

      const { data, error } = await service
        .from("messaging_profiles")
        .insert({
          client_id: clientId,
          name,
          email_from_name: fromName || null,
          email_from_address: fromAddress,
          email_domain: domain,
          ...(sibling
            ? {
              resend_domain_id: sibling.resend_domain_id,
              email_domain_status: sibling.email_domain_status,
              email_dns_records: sibling.email_dns_records,
            }
            : {}),
        })
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw error;
      return jsonResponse({ ok: true, profile: data });
    }

    // Every other action targets one existing profile of this client.
    if (!profileId) return jsonResponse({ error: "Missing profileId." }, 400);
    const { data: found, error: profileErr } = await service
      .from("messaging_profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", profileId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (profileErr || !found) return jsonResponse({ error: "Messaging profile not found." }, 404);
    const profile = found as Profile;

    if (action === "save") {
      const name = readString(body?.name);
      const fromName = readString(body?.fromName);
      const fromAddress = readString(body?.fromAddress).toLowerCase();
      if (!name) return jsonResponse({ error: "Profile name is required." }, 400);
      if (!fromAddress) return jsonResponse({ error: "From email address is required." }, 400);
      const domain = extractEmailDomain(fromAddress);
      if (!domain) return jsonResponse({ error: "Enter a valid email address." }, 400);

      const fields: Record<string, unknown> = {
        name,
        email_from_name: fromName || null,
        email_from_address: fromAddress,
        email_domain: domain,
      };
      // Changing to a different domain detaches the old Resend domain; the user
      // must run domain setup again for the new one.
      if (profile.email_domain && profile.email_domain !== domain) {
        fields.resend_domain_id = null;
        fields.email_domain_status = "not_configured";
        fields.email_dns_records = null;
      }
      return jsonResponse({ ok: true, profile: await writeProfileFields(service, profile.id, fields) });
    }

    if (action === "delete") {
      // maps/directories.messaging_profile_id is ON DELETE SET NULL, so anything
      // using this profile has messaging blocked until another is chosen.
      const [{ count: mapCount }, { count: directoryCount }] = await Promise.all([
        service.from("maps").select("id", { count: "exact", head: true }).eq("messaging_profile_id", profile.id),
        service.from("directories").select("id", { count: "exact", head: true }).eq("messaging_profile_id", profile.id),
      ]);
      const { error } = await service.from("messaging_profiles").delete().eq("id", profile.id);
      if (error) throw error;
      return jsonResponse({ ok: true, maps_affected: mapCount ?? 0, directories_affected: directoryCount ?? 0 });
    }

    if (action === "setup_domain") {
      const fromAddress = readString(body?.fromAddress).toLowerCase() || (profile.email_from_address as string | null) || "";
      const domain = extractEmailDomain(fromAddress);
      if (!domain) {
        return jsonResponse({ error: "Save a valid From email address first." }, 400);
      }

      let domainId = profile.resend_domain_id as string | null;
      let createPayload: ReturnType<typeof readResendDomainPayload> | null = null;

      if (!domainId || profile.email_domain !== domain) {
        // A sibling profile of this client may already own the Resend domain.
        const { data: sibling } = await service
          .from("messaging_profiles")
          .select("resend_domain_id")
          .eq("client_id", clientId)
          .eq("email_domain", domain)
          .not("resend_domain_id", "is", null)
          .neq("id", profile.id)
          .limit(1)
          .maybeSingle();

        let existingId: string | null = (sibling?.resend_domain_id as string | null) ?? null;
        if (!existingId) {
          try {
            const list = await resendListDomains();
            const match = readResendDomainList(list).find((d) => d.name === domain);
            if (match?.id) existingId = match.id;
          } catch {
            // If listing fails, fall through and attempt creation.
          }
        }

        if (existingId) {
          domainId = existingId;
          createPayload = readResendDomainPayload(await resendGetDomain(existingId));
        } else {
          const created = await resendCreateDomain(domain);
          createPayload = readResendDomainPayload(created);
          domainId = typeof (created as Record<string, unknown>)?.id === "string"
            ? (created as Record<string, unknown>).id as string
            : null;
          if (!domainId) throw new Error("Resend did not return a domain id.");
        }

        await writeDomainState(service, profile, domainId, {
          email_domain: createPayload?.name ?? domain,
          email_domain_status: createPayload?.status ?? "not_started",
          email_dns_records: createPayload?.records ?? null,
        });
      }

      let updated = await syncDomainFromResend(service, profile, domainId!);

      // Resend includes DNS records on create; GET can occasionally return none immediately.
      if (
        createPayload?.records?.length &&
        (!updated.email_dns_records || !Array.isArray(updated.email_dns_records) || updated.email_dns_records.length === 0)
      ) {
        updated = await writeDomainState(service, profile, domainId!, {
          email_domain: createPayload.name ?? domain,
          email_domain_status: createPayload.status,
          email_dns_records: createPayload.records,
        });
      }

      return jsonResponse({ ok: true, profile: updated });
    }

    if (action === "verify" || action === "refresh") {
      const domainId = profile.resend_domain_id as string | null;
      if (!domainId) {
        return jsonResponse({ error: "Set up your domain first." }, 400);
      }

      let remote: Record<string, unknown>;
      if (action === "verify") {
        // Trigger Resend's async DNS check. The response is just { id } — no statuses yet.
        await resendVerifyDomain(domainId);
        // Poll until Resend's check has run (status moves off "not_started"), up to ~18s.
        remote = await pollUntilChecked(domainId);
      } else {
        remote = await resendGetDomain(domainId) as Record<string, unknown>;
      }

      const updated = await writeDomainState(service, profile, domainId, {
        email_domain: typeof remote?.name === "string" ? remote.name : null,
        email_domain_status: typeof remote?.status === "string" ? remote.status : "not_started",
        email_dns_records: Array.isArray(remote?.records) ? remote.records : null,
      });
      return jsonResponse({ ok: true, profile: updated });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    const message = errorMessage(e, "Request failed.");
    const status = message === "Not authenticated" ? 401 : message.includes("Access denied") ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
