/**
 * DNS-over-HTTPS TXT lookup for custom-domain ownership verification.
 *
 * Uses Cloudflare's public DoH JSON API rather than Deno.resolveDns() —
 * that API's availability inside the Supabase Edge Runtime sandbox isn't
 * guaranteed, whereas plain fetch() is already relied on elsewhere in this
 * codebase (Resend, Google). No API key/credential needed; this only reads
 * public DNS records for hostnames the client themselves provided.
 *
 * TXT is the only record type checked here — whether the routing record
 * (A or CNAME) is correctly pointed at Vercel is checked via Vercel's own
 * authoritative config API instead (see _shared/vercel.ts), which handles
 * apex-domain CNAME-flattening correctly; re-implementing that ourselves
 * via a plain CNAME/A lookup was tried and found unreliable (an apex
 * domain's flattened A records don't necessarily match a fresh A lookup
 * of the routing target, even when correctly configured).
 */

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

/** Cloudflare returns TXT data as a quoted string; strip the outer quotes and unescape. */
function unquoteTxt(value: string): string {
  let v = (value ?? "").trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v.replace(/\\"/g, '"');
}

/** Resolves TXT record values for a hostname. Empty array on NXDOMAIN or any lookup error. */
export async function resolveTxt(hostname: string): Promise<string[]> {
  try {
    const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=TXT`;
    const res = await fetch(url, { headers: { accept: "application/dns-json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const answers = Array.isArray(data?.Answer) ? data.Answer : [];
    return answers.map((a: { data: string }) => unquoteTxt(a.data));
  } catch {
    return [];
  }
}
