const RESEND_API = "https://api.resend.com";

export type ResendDnsRecord = {
  record?: string;
  name?: string;
  type?: string;
  value?: string;
  priority?: number | string;
  ttl?: string;
  status?: string;
};

export function getResendApiKey(): string {
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  return key;
}

/**
 * Returns the API key for domain-management operations (create/verify domains).
 * Resend restricts these to full-access keys; sending-only keys return
 * "This API key is restricted to only send emails".
 *
 * Set RESEND_ADMIN_API_KEY to a full-access Resend key.
 * Falls back to RESEND_API_KEY so existing single-key setups keep working
 * (as long as that key has full access).
 */
export function getResendAdminApiKey(): string {
  const key = Deno.env.get("RESEND_ADMIN_API_KEY") ?? Deno.env.get("RESEND_API_KEY") ?? "";
  if (!key) throw new Error("RESEND_ADMIN_API_KEY (or RESEND_API_KEY) is not configured.");
  return key;
}

export function getPlatformFrom(): string {
  const from = Deno.env.get("RESEND_FROM") ?? "";
  if (!from) throw new Error("RESEND_FROM is not configured.");
  return from;
}

/** Parses RESEND_FROM into its name and email parts. */
export function parsePlatformFrom(): { name: string; email: string } {
  const from = getPlatformFrom();
  const match = from.match(/^(.+?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: "", email: from.trim() };
}

export function extractEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) return null;
  const domain = trimmed.slice(at + 1);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) return null;
  return domain;
}

export function buildFromHeader(fromName: string | null | undefined, fromEmail: string): string {
  const email = fromEmail.trim();
  const name = (fromName || "").trim();
  if (!name) return email;
  return `${name} <${email}>`;
}

async function resendFetch(path: string, init: RequestInit = {}, apiKey?: string) {
  const key = apiKey ?? getResendApiKey();
  const res = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      (data && typeof data.message === "string" && data.message) ||
      (data && typeof data.error === "string" && data.error) ||
      text ||
      res.statusText;
    throw new Error(msg);
  }
  return data;
}

/** Domain management — requires a full-access Resend key (RESEND_ADMIN_API_KEY). */
export function getResendDomainRegion(): string {
  // Default to eu-west-1 (Ireland) for EU data residency.
  // Override by setting RESEND_DOMAIN_REGION in Supabase secrets.
  return Deno.env.get("RESEND_DOMAIN_REGION") ?? "eu-west-1";
}

export async function resendCreateDomain(name: string) {
  return await resendFetch("/domains", {
    method: "POST",
    body: JSON.stringify({ name, region: getResendDomainRegion() }),
  }, getResendAdminApiKey());
}

export async function resendListDomains() {
  return await resendFetch("/domains", { method: "GET" }, getResendAdminApiKey());
}

export async function resendGetDomain(domainId: string) {
  return await resendFetch(`/domains/${encodeURIComponent(domainId)}`, { method: "GET" }, getResendAdminApiKey());
}

export async function resendVerifyDomain(domainId: string) {
  return await resendFetch(`/domains/${encodeURIComponent(domainId)}/verify`, { method: "POST" }, getResendAdminApiKey());
}

export async function resendSendEmail(params: {
  from: string;
  to: string | string[];
  cc?: string | string[];
  replyTo?: string | string[];
  subject: string;
  html: string;
}) {
  const apiKey = getResendApiKey();
  const payload: Record<string, unknown> = {
    from: params.from,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
  };
  if (params.cc) {
    payload.cc = Array.isArray(params.cc) ? params.cc : [params.cc];
  }
  if (params.replyTo) {
    payload.reply_to = Array.isArray(params.replyTo) ? params.replyTo : [params.replyTo];
  }
  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false as const, error: text || res.statusText };
  }
  return { ok: true as const };
}
