import { createServiceClient, requireAdmin } from "../_shared/supabase.ts";
import { getPlatformFrom, getResendApiKey, resendSendEmail } from "../_shared/resend.ts";

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

function getEmailRedirectUrl(): string {
  return (Deno.env.get("SITE_URL") ?? Deno.env.get("APP_URL") ?? "https://maps.layercake-cx.biz").replace(/\/$/, "");
}

function buildInviteSignupUrl(invitationId: string): string {
  return `${getEmailRedirectUrl()}/#/signup?invite=${invitationId}`;
}

async function recordAdminEvent(
  service: ReturnType<typeof createServiceClient>,
  {
    eventType,
    actorUserId,
    clientId,
    contactId,
    source,
    error,
  }: {
    eventType: string;
    actorUserId: string;
    clientId: string;
    contactId?: string | null;
    source: string;
    error?: string;
  }
) {
  const payload = {
    event_type: eventType,
    event_category: "team",
    event_subtype: eventType.replace(/^team_/, ""),
    client_id: clientId,
    map_id: null,
    meta: {
      actor_user_id: actorUserId,
      actor_contact_id: null,
      actor_role: "admin",
      actor_admin_scope: "platform_admin",
      client_id: clientId,
      map_id: null,
      source,
      contact_id: contactId ?? null,
      ...(error ? { error } : {}),
    },
  };
  await service.from("admin_events").insert(payload);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const service = createServiceClient();

  try {
    getResendApiKey();
    getPlatformFrom();

    const adminUser = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const canManageMaps = !!body?.canManageMaps;
    const canManageUsers = !!body?.canManageUsers;
    const requestedRole = canManageMaps || canManageUsers ? "manager" : "member";

    if (!clientId) return jsonResponse({ error: "Missing clientId." }, 400);
    if (!email) return jsonResponse({ error: "Email is required." }, 400);
    if (!name) return jsonResponse({ error: "Name is required." }, 400);

    const { data: existingAuthUsers, error: usersErr } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersErr) throw usersErr;
    const authUserMatch = (existingAuthUsers?.users ?? []).some(
      (u) => (u.email ?? "").trim().toLowerCase() === email
    );
    if (authUserMatch) {
      return jsonResponse(
        { error: "This user already has an account. Each person can only belong to one organisation." },
        409
      );
    }

    const { data: crossClientContact } = await service
      .from("contacts")
      .select("id")
      .eq("email", email)
      .neq("client_id", clientId)
      .limit(1);
    if ((crossClientContact ?? []).length > 0) {
      return jsonResponse({ error: "This user already belongs to another organisation." }, 409);
    }

    const { data: sameClientContact } = await service
      .from("contacts")
      .select("id")
      .eq("email", email)
      .eq("client_id", clientId)
      .limit(1);
    if ((sameClientContact ?? []).length > 0) {
      return jsonResponse({ error: "This email is already on your team." }, 409);
    }

    const { data: pendingInvite } = await service
      .from("invitations")
      .select("id")
      .eq("client_id", clientId)
      .eq("email", email)
      .is("accepted_at", null)
      .limit(1);
    if ((pendingInvite ?? []).length > 0) {
      return jsonResponse({ error: "A pending invitation already exists for this email." }, 409);
    }

    const { data: inv, error: invitationError } = await service
      .from("invitations")
      .insert({
        client_id: clientId,
        email,
        role: requestedRole,
        map_ids: [],
      })
      .select("id")
      .single();
    if (invitationError) {
      throw invitationError;
    }
    if (!inv?.id) throw new Error("Could not create invitation.");

    const { data: client } = await service.from("clients").select("name").eq("id", clientId).maybeSingle();
    const clientName = typeof client?.name === "string" ? client.name : "your organisation";
    const signupUrl = buildInviteSignupUrl(inv.id);

    const from = getPlatformFrom();
    const emailHtml = `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; line-height: 1.5; color: #111;">
        <p>Hi ${name},</p>
        <p>You've been invited to join <strong>${clientName}</strong> on Layercake Maps.</p>
        <p>Create your account and set your password using the button below with <strong>${email}</strong>.</p>
        <p style="margin: 28px 0;">
          <a href="${signupUrl}"
             style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">
            Create account and set password
          </a>
        </p>
        <p style="font-size: 13px; word-break: break-all;">If the button does not work, copy this link: <a href="${signupUrl}">${signupUrl}</a></p>
      </div>
    `;

    const sent = await resendSendEmail({
      from,
      to: email,
      subject: `You're invited to join ${clientName} on Layercake Maps`,
      html: emailHtml,
    });
    if (!sent.ok) {
      throw new Error(`Password setup email could not be sent: ${sent.error ?? "Unknown error"}`);
    }

    await recordAdminEvent(service, {
      eventType: "team_invite_created",
      actorUserId: adminUser.id,
      clientId,
      contactId: null,
      source: "admin_client_users_tab",
    });

    await recordAdminEvent(service, {
      eventType: "team_invite_email_sent",
      actorUserId: adminUser.id,
      clientId,
      contactId: null,
      source: "admin_client_users_tab",
    });

    return jsonResponse({ ok: true, invitationId: inv.id, emailSent: true, signupUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "Not authenticated" ? 401 : msg.includes("Admin access required") ? 403 : 500;
    return jsonResponse({ error: msg }, status);
  }
});
