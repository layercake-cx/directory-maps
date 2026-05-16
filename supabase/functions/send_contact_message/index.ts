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

async function resolveFromAddress(mapId: string | null): Promise<string> {
  const platformFrom = getPlatformFrom();
  if (!mapId) return platformFrom;

  const service = createServiceClient();
  const { data: map } = await service.from("maps").select("client_id").eq("id", mapId).maybeSingle();
  if (!map?.client_id) return platformFrom;

  const { data: client } = await service
    .from("clients")
    .select("email_from_name,email_from_address,email_domain_status")
    .eq("id", map.client_id)
    .maybeSingle();

  if (
    client?.email_domain_status === "verified" &&
    typeof client.email_from_address === "string" &&
    client.email_from_address.trim()
  ) {
    return buildFromHeader(client.email_from_name, client.email_from_address);
  }

  return platformFrom;
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

    const from = await resolveFromAddress(mapId || null);

    const htmlToContact = `
      <p>You have received a message via the directory map${listingName ? ` for <strong>${escapeHtml(listingName)}</strong>` : ""}.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
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
      subject: listingName ? `Message received for ${listingName}` : "You received a message",
      html: htmlToContact,
    });
    if (!sent.ok) {
      return jsonResponse({ error: sent.error ?? "Failed to send email to recipient." }, 500);
    }

    return jsonResponse({ ok: true, sentToContact: true, ccSender: true });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Failed to send message." }, 500);
  }
});
