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

export function getPlatformFrom(): string {
  const from = Deno.env.get("RESEND_FROM") ?? "";
  if (!from) throw new Error("RESEND_FROM is not configured.");
  return from;
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

async function resendFetch(path: string, init: RequestInit = {}) {
  const apiKey = getResendApiKey();
  const res = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

export async function resendCreateDomain(name: string) {
  return await resendFetch("/domains", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function resendGetDomain(domainId: string) {
  return await resendFetch(`/domains/${encodeURIComponent(domainId)}`, { method: "GET" });
}

export async function resendVerifyDomain(domainId: string) {
  return await resendFetch(`/domains/${encodeURIComponent(domainId)}/verify`, { method: "POST" });
}

export async function resendSendEmail(params: {
  from: string;
  to: string | string[];
  cc?: string | string[];
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
