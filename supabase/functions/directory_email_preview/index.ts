// Editor support for a directory's branded system emails: render a preview of the (possibly
// unsaved) text, or send a test copy to the signed-in user's own address. Never sends to anyone else.
import { errorMessage } from "../_shared/errors.ts";
import { createAnonClient, createServiceClient } from "../_shared/supabase.ts";
import { getResendApiKey, resendSendEmail } from "../_shared/resend.ts";
import {
  DEFAULTS,
  loadBranding,
  loadTemplateText,
  renderSystemEmail,
  resolveSystemFrom,
  SYSTEM_EMAIL_KEYS,
  type SystemEmailKey,
  type TemplateText,
} from "../_shared/systemEmail.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

const SAMPLE_VARS: Record<string, string> = {
  listing_name: "Example Organisation",
  requester_name: "Alex Example",
  requester_email: "alex@example.org",
  message: "We are the owners of this listing and would like to manage it.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const anon = createAnonClient(req);
    const { data: auth } = await anon.auth.getUser();
    if (!auth?.user) return json({ error: "You must be signed in." }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const directoryId = typeof body.directoryId === "string" ? body.directoryId : "";
    const key = body.key as SystemEmailKey;
    const action = body.action === "test" ? "test" : "preview";
    if (!directoryId || !SYSTEM_EMAIL_KEYS.includes(key)) return json({ error: "Invalid request." }, 400);

    // RLS: only a platform admin or the directory's own organisation can see the row.
    const { data: visible } = await anon.from("directories").select("id").eq("id", directoryId).maybeSingle();
    if (!visible) return json({ error: "Directory not found." }, 404);

    const service = createServiceClient();
    const loaded = await loadBranding(service, directoryId);
    if (!loaded) return json({ error: "Directory not found." }, 404);

    const saved = await loadTemplateText(service, directoryId, key);
    const draft = (body.text ?? {}) as Partial<Record<keyof TemplateText, unknown>>;
    const pick = (k: keyof TemplateText) => {
      const v = draft[k];
      if (typeof v !== "string") return saved[k];
      // A blank draft field shows the default, matching what would be sent once saved.
      return v.trim() ? v.slice(0, 5000) : DEFAULTS[key][k];
    };
    const text: TemplateText = {
      subject: pick("subject"),
      heading: pick("heading"),
      body: pick("body"),
      buttonLabel: DEFAULTS[key].buttonLabel ? pick("buttonLabel") : "",
    };
    const vars = { directory_name: loaded.branding.directoryName, ...SAMPLE_VARS };
    const link = DEFAULTS[key].buttonLabel ? "https://example.com/claim/login" : null;
    const { subject, html } = renderSystemEmail(loaded.branding, text, vars, link);

    if (action === "preview") return json({ subject, html });

    getResendApiKey();
    const to = auth.user.email;
    if (!to) return json({ error: "Your account has no email address." }, 400);
    const from = await resolveSystemFrom(service, loaded.clientId, loaded.profileId, loaded.branding.directoryName);
    const sent = await resendSendEmail({ from, to, subject: `[Test] ${subject}`, html });
    if (!sent.ok) return json({ error: `Test email could not be sent: ${sent.error}` }, 502);
    return json({ ok: true, sentTo: to });
  } catch (e) {
    console.error(e);
    return json({ error: errorMessage(e, "Request failed.") }, 500);
  }
});
