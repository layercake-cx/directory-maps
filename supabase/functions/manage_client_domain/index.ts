import { createServiceClient, requireUser } from "../_shared/supabase.ts";
import { resolveTxt } from "../_shared/dns.ts";
import { attachVercelDomain, detachVercelDomain, isVercelDomainConfigured, recommendedRoutingRecord } from "../_shared/vercel.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const BLOCKED_SUFFIXES = ["layercake-cx.biz", "vercel.app", "vercel-dns.com"];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function requireClientDomainAccess(req: Request, clientId: string) {
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
    throw new Error("You need owner or manage maps permission to configure a domain.");
  }
  return user;
}

function normalizeHostname(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function validateHostname(hostname: string): string | null {
  if (!hostname) return "Enter a domain or subdomain.";
  if (!HOSTNAME_RE.test(hostname)) return "Enter a valid domain, e.g. directory.yourcompany.com.";
  if (BLOCKED_SUFFIXES.some((s) => hostname === s || hostname.endsWith(`.${s}`))) {
    return "This domain can't be used — it belongs to Layercake's own infrastructure.";
  }
  return null;
}

function normalizeClientDomainRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    id: row.id,
    client_id: row.client_id,
    map_id: row.map_id,
    hostname: row.hostname,
    status: row.status ?? "pending",
    dns_records: Array.isArray(row.dns_records) ? row.dns_records : [],
    vercel_domain_id: row.vercel_domain_id ?? null,
    ga_measurement_id: row.ga_measurement_id ?? null,
    is_primary: !!row.is_primary,
    verified_at: row.verified_at ?? null,
    created_at: row.created_at,
  };
}

const DOMAIN_COLUMNS =
  "id,client_id,map_id,hostname,status,dns_records,vercel_domain_id,ga_measurement_id,is_primary,verified_at,created_at";

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
    await requireClientDomainAccess(req, clientId);

    const service = createServiceClient();

    if (action === "add") {
      const mapId = typeof body?.mapId === "string" ? body.mapId.trim() : "";
      const hostname = normalizeHostname(typeof body?.hostname === "string" ? body.hostname : "");

      if (!mapId) return jsonResponse({ error: "Choose which map this domain publishes." }, 400);
      const hostnameError = validateHostname(hostname);
      if (hostnameError) return jsonResponse({ error: hostnameError }, 400);

      const allowed = await service.rpc("resolve_custom_domain_entitlement", { p_client_id: clientId });
      if (allowed.error) throw allowed.error;
      if (allowed.data !== true) {
        return jsonResponse(
          { error: "Custom domains require the Professional plan or above. Contact Layercake to upgrade." },
          403,
        );
      }

      const { data: map } = await service.from("maps").select("id").eq("id", mapId).eq("client_id", clientId).maybeSingle();
      if (!map) return jsonResponse({ error: "Map not found." }, 404);

      const { data: existing } = await service
        .from("client_domains")
        .select("id")
        .ilike("hostname", hostname)
        .maybeSingle();
      if (existing) return jsonResponse({ error: "This domain is already registered." }, 409);

      const verifyToken = crypto.randomUUID().replace(/-/g, "");
      const dnsRecords = [
        {
          type: "TXT",
          name: `_lc-domain-verify.${hostname}`,
          value: `lc-domain-verify=${verifyToken}`,
          status: "pending",
        },
        { ...recommendedRoutingRecord(hostname), status: "pending" },
      ];

      const { data, error } = await service
        .from("client_domains")
        .insert({ client_id: clientId, map_id: mapId, hostname, status: "pending", dns_records: dnsRecords })
        .select(DOMAIN_COLUMNS)
        .single();
      if (error) throw error;

      return jsonResponse({ ok: true, domain: normalizeClientDomainRow(data as Record<string, unknown>) });
    }

    if (action === "verify") {
      const domainId = typeof body?.domainId === "string" ? body.domainId.trim() : "";
      if (!domainId) return jsonResponse({ error: "Missing domainId." }, 400);

      const { data: existing, error: findErr } = await service
        .from("client_domains")
        .select(DOMAIN_COLUMNS)
        .eq("id", domainId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!existing) return jsonResponse({ error: "Domain not found." }, 404);

      const records = Array.isArray(existing.dns_records) ? [...existing.dns_records] : [];
      const txtRecord = records.find((r: Record<string, unknown>) => r.type === "TXT");
      const routingRecord = records.find((r: Record<string, unknown>) => r.type !== "TXT");

      const txtVerified = txtRecord
        ? (await resolveTxt(txtRecord.name as string)).includes(txtRecord.value as string)
        : false;
      if (txtRecord) txtRecord.status = txtVerified ? "verified" : "pending";

      // Only attach to Vercel (and check its config) once we've independently
      // proven DNS ownership via our own TXT record — don't let an arbitrary
      // caller register someone else's domain against our project.
      let vercelDomainId = existing.vercel_domain_id as string | null;
      let vercelAttachWarning: string | undefined;
      let routingConfigured: boolean | null = null;
      if (txtVerified) {
        if (!vercelDomainId) {
          const attach = await attachVercelDomain(existing.hostname as string);
          if (attach.attached) vercelDomainId = existing.hostname as string;
          else vercelAttachWarning = attach.error;
        }
        if (vercelDomainId) {
          routingConfigured = await isVercelDomainConfigured(existing.hostname as string);
        }
      }
      if (routingRecord) routingRecord.status = routingConfigured ? "verified" : "pending";

      const allVerified = txtVerified && routingConfigured === true;
      const status = allVerified ? "active" : "verifying";

      const { data, error } = await service
        .from("client_domains")
        .update({
          dns_records: records,
          status,
          vercel_domain_id: vercelDomainId,
          verified_at: allVerified ? new Date().toISOString() : existing.verified_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", domainId)
        .eq("client_id", clientId)
        .select(DOMAIN_COLUMNS)
        .single();
      if (error) throw error;

      const normalized = normalizeClientDomainRow(data as Record<string, unknown>);
      return jsonResponse({
        ok: true,
        domain: vercelAttachWarning ? { ...normalized, vercel_attach_warning: vercelAttachWarning } : normalized,
      });
    }

    if (action === "remove") {
      const domainId = typeof body?.domainId === "string" ? body.domainId.trim() : "";
      if (!domainId) return jsonResponse({ error: "Missing domainId." }, 400);

      const { data: existing } = await service
        .from("client_domains")
        .select("hostname,vercel_domain_id")
        .eq("id", domainId)
        .eq("client_id", clientId)
        .maybeSingle();

      const { error } = await service.from("client_domains").delete().eq("id", domainId).eq("client_id", clientId);
      if (error) throw error;

      if (existing?.vercel_domain_id) {
        await detachVercelDomain(existing.hostname as string);
      }

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Request failed.";
    const status = message === "Not authenticated" ? 401 : message.includes("Access denied") ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
