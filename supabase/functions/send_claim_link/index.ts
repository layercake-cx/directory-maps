// Sends a claim user's passwordless sign-in link as a branded email from the directory,
// instead of Supabase Auth's generic (unbranded, project-wide) template.
//
//   kind "sign_in": public (login page). Always answers { ok: true } so it can't be used to
//                   discover which emails have claims. Only sends if a live claim exists.
//   kind "invite":  signed-in caller (directory admin / client member / claim user) who can see
//                   the claim; the recipient must already be a claim user of that claim.
//
// The link is generated with the admin API (generateLink) and delivered through Resend using
// the directory's sending profile and theme. verify_jwt = false (config.toml) because the
// login page is anonymous; "invite" authenticates itself below.
import { errorMessage } from "../_shared/errors.ts";
import { createAnonClient, createServiceClient } from "../_shared/supabase.ts";
import { getResendApiKey } from "../_shared/resend.ts";
import { sendSystemEmail } from "../_shared/systemEmail.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

// Best-effort per-isolate throttle (Supabase Auth used to enforce one OTP per email per minute).
const lastSent = new Map<string, number>();
function throttled(email: string): boolean {
  const now = Date.now();
  for (const [k, t] of lastSent) if (now - t > 60_000) lastSent.delete(k);
  if (lastSent.has(email)) return true;
  lastSent.set(email, now);
  return false;
}

function validRedirect(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol) || u.pathname.replace(/\/$/, "") !== "/claim/login") return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function magicLink(service: ReturnType<typeof createServiceClient>, email: string, redirectTo: string) {
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
  const link = data?.properties?.action_link;
  if (error || !link) throw new Error(error?.message ?? "Could not create sign-in link.");
  return link;
}

async function listingName(service: ReturnType<typeof createServiceClient>, entryId: string): Promise<string> {
  const { data } = await service.from("directory_entries").select("name").eq("id", entryId).maybeSingle();
  return (typeof data?.name === "string" && data.name.trim()) || "your listing";
}

async function handle(req: Request, body: Record<string, unknown>): Promise<Response> {
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
  const redirectTo = validRedirect(body.redirectTo);
  const kind = body.kind === "invite" ? "invite" : "sign_in";
  if (!EMAIL_RE.test(email)) return json({ error: "A valid email is required." }, 400);
  if (!redirectTo) return json({ error: "Invalid redirect." }, 400);

  const service = createServiceClient();
  const escapeLike = email.replace(/[\\%_]/g, "\\$&");

  if (kind === "sign_in") {
    if (throttled(email.toLowerCase())) return json({ ok: true });
    const { data: rows } = await service
      .from("claim_users")
      .select("claim_id, claims!inner(directory_id, directory_item_id, status)")
      .ilike("email", escapeLike)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    const usable = (rows ?? []).find((r) => {
      const c = r.claims as unknown as { status: string } | null;
      return c && c.status !== "revoked";
    });
    if (!usable) return json({ ok: true });
    const claim = usable.claims as unknown as { directory_id: string; directory_item_id: string };
    try {
      const link = await magicLink(service, email, redirectTo);
      const sent = await sendSystemEmail(service, {
        directoryId: claim.directory_id,
        key: "claim_sign_in",
        to: email,
        vars: { listing_name: await listingName(service, claim.directory_item_id) },
        linkUrl: link,
      });
      if (!sent.ok) console.error("send_claim_link sign_in failed:", sent.error);
    } catch (e) {
      console.error("send_claim_link sign_in error:", e);
    }
    return json({ ok: true });
  }

  // invite
  const claimId = typeof body.claimId === "string" ? body.claimId.trim() : "";
  if (!claimId) return json({ error: "Missing claim." }, 400);
  const anon = createAnonClient(req);
  const { data: auth } = await anon.auth.getUser();
  if (!auth?.user) return json({ error: "You must be signed in." }, 401);
  // RLS decides who can see a claim: platform admins, the directory's organisation, and its claim users.
  const { data: claim } = await anon.from("claims").select("id, directory_id, directory_item_id").eq("id", claimId).maybeSingle();
  if (!claim) return json({ error: "Claim not found." }, 404);
  const { data: cu } = await service
    .from("claim_users")
    .select("id")
    .eq("claim_id", claimId)
    .ilike("email", escapeLike)
    .is("removed_at", null)
    .maybeSingle();
  if (!cu) return json({ error: "That email is not a user of this claim." }, 400);

  const link = await magicLink(service, email, redirectTo);
  const sent = await sendSystemEmail(service, {
    directoryId: claim.directory_id as string,
    key: "claim_invite",
    to: email,
    vars: { listing_name: await listingName(service, claim.directory_item_id as string) },
    linkUrl: link,
  });
  if (!sent.ok) return json({ error: `Email could not be sent: ${sent.error}` }, 502);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    getResendApiKey();
  } catch {
    return json({ error: "Email not configured." }, 503);
  }
  try {
    const body = await req.json().catch(() => ({}));
    return await handle(req, body as Record<string, unknown>);
  } catch (e) {
    console.error(e);
    return json({ error: errorMessage(e, "Failed to send sign-in link.") }, 500);
  }
});
