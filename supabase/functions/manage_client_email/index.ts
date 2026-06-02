import { createServiceClient, requireUser } from "../_shared/supabase.ts";
import {
  extractEmailDomain,
  resendCreateDomain,
  resendGetDomain,
  resendVerifyDomain,
} from "../_shared/resend.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

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

function normalizeClientEmailRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    email_from_name: row.email_from_name ?? null,
    email_from_address: row.email_from_address ?? null,
    email_domain: row.email_domain ?? null,
    resend_domain_id: row.resend_domain_id ?? null,
    email_domain_status: row.email_domain_status ?? "not_configured",
    email_dns_records: row.email_dns_records ?? null,
  };
}

async function syncDomainFromResend(service: ReturnType<typeof createServiceClient>, clientId: string, domainId: string) {
  const remote = await resendGetDomain(domainId);
  const status = typeof remote?.status === "string" ? remote.status : "not_started";
  const records = Array.isArray(remote?.records) ? remote.records : null;
  const name = typeof remote?.name === "string" ? remote.name : null;

  const { data, error } = await service
    .from("clients")
    .update({
      email_domain: name,
      email_domain_status: status,
      email_dns_records: records,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId)
    .select(
      "email_from_name,email_from_address,email_domain,resend_domain_id,email_domain_status,email_dns_records"
    )
    .single();

  if (error) throw error;
  return normalizeClientEmailRow(data as Record<string, unknown>);
}

/**
 * Resend's verify endpoint is async — it queues a background DNS check and
 * returns immediately with just { id }. Status updates arrive via webhook.
 * We don't have a webhook, so we poll GET /domains/{id} until the overall
 * domain status moves away from "not_started", or until we give up.
 *
 * Typical Resend check completes in 3–8 seconds for already-propagated DNS.
 */
async function pollUntilChecked(domainId: string, attempts = 6, intervalMs = 3000): Promise<Record<string, unknown>> {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const remote = await resendGetDomain(domainId) as Record<string, unknown>;
    const status = typeof remote?.status === "string" ? remote.status : "";
    // "not_started" means the check hasn't run yet — keep polling.
    // Any other status (pending, verified, failed) means the check has run.
    if (status && status !== "not_started") return remote;
  }
  // Return whatever we have after exhausting retries.
  return await resendGetDomain(domainId) as Record<string, unknown>;
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
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
    const action = typeof body?.action === "string" ? body.action.trim() : "";

    if (!clientId) return jsonResponse({ error: "Missing clientId." }, 400);
    await requireClientEmailAccess(req, clientId);

    const service = createServiceClient();
    const { data: client, error: clientErr } = await service
      .from("clients")
      .select(
        "id,email_from_name,email_from_address,email_domain,resend_domain_id,email_domain_status,email_dns_records"
      )
      .eq("id", clientId)
      .single();
    if (clientErr || !client) return jsonResponse({ error: "Client not found." }, 404);

    if (action === "save") {
      const fromName = typeof body?.fromName === "string" ? body.fromName.trim() : "";
      const fromAddress = typeof body?.fromAddress === "string" ? body.fromAddress.trim().toLowerCase() : "";
      if (!fromAddress) return jsonResponse({ error: "From email address is required." }, 400);
      const domain = extractEmailDomain(fromAddress);
      if (!domain) return jsonResponse({ error: "Enter a valid email address." }, 400);

      const { data, error } = await service
        .from("clients")
        .update({
          email_from_name: fromName || null,
          email_from_address: fromAddress,
          email_domain: domain,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientId)
        .select(
          "email_from_name,email_from_address,email_domain,resend_domain_id,email_domain_status,email_dns_records"
        )
        .single();
      if (error) throw error;
      return jsonResponse({ ok: true, email: normalizeClientEmailRow(data as Record<string, unknown>) });
    }

    if (action === "setup_domain") {
      const fromAddress =
        (typeof body?.fromAddress === "string" ? body.fromAddress.trim().toLowerCase() : "") ||
        (client.email_from_address as string | null) ||
        "";
      const domain = extractEmailDomain(fromAddress);
      if (!domain) {
        return jsonResponse({ error: "Save a valid From email address first." }, 400);
      }

      let domainId = client.resend_domain_id as string | null;
      if (!domainId || client.email_domain !== domain) {
        const created = await resendCreateDomain(domain);
        domainId = typeof created?.id === "string" ? created.id : null;
        if (!domainId) throw new Error("Resend did not return a domain id.");

        await service
          .from("clients")
          .update({
            email_domain: domain,
            resend_domain_id: domainId,
            email_domain_status: typeof created?.status === "string" ? created.status : "not_started",
            email_dns_records: Array.isArray(created?.records) ? created.records : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId);
      }

      const email = await syncDomainFromResend(service, clientId, domainId);
      return jsonResponse({ ok: true, email });
    }

    if (action === "verify" || action === "refresh") {
      const domainId = client.resend_domain_id as string | null;
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

      // Write whatever Resend now reports back to the DB.
      const status = typeof remote?.status === "string" ? remote.status : "not_started";
      const records = Array.isArray(remote?.records) ? remote.records : null;
      const name = typeof remote?.name === "string" ? remote.name : null;

      const { data, error: dbErr } = await service
        .from("clients")
        .update({
          email_domain: name,
          email_domain_status: status,
          email_dns_records: records,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientId)
        .select("email_from_name,email_from_address,email_domain,resend_domain_id,email_domain_status,email_dns_records")
        .single();
      if (dbErr) throw dbErr;

      return jsonResponse({ ok: true, email: normalizeClientEmailRow(data as Record<string, unknown>) });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Request failed.";
    const status = message === "Not authenticated" ? 401 : message.includes("Access denied") ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
