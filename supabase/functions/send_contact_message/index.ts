// Sends a contact form: (1) email to listing/primary contact with message, (2) copy to sender, (3) optional notification to primary contact.
// Requires: RESEND_API_KEY, RESEND_FROM (e.g. "Directory Maps <noreply@yourdomain.com>")
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

async function sendResendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  from: string;
  apiKey: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || res.statusText };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("RESEND_FROM") ?? "";
  if (!apiKey || !from) {
    return jsonResponse(
      {
        error:
          "Email not configured. Set RESEND_API_KEY and RESEND_FROM in Supabase Edge Function secrets (e.g. RESEND_FROM='Directory Maps <noreply@yourdomain.com>').",
      },
      503
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const toEmail = typeof body?.toEmail === "string" ? body.toEmail.trim() : "";
    const listingName = typeof body?.listingName === "string" ? body.listingName.trim() : "the listing";
    const senderName = typeof body?.senderName === "string" ? body.senderName.trim() : "";
    const senderEmail = typeof body?.senderEmail === "string" ? body.senderEmail.trim() : "";
    const senderPhone = typeof body?.senderPhone === "string" ? body.senderPhone.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!toEmail) {
      return jsonResponse({ error: "Missing recipient email (toEmail)." }, 400);
    }
    if (!senderEmail) {
      return jsonResponse({ error: "Sender email is required." }, 400);
    }
    if (!message) {
      return jsonResponse({ error: "Message is required." }, 400);
    }

    const lines: string[] = [
      senderName ? `From: ${escapeHtml(senderName)}` : "",
      `Email: ${escapeHtml(senderEmail)}`,
      senderPhone ? `Phone: ${escapeHtml(senderPhone)}` : "",
      "",
      "Message:",
      escapeHtml(message).replace(/\n/g, "<br>"),
    ].filter(Boolean);

    const htmlToContact = `
      <p>You have received a message via the directory map${listingName ? ` for <strong>${escapeHtml(listingName)}</strong>` : ""}.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
      <p><strong>From:</strong> ${escapeHtml(senderName || "—")}<br/>
      <strong>Email:</strong> ${escapeHtml(senderEmail)}<br/>
      ${senderPhone ? `<strong>Phone:</strong> ${escapeHtml(senderPhone)}<br/>` : ""}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
    `;

    const htmlToSender = `
      <p>Copy of your message${listingName ? ` to ${escapeHtml(listingName)}` : ""}:</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
      <p><strong>From:</strong> ${escapeHtml(senderName || "—")}<br/>
      <strong>Email:</strong> ${escapeHtml(senderEmail)}<br/>
      ${senderPhone ? `<strong>Phone:</strong> ${escapeHtml(senderPhone)}<br/>` : ""}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
    `;

    // 1. Email to primary contact (listing) with the full message
    const toContact = await sendResendEmail({
      apiKey,
      from,
      to: toEmail,
      subject: listingName ? `Message received for ${listingName}` : "You received a message",
      html: htmlToContact,
    });
    if (!toContact.ok) {
      return jsonResponse({ error: toContact.error ?? "Failed to send email to recipient." }, 500);
    }

    // 2. Copy to sender
    const toSender = await sendResendEmail({
      apiKey,
      from,
      to: senderEmail,
      subject: listingName ? `Copy of your message to ${listingName}` : "Copy of your message",
      html: htmlToSender,
    });
    if (!toSender.ok) {
      // Don't fail the request; primary contact already got the message
      console.warn("Failed to send copy to sender:", toSender.error);
    }

    return jsonResponse({ ok: true, sentToContact: true, sentToSender: toSender.ok });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Failed to send message." }, 500);
  }
});
