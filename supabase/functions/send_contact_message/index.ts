// Map contact form and directory entry "Contact" drawer -> Resend (recipient To, visitor Cc).
// Platform: RESEND_API_KEY, RESEND_FROM. Settings come from the map or directory itself:
// its chosen messaging profile (From identity), enable toggle, test mode, subject and intro.
// Sending is blocked until a profile is chosen (see _shared/messaging.ts).
import { errorMessage } from "../_shared/errors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { buildFromHeader, getResendApiKey, resendSendEmail } from "../_shared/resend.ts";
import {
  loadDirectoryMessaging,
  loadMapMessaging,
  messagingBlockedReason,
  resolveProfileFrom,
  type MessagingEntity,
} from "../_shared/messaging.ts";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_MESSAGE_SUBJECT = "Message received for {listing}";

function applyListingPlaceholder(template: string, listingName: string): string {
  const listing = listingName.trim() || "the listing";
  return template.replace(/\{listing\}/gi, listing);
}

function introToHtml(intro: string): string {
  return `<p>${escapeHtml(intro).replace(/\n/g, "<br>")}</p>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Visitor = { senderName: string; senderEmail: string; senderPhone: string; message: string };

/** Subject and HTML body, built from the map's or directory's own message text. */
function buildEmail(entity: MessagingEntity, listingName: string, v: Visitor) {
  const subjectTemplate = entity.subject?.trim() || DEFAULT_MESSAGE_SUBJECT;
  const subject = applyListingPlaceholder(subjectTemplate, listingName);
  const introTemplate = entity.intro?.trim() ?? "";
  const introHtml = introTemplate ? introToHtml(applyListingPlaceholder(introTemplate, listingName)) : "";
  const introDivider = introHtml ? `<hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>` : "";

  const html = `
      ${introHtml}
      ${introDivider}
      <p><strong>From:</strong> ${escapeHtml(v.senderName || "—")}<br/>
      <strong>Email:</strong> ${escapeHtml(v.senderEmail)}<br/>
      ${v.senderPhone ? `<strong>Phone:</strong> ${escapeHtml(v.senderPhone)}<br/>` : ""}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(v.message).replace(/\n/g, "<br>")}</p>
    `;
  return { subject, html };
}

function readResendError(raw: string | undefined): string {
  let errMsg = raw ?? "Failed to send email to recipient.";
  try {
    const parsed = JSON.parse(errMsg);
    if (typeof parsed?.message === "string") errMsg = parsed.message;
  } catch {
    /* use raw */
  }
  return errMsg;
}

async function handleDirectoryEnquiry(body: Record<string, unknown>): Promise<Response> {
  const directoryId = typeof body.directoryId === "string" ? body.directoryId.trim() : "";
  const entryId = typeof body.entryId === "string" ? body.entryId.trim() : "";
  const senderName = typeof body.senderName === "string" ? body.senderName.trim().slice(0, 200) : "";
  const senderEmail = typeof body.senderEmail === "string" ? body.senderEmail.trim() : "";
  const senderPhone = typeof body.senderPhone === "string" ? body.senderPhone.trim().slice(0, 40) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 8000) : "";
  const surfaceRaw = typeof body.surface === "string" ? body.surface.trim() : "published";
  const surface = surfaceRaw === "client_preview" || surfaceRaw === "admin_preview" ? surfaceRaw : "published";

  if (!directoryId) return jsonResponse({ error: "Missing directory." }, 400);
  if (!entryId) return jsonResponse({ error: "Missing entry." }, 400);
  if (!senderEmail || !EMAIL_RE.test(senderEmail)) return jsonResponse({ error: "A valid sender email is required." }, 400);
  if (!message) return jsonResponse({ error: "Message is required." }, 400);

  const service = createServiceClient();
  const directory = await loadDirectoryMessaging(service, directoryId);
  if (!directory) return jsonResponse({ error: "Directory not found." }, 404);

  const { data: entry } = await service
    .from("directory_entries")
    .select("id, name, email, directory_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.directory_id !== directoryId) return jsonResponse({ error: "Entry not found." }, 404);

  // The recipient is the entry's own email, looked up here so it never has to
  // be written into the public page (same as map listings, but resolved server-side).
  const entryEmail = typeof entry.email === "string" ? entry.email.trim() : "";
  if (!entryEmail) return jsonResponse({ error: "This listing has no email address to contact." }, 403);

  const blocked = await messagingBlockedReason(service, directory, "directory");
  if (blocked) return jsonResponse({ error: blocked }, 403);

  if (directory.testMode && !directory.testRecipient) {
    return jsonResponse({ error: "Test mode is on but no test recipient is configured." }, 400);
  }
  const toEmail = directory.testMode ? directory.testRecipient : entryEmail;

  const listingName = (typeof entry.name === "string" && entry.name.trim()) || "the listing";
  const from = await resolveProfileFrom(service, directory.profileId!, directory.clientId);
  const replyTo = buildFromHeader(senderName, senderEmail);
  const { subject, html } = buildEmail(directory, listingName, { senderName, senderEmail, senderPhone, message });

  const baseRow = {
    directory_id: directoryId,
    entry_id: entryId,
    entry_name: listingName,
    to_email: toEmail,
    sender_name: senderName || null,
    sender_email: senderEmail,
    sender_phone: senderPhone || null,
    message,
    surface,
  };

  const sent = await resendSendEmail({ from, to: toEmail, cc: senderEmail, replyTo, subject, html });

  if (!sent.ok) {
    const errMsg = readResendError(sent.error);
    await service.from("directory_contact_submissions").insert({
      ...baseRow,
      email_sent: false,
      email_error: errMsg.slice(0, 500),
    });
    return jsonResponse({ error: errMsg }, 500);
  }

  await service.from("directory_contact_submissions").insert({ ...baseRow, email_sent: true });

  return jsonResponse({ ok: true, sentToContact: true, ccSender: true });
}

async function handleMapMessage(body: Record<string, unknown>): Promise<Response> {
  const mapId = typeof body.mapId === "string" ? body.mapId.trim() : "";
  const toEmail = typeof body.toEmail === "string" ? body.toEmail.trim() : "";
  const listingName = typeof body.listingName === "string" ? body.listingName.trim() : "the listing";
  const senderName = typeof body.senderName === "string" ? body.senderName.trim() : "";
  const senderEmail = typeof body.senderEmail === "string" ? body.senderEmail.trim() : "";
  const senderPhone = typeof body.senderPhone === "string" ? body.senderPhone.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!mapId) return jsonResponse({ error: "Missing map (mapId)." }, 400);
  if (!toEmail) return jsonResponse({ error: "Missing recipient email (toEmail)." }, 400);
  if (!senderEmail) return jsonResponse({ error: "Sender email is required." }, 400);
  if (!message) return jsonResponse({ error: "Message is required." }, 400);

  const service = createServiceClient();
  const map = await loadMapMessaging(service, mapId);
  if (!map) return jsonResponse({ error: "Map not found." }, 404);

  // This function spends a Resend send, so it re-checks readiness server-side
  // rather than trusting the embed that hid or showed the button.
  const blocked = await messagingBlockedReason(service, map, "map");
  if (blocked) return jsonResponse({ error: blocked }, 403);

  const from = await resolveProfileFrom(service, map.profileId!, map.clientId);
  const replyTo = buildFromHeader(senderName, senderEmail);
  const { subject, html } = buildEmail(map, listingName, { senderName, senderEmail, senderPhone, message });

  const sent = await resendSendEmail({ from, to: toEmail, cc: senderEmail, replyTo, subject, html });
  if (!sent.ok) return jsonResponse({ error: readResendError(sent.error) }, 500);

  return jsonResponse({ ok: true, sentToContact: true, ccSender: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    getResendApiKey();
  } catch {
    return jsonResponse(
      {
        error:
          "Email not configured. Set RESEND_API_KEY and RESEND_FROM in Supabase Edge Function secrets (e.g. RESEND_FROM='Your App <noreply@yourdomain.com>'). See docs/RESEND_EMAIL.md.",
      },
      503
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.directoryId === "string" && body.directoryId.trim()) {
      return await handleDirectoryEnquiry(body);
    }
    return await handleMapMessage(body);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: errorMessage(e, "Failed to send message.") }, 500);
  }
});
