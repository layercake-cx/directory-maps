/**
 * DNS-over-HTTPS lookups for custom-domain verification.
 *
 * Uses Cloudflare's public DoH JSON API rather than Deno.resolveDns() —
 * that API's availability inside the Supabase Edge Runtime sandbox isn't
 * guaranteed, whereas plain fetch() is already relied on elsewhere in this
 * codebase (Resend, Google). No API key/credential needed; this only reads
 * public DNS records for hostnames the client themselves provided.
 */

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

async function dohQuery(name: string, type: "TXT" | "CNAME"): Promise<Array<{ type: number; data: string }>> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) throw new Error(`DNS lookup failed (HTTP ${res.status})`);
  const data = await res.json();
  return Array.isArray(data?.Answer) ? data.Answer : [];
}

/** Cloudflare returns TXT data as a quoted string; strip the outer quotes and unescape. */
function unquoteTxt(value: string): string {
  let v = (value ?? "").trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v.replace(/\\"/g, '"');
}

/** Resolves TXT record values for a hostname. Empty array on NXDOMAIN or any lookup error. */
export async function resolveTxt(hostname: string): Promise<string[]> {
  try {
    const answers = await dohQuery(hostname, "TXT");
    return answers.map((a) => unquoteTxt(a.data));
  } catch {
    return [];
  }
}

/** Resolves the CNAME target for a hostname (lowercased, trailing dot stripped). Null on NXDOMAIN or any lookup error. */
export async function resolveCname(hostname: string): Promise<string | null> {
  try {
    const answers = await dohQuery(hostname, "CNAME");
    const first = answers[0]?.data;
    if (!first) return null;
    return first.replace(/\.$/, "").toLowerCase();
  } catch {
    return null;
  }
}
