// Directory map contact form → Resend (listing To, visitor Cc).
// Platform: RESEND_API_KEY, RESEND_FROM. Per-client verified domain overrides From when configured.
import { createServiceClient } from "../_shared/supabase.ts";
import { buildFromHeader, getPlatformFrom, getResendApiKey, resendSendEmail } from "../_shared/resend.ts";

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

async function resolveClientEmailSettings(mapId: string | null): Promise<{
  from: string;
  messageIntro: string | null;
  messageSubject: string | null;
}> {
  const platformFrom = getPlatformFrom();
  if (!mapId) return { from: platformFrom, messageIntro: null, messageSubject: null };

  const service = createServiceClient();
  const { data: map } = await service.from("maps").select("client_id").eq("id", mapId).maybeSingle();
  if (!map?.client_id) return { from: platformFrom, messageIntro: null, messageSubject: null };

  const { data: client } = await service
    .from("clients")
    .select("email_from_name,email_from_address,email_domain_status,email_message_intro,email_message_subject")
    .eq("id", map.client_id)
    .maybeSingle();

  let from = platformFrom;
  if (
    client?.email_domain_status === "verified" &&
    typeof client.email_from_address === "string" &&
    client.email_from_address.trim()
  ) {
    from = buildFromHeader(client.email_from_name, client.email_from_address);
  }

  const messageIntro =
    typeof client?.email_message_intro === "string" ? client.email_message_intro : null;
  const messageSubject =
    typeof client?.email_message_subject === "string" ? client.email_message_subject : null;

  return { from, messageIntro, messageSubject };
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
