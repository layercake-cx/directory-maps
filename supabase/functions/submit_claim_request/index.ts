// Manual-mode claim request from a published directory entry page.
// A visitor sends name, email and message; this emails the mailbox configured in
// directory_claim_settings.claim_notify_email and stores a claim_requests row.
// Sending identity, test mode and the messaging entitlement come from the
// directory's own messaging settings (same rules as the entry Contact button).
// Public endpoint (verify_jwt = false in config.toml), so every check is server-side.
import { errorMessage } from "../_shared/errors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { buildFromHeader, getResendApiKey, resendSendEmail } from "../_shared/resend.ts";
import { loadDirectoryMessaging, messagingBlockedReason, resolveProfileFrom } from "../_shared/messaging.ts";

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

async function handle(body: Record<string, unknown>): Promise<Response> {
  // Honeypot: real visitors never see or fill this field. Pretend success to bots.
  if (str(body.website, 200)) return json({ ok: true });

  const directoryId = str(body.directoryId, 64);
  const entryId = str(body.entryId, 64);
  const name = str(body.name, 200);
  const email = str(body.email, 254);
  const message = str(body.message, 4000);

  if (!directoryId || !entryId) return json({ error: "Missing listing." }, 400);
  if (!name) return json({ error: "Your name is required." }, 400);
  if (!email || !EMAIL_RE.test(email)) return json({ error: "A valid email is required." }, 400);

  const service = createServiceClient();

  const { data: settings } = await service
    .from("directory_claim_settings")
    .select("enabled, claim_mode, claim_notify_email")
    .eq("directory_id", directoryId)
    .maybeSingle();
  if (!settings?.enabled || settings.claim_mode !== "manual") {
    return json({ error: "Claim requests are not available for this directory." }, 403);
  }
  const notifyEmail = typeof settings.claim_notify_email === "string" ? settings.claim_notify_email.trim() : "";
  if (!notifyEmail) return json({ error: "Claim requests are not available for this directory." }, 403);

  const directory = await loadDirectoryMessaging(service, directoryId);
  if (!directory) return json({ error: "Directory not found." }, 404);

  const { data: claimsEntitled } = await service.rpc("resolve_claims_entitlement", { p_client_id: directory.clientId });
  if (claimsEntitled !== true) return json({ error: "Claim requests are not available for this directory." }, 403);

  const { data: entry } = await service
    .from("directory_entries")
    .select("id, name, directory_id, current_claim_id, is_active")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.directory_id !== directoryId) return json({ error: "Listing not found." }, 404);

  // One request per person per listing per day: a repeat is acknowledged but nothing new is created.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await service
    .from("claim_requests")
    .select("id", { count: "exact", head: true })
    .eq("directory_item_id", entryId)
    .ilike("requester_email", email.replace(/[\\%_]/g, "\\$&"))
    .gte("created_at", since);
  if ((count ?? 0) > 0) return json({ ok: true, duplicate: true });

  if (entry.current_claim_id) return json({ error: "This listing already has a claim in progress or active." }, 409);

  // The email is a notification; the claim itself is what gets reviewed. So
  // messaging problems never stop a request being recorded.
  const blocked = await messagingBlockedReason(service, directory, "directory");
  const testRecipientMissing = directory.testMode && !directory.testRecipient;
  const emailable = !blocked && !testRecipientMissing;
  const toEmail = directory.testMode ? directory.testRecipient : notifyEmail;

  // Claim + request + listing reservation in one transaction. No claim user is created until an admin approves.
  const { data: created, error: createErr } = await service.rpc("create_manual_claim_request", {
    p_directory_item_id: entryId,
    p_name: name,
    p_email: email,
    p_message: message || null,
    p_to_email: toEmail || notifyEmail,
  });
  if (createErr) {
    const raced = /already has a claim|claims_one_active_per_item|duplicate key/i.test(createErr.message ?? "");
    if (raced) return json({ error: "This listing already has a claim in progress or active." }, 409);
    console.error(createErr);
    return json({ error: "We couldn't record your request. Please try again later." }, 500);
  }
  const requestId = (created as { request_id?: string } | null)?.request_id;

  const markEmail = async (sent: boolean, error?: string) => {
    if (!requestId) return;
    await service.from("claim_requests").update({ email_sent: sent, email_error: error ? error.slice(0, 500) : null }).eq("id", requestId);
  };

  if (!emailable) {
    await markEmail(false, blocked ?? "Test mode is on but no test recipient is configured.");
    return json({ ok: true, emailSent: false });
  }

  const listingName = (typeof entry.name === "string" && entry.name.trim()) || "the listing";
  const from = await resolveProfileFrom(service, directory.profileId!, directory.clientId);
  const subject = `Claim request for ${listingName}`.replace(/[\r\n]+/g, " ");
  const html = `
      <p>Someone has asked to claim a listing in your directory.</p>
      <p><strong>Listing:</strong> ${escapeHtml(listingName)}<br/>
      <strong>Name:</strong> ${escapeHtml(name)}<br/>
      <strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Message:</strong></p>
      <p>${message ? escapeHtml(message).replace(/\n/g, "<br>") : "<em>No message.</em>"}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
      <p style="color:#666;font-size:13px">This request is now in the directory's Claims tab, awaiting review. Reply to this email to contact them.</p>
    `;

  const sent = await resendSendEmail({ from, to: toEmail, replyTo: buildFromHeader(name, email), subject, html });
  if (!sent.ok) {
    await markEmail(false, String(sent.error ?? "Send failed"));
    // The request is recorded and reviewable, so the visitor is not told it failed.
    return json({ ok: true, emailSent: false });
  }
  await markEmail(true);
  return json({ ok: true, emailSent: true });
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
    return await handle(body as Record<string, unknown>);
  } catch (e) {
    console.error(e);
    return json({ error: errorMessage(e, "Failed to send request.") }, 500);
  }
});
