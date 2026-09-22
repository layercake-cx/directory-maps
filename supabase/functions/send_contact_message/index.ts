// Directory map contact form → Resend (listing To, visitor Cc).
// Platform: RESEND_API_KEY, RESEND_FROM. Per-client verified domain overrides From when configured.
import { createServiceClient } from "../_shared/supabase.ts";
import { buildFromHeader, parsePlatformFrom, getResendApiKey, resendSendEmail } from "../_shared/resend.ts";

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

// Defense in depth: client_messaging_settings.messaging_enabled already
// bakes in clients.messaging_enabled AND the resolved "messaging"
// entitlement (Professional plan and above). EmbedMap.jsx gates the "Send
// message" button on the same view, but this function is the one that
// actually spends a Resend send, so it re-checks server-side rather than
// trusting the caller. Fails open (allows) when the map/client can't be
// resolved, matching the rest of this function's "no mapId -> use platform
// defaults" behaviour.
async function isMessagingEnabledForMap(mapId: string | null): Promise<boolean> {
  if (!mapId) return true;

  const service = createServiceClient();
  const { data: map } = await service.from("maps").select("client_id").eq("id", mapId).maybeSingle();
  if (!map?.client_id) return true;

  const { data: settings } = await service
    .from("client_messaging_settings")
    .select("messaging_enabled")
    .eq("client_id", map.client_id)
    .maybeSingle();
  if (!settings) return true;

  return settings.messaging_enabled === true;
}

async function resolveClientEmailSettingsForClient(clientId: string | null): Promise<{
  from: string;
  messageIntro: string | null;
  messageSubject: string | null;
}> {
  const { name: platformName, email: platformEmail } = parsePlatformFrom();
  const fallbackName = platformName || "Layercake Maps";
  const defaultFrom = buildFromHeader(fallbackName, platformEmail);

  if (!clientId) return { from: defaultFrom, messageIntro: null, messageSubject: null };

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("email_from_name,email_from_address,email_domain_status,email_message_intro,email_message_subject")
    .eq("id", clientId)
    .maybeSingle();

  let from: string;
  if (
    client?.email_domain_status === "verified" &&
    typeof client.email_from_address === "string" &&
    client.email_from_address.trim()
  ) {
    from = buildFromHeader(client.email_from_name, client.email_from_address);
  } else {
    // Domain not verified: platform sending address, client Display Name when configured.
    const displayName = (client?.email_from_name as string | null | undefined)?.trim() || fallbackName;
    from = buildFromHeader(displayName, platformEmail);
  }

  const messageIntro =
    typeof client?.email_message_intro === "string" ? client.email_message_intro : null;
  const messageSubject =
    typeof client?.email_message_subject === "string" ? client.email_message_subject : null;

  return { from, messageIntro, messageSubject };
}

async function resolveClientEmailSettings(mapId: string | null): Promise<{
  from: string;
  messageIntro: string | null;
  messageSubject: string | null;
}> {
  if (!mapId) return resolveClientEmailSettingsForClient(null);

  const service = createServiceClient();
  const { data: map } = await service.from("maps").select("client_id").eq("id", mapId).maybeSingle();
  return resolveClientEmailSettingsForClient(map?.client_id ?? null);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const { data: directory } = await service
    .from("directories")
    .select("id, client_id, enquiry_email")
    .eq("id", directoryId)
    .maybeSingle();
  if (!directory?.client_id) return jsonResponse({ error: "Directory not found." }, 404);

  const contactEmail = typeof directory.enquiry_email === "string" ? directory.enquiry_email.trim() : "";
  if (!contactEmail) return jsonResponse({ error: "This directory is not accepting enquiries." }, 403);

  const { data: entry } = await service
    .from("directory_entries")
    .select("id, name, directory_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.directory_id !== directoryId) return jsonResponse({ error: "Entry not found." }, 404);

  const { data: settings } = await service
    .from("client_messaging_settings")
    .select("messaging_enabled, email_test_mode, email_test_recipient")
    .eq("client_id", directory.client_id)
    .maybeSingle();
  if (settings && settings.messaging_enabled !== true) {
    return jsonResponse({ error: "Messaging is not enabled for this directory." }, 403);
  }

  const testMode = settings?.email_test_mode !== false;
  const testRecipient = typeof settings?.email_test_recipient === "string" ? settings.email_test_recipient.trim() : "";
  if (testMode && !testRecipient) {
    return jsonResponse({ error: "Test mode is on but no test recipient is configured." }, 400);
  }
  const toEmail = testMode ? testRecipient : contactEmail;

  const listingName = (typeof entry.name === "string" && entry.name.trim()) || "the listing";
  const { from, messageIntro, messageSubject } = await resolveClientEmailSettingsForClient(directory.client_id);
  const replyTo = buildFromHeader(senderName, senderEmail);
  const subjectTemplate = messageSubject?.trim() || DEFAULT_MESSAGE_SUBJECT;
  const subjectText = applyListingPlaceholder(subjectTemplate, listingName);
  const introTemplate = messageIntro?.trim() ?? "";
  const introHtml = introTemplate ? introToHtml(applyListingPlaceholder(introTemplate, listingName)) : "";
  const introDivider = introHtml
    ? `<hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>`
    : "";

  const htmlToContact = `
      ${introHtml}
      ${introDivider}
      <p><strong>From:</strong> ${escapeHtml(senderName || "—")}<br/>
      <strong>Email:</strong> ${escapeHtml(senderEmail)}<br/>
      ${senderPhone ? `<strong>Phone:</strong> ${escapeHtml(senderPhone)}<br/>` : ""}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
    `;

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

  const sent = await resendSendEmail({
    from,
    to: toEmail,
    cc: senderEmail,
    replyTo,
    subject: subjectText,
    html: htmlToContact,
  });

  if (!sent.ok) {
    let errMsg = sent.error ?? "Failed to send email to recipient.";
    try {
      const parsed = JSON.parse(errMsg);
      if (typeof parsed?.message === "string") errMsg = parsed.message;
    } catch {
      /* use raw */
    }
    await service.from("directory_contact_submissions").insert({
      ...baseRow,
      email_sent: false,
      email_error: errMsg.slice(0, 500),
    });
    return jsonResponse({ error: errMsg }, 500);
  }

  await service.from("directory_contact_submissions").insert({
    ...baseRow,
    email_sent: true,
  });

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
    const mapId = typeof body?.mapId === "string" ? body.mapId.trim() : "";
    const toEmail = typeof body?.toEmail === "string" ? body.toEmail.trim() : "";
    const listingName = typeof body?.listingName === "string" ? body.listingName.trim() : "the listing";
    const senderName = typeof body?.senderName === "string" ? body.senderName.trim() : "";
    const senderEmail = typeof body?.senderEmail === "string" ? body.senderEmail.trim() : "";
    const senderPhone = typeof body?.senderPhone === "string" ? body.senderPhone.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!toEmail) return jsonResponse({ error: "Missing recipient email (toEmail)." }, 400);
    if (!senderEmail) return jsonResponse({ error: "Sender email is required." }, 400);
    if (!message) return jsonResponse({ error: "Message is required." }, 400);

    if (!(await isMessagingEnabledForMap(mapId || null))) {
      return jsonResponse({ error: "Messaging is not enabled for this map." }, 403);
    }

    const { from, messageIntro, messageSubject } = await resolveClientEmailSettings(mapId || null);
    const replyTo = buildFromHeader(senderName, senderEmail);
    const subjectTemplate = messageSubject?.trim() || DEFAULT_MESSAGE_SUBJECT;
    const subjectText = applyListingPlaceholder(subjectTemplate, listingName);
    const introTemplate = messageIntro?.trim() ?? "";
    const introHtml = introTemplate ? introToHtml(applyListingPlaceholder(introTemplate, listingName)) : "";
    const introDivider = introHtml
      ? `<hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>`
      : "";

    const htmlToContact = `
      ${introHtml}
      ${introDivider}
      <p><strong>From:</strong> ${escapeHtml(senderName || "—")}<br/>
      <strong>Email:</strong> ${escapeHtml(senderEmail)}<br/>
      ${senderPhone ? `<strong>Phone:</strong> ${escapeHtml(senderPhone)}<br/>` : ""}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
    `;

    const sent = await resendSendEmail({
      from,
      to: toEmail,
      cc: senderEmail,
      replyTo,
      subject: subjectText,
      html: htmlToContact,
    });
    if (!sent.ok) {
      let errMsg = sent.error ?? "Failed to send email to recipient.";
      try {
        const parsed = JSON.parse(errMsg);
        if (typeof parsed?.message === "string") errMsg = parsed.message;
      } catch {
        /* use raw */
      }
      return jsonResponse({ error: errMsg }, 500);
    }

    return jsonResponse({ ok: true, sentToContact: true, ccSender: true });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Failed to send message." }, 500);
  }
});
