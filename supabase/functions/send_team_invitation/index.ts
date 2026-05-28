// Create team invitation + send Resend email (password signup link).
// Enforces one account per organisation via create_team_invitation RPC.
import { createAnonClient, createServiceClient, requireUser } from "../_shared/supabase.ts";
import { buildFromHeader, getPlatformFrom, getResendApiKey, resendSendEmail } from "../_shared/resend.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  member: "Member",
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

function getAppOrigin(): string {
  const site = (Deno.env.get("SITE_URL") ?? Deno.env.get("APP_URL") ?? "https://maps.layercake-cx.biz").replace(
    /\/$/,
    ""
  );
  return site;
}

function buildInviteUrls(invitationId: string) {
  const base = getAppOrigin();
  return {
    signup: `${base}/#/signup?invite=${invitationId}`,
    login: `${base}/#/login?invite=${invitationId}`,
  };
}

async function requireOrgManager(req: Request, clientId: string) {
  const user = await requireUser(req);
  const service = createServiceClient();

  const { data: profile } = await service.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role === "admin") {
    return { user, contact: { name: null, email: user.email ?? "" } };
  }

  const { data: contact } = await service
    .from("contacts")
    .select("id, role, is_primary, name, email")
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!contact) throw new Error("Access denied");
  const canManage =
    contact.role === "owner" || contact.role === "manager" || contact.is_primary === true;
  if (!canManage) throw new Error("Only owners and managers can invite team members.");
  return { user, contact };
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
          "Email not configured. Set RESEND_API_KEY and RESEND_FROM on Supabase Edge Functions. See docs/RESEND_EMAIL.md.",
      },
      503
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const role = typeof body?.role === "string" ? body.role.trim() : "member";
    const mapIds = Array.isArray(body?.mapIds)
      ? body.mapIds.filter((id: unknown) => typeof id === "string" && id.trim()).map((id: string) => id.trim())
      : [];

    if (!clientId) return jsonResponse({ error: "Missing clientId." }, 400);
    if (!email) return jsonResponse({ error: "Email is required." }, 400);
    if (role !== "manager" && role !== "member") {
      return jsonResponse({ error: "Invalid role." }, 400);
    }

    const { user, contact: inviterContact } = await requireOrgManager(req, clientId);

    const anon = createAnonClient(req);
    const { data: invitation, error: invErr } = await anon.rpc("create_team_invitation", {
      p_client_id: clientId,
      p_email: email,
      p_role: role,
      p_map_ids: mapIds,
    });

    if (invErr) {
      const msg = invErr.message ?? String(invErr);
      const status = /already/i.test(msg) ? 409 : 400;
      return jsonResponse({ error: msg }, status);
    }

    const inv = Array.isArray(invitation) ? invitation[0] : invitation;
    if (!inv?.id) {
      return jsonResponse({ error: "Invitation could not be created." }, 500);
    }

    const service = createServiceClient();
    const { data: client } = await service.from("clients").select("name").eq("id", clientId).single();
    const orgName = (client?.name as string) || "your organisation";
    const inviterName =
      (inviterContact.name as string)?.trim() ||
      (inviterContact.email as string)?.trim() ||
      user.email ||
      "A team member";
    const roleLabel = ROLE_LABELS[role] ?? role;
    const urls = buildInviteUrls(inv.id);

    const platformFrom = getPlatformFrom();
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; line-height: 1.5; color: #111;">
        <p>Hi,</p>
        <p><strong>${escapeHtml(inviterName)}</strong> has invited you to join
        <strong>${escapeHtml(orgName)}</strong> on Layercake Maps as a <strong>${escapeHtml(roleLabel)}</strong>.</p>
        <p>Create your account with a password using the button below. You must sign up with this email address:
        <strong>${escapeHtml(email)}</strong>.</p>
        <p style="margin: 28px 0;">
          <a href="${escapeHtml(urls.signup)}"
             style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">
            Accept invitation &amp; set password
          </a>
        </p>
        <p style="font-size: 14px; color: #555;">This invitation expires in 7 days. If the button does not work, copy this link into your browser:</p>
        <p style="font-size: 13px; word-break: break-all;"><a href="${escapeHtml(urls.signup)}">${escapeHtml(urls.signup)}</a></p>
        <p style="font-size: 13px; color: #777; margin-top: 24px;">If you did not expect this email, you can ignore it.</p>
      </div>
    `;

    const sent = await resendSendEmail({
      from: platformFrom,
      to: email,
      subject: `You're invited to join ${orgName} on Layercake Maps`,
      html,
    });

    if (!sent.ok) {
      await service.from("invitations").delete().eq("id", inv.id);
      return jsonResponse(
        { error: `Invitation email could not be sent: ${sent.error ?? "Unknown error"}` },
        502
      );
    }

    return jsonResponse({
      ok: true,
      invitation: inv,
      urls,
      emailSent: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("Access denied") || msg.includes("Not authenticated") ? 403 : 500;
    return jsonResponse({ error: msg }, status);
  }
});
