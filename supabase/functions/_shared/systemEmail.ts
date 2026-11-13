// Branded "system" emails for a directory (claim sign-in links, claim invitations,
// claim-request notifications). One simple layout, themed from the directory's
// own branding (theme_json: logo, fonts, header background/text, primary colour),
// with subject / heading / body / button label editable per directory in
// directory_email_templates. A missing row or blank field means the default below.
//
// Keep DEFAULTS in sync with src/lib/directoryEmailTemplates.js (the editor shows them).
import { createServiceClient } from "./supabase.ts";
import { buildFromHeader, parsePlatformFrom, resendSendEmail } from "./resend.ts";
import { FONT_CATALOG } from "../generate_directory_site/fontCatalog.generated.ts";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type SystemEmailKey = "claim_sign_in" | "claim_invite" | "claim_request_notification";

export type TemplateText = {
  subject: string;
  heading: string;
  body: string;
  buttonLabel: string;
};

export const SYSTEM_EMAIL_KEYS: SystemEmailKey[] = ["claim_sign_in", "claim_invite", "claim_request_notification"];

export const DEFAULTS: Record<SystemEmailKey, TemplateText> = {
  claim_sign_in: {
    subject: "Your sign-in link for {{directory_name}}",
    heading: "Sign in to manage your listing",
    body:
      "Use the button below to sign in to {{directory_name}} and manage your listing. No password is needed.\n\nThis link can only be used once and expires soon. If you didn't ask to sign in, you can ignore this email.",
    buttonLabel: "Sign in",
  },
  claim_invite: {
    subject: "You've been invited to manage {{listing_name}} on {{directory_name}}",
    heading: "You're invited to manage {{listing_name}}",
    body:
      "{{directory_name}} has set you up to manage the listing for {{listing_name}}. Use the button below to sign in and update its details, description and logo.\n\nNo password is needed. If you weren't expecting this, you can ignore this email.",
    buttonLabel: "Manage your listing",
  },
  claim_request_notification: {
    subject: "Claim request for {{listing_name}}",
    heading: "New claim request",
    body:
      "{{requester_name}} ({{requester_email}}) has asked to claim {{listing_name}}.\n\nTheir message:\n{{message}}\n\nThe request is in the directory's Claims tab, waiting for review. Reply to this email to contact them.",
    buttonLabel: "",
  },
};

export type Branding = {
  directoryName: string;
  logoUrl: string | null;
  headerBg: string;
  headerText: string;
  primary: string;
  buttonText: string;
  ink: string;
  muted: string;
  line: string;
  pageBg: string;
  fontHeading: string;
  fontBody: string;
  fontsHref: string | null;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function hex(v: unknown, fallback: string): string {
  return typeof v === "string" && HEX.test(v.trim()) ? v.trim() : fallback;
}

/** Relative luminance based pick of black/white text for a background. */
function readableOn(bg: string): string {
  const n = parseInt(bg.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#232820" : "#FFFFFF";
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function resolveBranding(directoryName: string, theme: Record<string, unknown> | null | undefined): Branding {
  const t = (theme ?? {}) as Record<string, unknown>;
  const primary = hex(t.primaryColor, "#2E5A39");
  const ink = hex(t.inkColor, "#232820");

  // Header background: a solid colour or the first stop of a gradient. The site's
  // default is a translucent white glass header, which becomes plain white here.
  let headerBg = "#FFFFFF";
  const hb = t.headerBackground as { type?: string; color?: string; gradient?: { stops?: { color?: string }[] } } | undefined;
  if (hb) {
    if (hb.type === "gradient") headerBg = hex(hb.gradient?.stops?.[0]?.color, hex(hb.color, headerBg));
    else headerBg = hex(hb.color, headerBg);
  }
  const headerText = hex(t.headerText, readableOn(headerBg));

  const heading = typeof t.fontHeading === "string" && FONT_CATALOG[t.fontHeading] ? t.fontHeading : "Spectral";
  const body = typeof t.fontBody === "string" && FONT_CATALOG[t.fontBody] ? t.fontBody : "Hanken Grotesk";
  const families = [...new Set([heading, body])].map((f) => `family=${FONT_CATALOG[f]}`);
  const logo = typeof t.logoUrl === "string" && /^https:\/\//i.test(t.logoUrl.trim()) ? t.logoUrl.trim() : null;

  return {
    directoryName,
    logoUrl: logo,
    headerBg,
    headerText,
    primary,
    buttonText: readableOn(primary),
    ink,
    muted: hex(t.mutedColor, "#6F7567"),
    line: hex(t.lineColor, "#E6DFCF"),
    pageBg: hex(t.backgroundColor, "#FAF6EE"),
    fontHeading: heading,
    fontBody: body,
    fontsHref: families.length ? `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap` : null,
  };
}

export async function loadBranding(service: ServiceClient, directoryId: string) {
  const { data } = await service
    .from("directories")
    .select("id, client_id, name, theme_json, messaging_profile_id")
    .eq("id", directoryId)
    .maybeSingle();
  if (!data) return null;
  const theme = (data.theme_json ?? {}) as Record<string, unknown>;
  const siteTitle = typeof theme.siteTitle === "string" && theme.siteTitle.trim() ? theme.siteTitle.trim() : "";
  const name = siteTitle || (typeof data.name === "string" ? data.name : "Directory");
  return {
    clientId: String(data.client_id),
    profileId: typeof data.messaging_profile_id === "string" ? data.messaging_profile_id : null,
    branding: resolveBranding(name, theme),
  };
}

/** Saved overrides merged over the defaults. Blank fields fall back to the default. */
export async function loadTemplateText(service: ServiceClient, directoryId: string, key: SystemEmailKey): Promise<TemplateText> {
  const { data } = await service
    .from("directory_email_templates")
    .select("subject, heading, body, button_label")
    .eq("directory_id", directoryId)
    .eq("template_key", key)
    .maybeSingle();
  const d = DEFAULTS[key];
  const pick = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);
  return {
    subject: pick(data?.subject, d.subject),
    heading: pick(data?.heading, d.heading),
    body: pick(data?.body, d.body),
    // An empty button label is meaningful only for emails without a button.
    buttonLabel: d.buttonLabel ? pick(data?.button_label, d.buttonLabel) : "",
  };
}

/** Replaces {{name}} placeholders. Unknown placeholders become empty. Values are NOT escaped here. */
function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k: string) => vars[k.toLowerCase()] ?? "");
}

export function renderSystemEmail(
  branding: Branding,
  text: TemplateText,
  vars: Record<string, string>,
  linkUrl: string | null,
): { subject: string; html: string } {
  const subject = fill(text.subject, vars).replace(/[\r\n]+/g, " ").trim().slice(0, 200) || branding.directoryName;
  const heading = escapeHtml(fill(text.heading, vars));
  const paragraphs = fill(text.body, vars)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const b = branding;
  const headingFont = `'${b.fontHeading}', Georgia, serif`;
  const bodyFont = `'${b.fontBody}', Helvetica, Arial, sans-serif`;
  const brand = b.logoUrl
    ? `<img src="${escapeHtml(b.logoUrl)}" alt="${escapeHtml(b.directoryName)}" style="display:block;max-height:48px;max-width:240px;height:auto;border:0;">`
    : `<span style="font-family:${headingFont};font-size:22px;font-weight:600;color:${b.headerText};">${escapeHtml(b.directoryName)}</span>`;

  const button =
    linkUrl && text.buttonLabel
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="background:${b.primary};border-radius:6px;">
          <a href="${escapeHtml(linkUrl)}" style="display:inline-block;padding:12px 24px;font-family:${bodyFont};font-size:16px;font-weight:600;color:${b.buttonText};text-decoration:none;">${escapeHtml(text.buttonLabel)}</a>
        </td></tr></table>
        <p style="margin:0 0 8px;font-size:13px;color:${b.muted};">If the button doesn't work, copy and paste this link into your browser:<br><span style="word-break:break-all;">${escapeHtml(linkUrl)}</span></p>`
      : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${b.fontsHref ? `<link href="${escapeHtml(b.fontsHref)}" rel="stylesheet">` : ""}
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${b.pageBg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${b.pageBg};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid ${b.line};border-radius:8px;overflow:hidden;">
    <tr><td style="background:${b.headerBg};padding:20px 28px;border-bottom:1px solid ${b.line};">${brand}</td></tr>
    <tr><td style="padding:28px;font-family:${bodyFont};font-size:16px;line-height:1.55;color:${b.ink};">
      <h1 style="margin:0 0 16px;font-family:${headingFont};font-size:24px;line-height:1.25;font-weight:600;color:${b.ink};">${heading}</h1>
      ${paragraphs}
      ${button}
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid ${b.line};font-family:${bodyFont};font-size:12px;color:${b.muted};">Sent by ${escapeHtml(b.directoryName)}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
  return { subject, html };
}

/**
 * From header for system emails. Uses the directory's sending profile when it has one
 * (verified domain -> its own address, else platform address with the profile's name);
 * with no profile, the platform address with the directory's name. These emails are not
 * gated by the visitor-messaging toggle or test mode: a sign-in link must always reach
 * its recipient.
 */
export async function resolveSystemFrom(service: ServiceClient, clientId: string, profileId: string | null, directoryName: string): Promise<string> {
  const { name: platformName, email: platformEmail } = parsePlatformFrom();
  if (profileId) {
    const { data: profile } = await service
      .from("messaging_profiles")
      .select("email_from_name, email_from_address, email_domain_status")
      .eq("id", profileId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (profile?.email_domain_status === "verified" && typeof profile.email_from_address === "string" && profile.email_from_address.trim()) {
      return buildFromHeader(profile.email_from_name, profile.email_from_address);
    }
    const n = (profile?.email_from_name as string | null | undefined)?.trim();
    if (n) return buildFromHeader(n, platformEmail);
  }
  return buildFromHeader(directoryName || platformName || "Layercake Maps", platformEmail);
}

export async function sendSystemEmail(
  service: ServiceClient,
  params: {
    directoryId: string;
    key: SystemEmailKey;
    to: string;
    vars: Record<string, string>;
    linkUrl?: string | null;
    replyTo?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadBranding(service, params.directoryId);
  if (!loaded) return { ok: false, error: "Directory not found." };
  const text = await loadTemplateText(service, params.directoryId, params.key);
  const vars = { directory_name: loaded.branding.directoryName, ...params.vars };
  const { subject, html } = renderSystemEmail(loaded.branding, text, vars, params.linkUrl ?? null);
  const from = await resolveSystemFrom(service, loaded.clientId, loaded.profileId, loaded.branding.directoryName);
  const sent = await resendSendEmail({ from, to: params.to, replyTo: params.replyTo, subject, html });
  return sent.ok ? { ok: true } : { ok: false, error: String(sent.error ?? "Send failed") };
}
