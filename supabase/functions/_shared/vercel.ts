/**
 * Vercel Domains API — attaches a client's verified custom domain to the
 * directory-maps Vercel project so Vercel issues a certificate and routes
 * traffic for it. Without this step DNS pointing at Vercel is not enough:
 * an unregistered hostname gets a TLS failure, never reaching middleware.js.
 *
 * Best-effort by design: called right after our own DNS ownership check
 * passes (manage_client_domain's "verify" action). If VERCEL_API_TOKEN
 * isn't configured, or the Vercel call fails, the domain still becomes
 * `active` in our own DB (DNS ownership is proven either way) — it just
 * won't actually serve traffic until this step succeeds, either
 * automatically on a later verify or via a manual dashboard add.
 */

const VERCEL_PROJECT_ID = Deno.env.get("VERCEL_PROJECT_ID") ?? "prj_KTC7Obt0PauHM8H1KkDcH0nUDSlw";
const VERCEL_TEAM_ID = Deno.env.get("VERCEL_TEAM_ID") ?? "team_spvaz34WKrcrYCaoaSmfmCrF";

export function hasVercelCredentials() {
  return !!Deno.env.get("VERCEL_API_TOKEN");
}

/**
 * Adds a domain to the Vercel project. Returns { attached: true } on
 * success (including "already attached"), or { attached: false, error }
 * on any failure — never throws, since this must not block the caller's
 * own DNS-verification result.
 */
export async function attachVercelDomain(hostname: string): Promise<{ attached: boolean; error?: string }> {
  const token = Deno.env.get("VERCEL_API_TOKEN");
  if (!token) return { attached: false, error: "VERCEL_API_TOKEN not configured" };

  try {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: hostname }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { attached: true };

    const code = data?.error?.code;
    if (code === "domain_already_in_use" || code === "domain_already_exists") {
      return { attached: true };
    }
    return { attached: false, error: data?.error?.message ?? `Vercel API error (HTTP ${res.status})` };
  } catch (e) {
    return { attached: false, error: e instanceof Error ? e.message : "Vercel API request failed" };
  }
}

/** Removes a domain from the Vercel project. Best-effort — never throws, a failure here doesn't block the caller's own removal. */
export async function detachVercelDomain(hostname: string): Promise<void> {
  const token = Deno.env.get("VERCEL_API_TOKEN");
  if (!token) return;
  try {
    await fetch(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains/${hostname}?teamId=${VERCEL_TEAM_ID}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best-effort — an orphaned domain entry on the Vercel project is harmless
  }
}

/**
 * Vercel's own authoritative "is this domain correctly pointed at us"
 * check (GET /v6/domains/{domain}/config). Deliberately used instead of
 * resolving DNS ourselves for the routing record: Vercel's infrastructure
 * handles the apex-domain case correctly (DNS forbids a literal CNAME at
 * a zone apex, so providers like Cloudflare "flatten" an apex CNAME-style
 * record into A records that don't necessarily match a plain A lookup of
 * the CNAME target) — re-implementing that logic ourselves would mean
 * guessing at IP ranges Vercel could change at any time. Returns null if
 * the check itself fails (e.g. token missing/invalid), not a verdict.
 */
export async function isVercelDomainConfigured(hostname: string): Promise<boolean | null> {
  const token = Deno.env.get("VERCEL_API_TOKEN");
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.vercel.com/v6/domains/${hostname}/config?projectIdOrName=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.misconfigured === false;
  } catch {
    return null;
  }
}

/**
 * The DNS record we ask a client to add for routing, before Vercel has
 * seen the domain. Apex/root domains (e.g. acme.com) can't carry a CNAME
 * (DNS spec) — Vercel's own docs recommend an A record to 76.76.21.21 for
 * those. Anything else (a subdomain, e.g. directory.acme.com) gets a CNAME
 * to Vercel's generic target. Detected by label count — doesn't handle
 * multi-part TLDs (e.g. "acme.co.uk") correctly, a known limitation; those
 * domains may see an inaccurate record-type suggestion here even though
 * Vercel's own misconfigured check (the actual source of truth) still
 * works correctly regardless.
 */
export function recommendedRoutingRecord(hostname: string) {
  const isApex = hostname.split(".").length === 2;
  return isApex
    ? { type: "A", name: hostname, value: "76.76.21.21" }
    : { type: "CNAME", name: hostname, value: "cname.vercel-dns.com" };
}
