import { createServiceClient } from "../_shared/supabase.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const service = createServiceClient();
  let createdUserId: string | null = null;
  let createdContactId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const invitationId = typeof body?.invitationId === "string" ? body.invitationId.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";

    if (!invitationId) return jsonResponse({ error: "Missing invitationId." }, 400);
    if (!email) return jsonResponse({ error: "Email is required." }, 400);
    if (!password || password.length < 8) return jsonResponse({ error: "Password must be at least 8 characters." }, 400);
    if (!firstName || !lastName) return jsonResponse({ error: "First and last name are required." }, 400);

    const { data: invitation, error: invitationError } = await service
      .from("invitations")
      .select("id, client_id, email, role, map_ids, expires_at, accepted_at")
      .eq("id", invitationId)
      .maybeSingle();
    if (invitationError) throw invitationError;
    if (!invitation) return jsonResponse({ error: "This invitation is invalid or has expired." }, 404);
    if (invitation.accepted_at) return jsonResponse({ error: "This invitation has already been accepted." }, 409);
    if ((invitation.email ?? "").trim().toLowerCase() !== email) {
      return jsonResponse({ error: "Use the same email address this invitation was sent to." }, 400);
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: "This invitation has expired." }, 410);
    }

    const { data: usersPage, error: usersErr } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersErr) throw usersErr;
    const exists = (usersPage?.users ?? []).some((u) => (u.email ?? "").trim().toLowerCase() === email);
    if (exists) {
      return jsonResponse(
        { error: "This user already has an account. Please use login instead of creating a new account." },
        409
      );
    }

    const { data: crossClientContact } = await service
      .from("contacts")
      .select("id")
      .eq("email", email)
      .neq("client_id", invitation.client_id)
      .limit(1);
    if ((crossClientContact ?? []).length > 0) {
      return jsonResponse({ error: "This user already belongs to another organisation." }, 409);
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const { data: createdUser, error: createUserErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        source: "team_invitation_signup",
      },
    });
    if (createUserErr) throw createUserErr;
    createdUserId = createdUser?.user?.id ?? null;
    if (!createdUserId) throw new Error("Could not create user.");

    const { data: insertedContact, error: contactError } = await service
      .from("contacts")
      .insert({
        client_id: invitation.client_id,
        user_id: createdUserId,
        email,
        name: fullName,
        role: invitation.role,
        is_primary: false,
      })
      .select("id")
      .single();
    if (contactError) throw contactError;
    createdContactId = insertedContact?.id ?? null;

    const mapIds = Array.isArray(invitation.map_ids) ? invitation.map_ids.filter(Boolean) : [];
    if (mapIds.length > 0 && createdContactId) {
      const rows = mapIds.map((mapId: string) => ({ contact_id: createdContactId, map_id: mapId }));
      const { error: permErr } = await service.from("contact_map_permissions").insert(rows);
      if (permErr) throw permErr;
    }

    const { error: acceptedErr } = await service
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitationId);
    if (acceptedErr) throw acceptedErr;

    return jsonResponse({ ok: true, email, userId: createdUserId, contactId: createdContactId });
  } catch (e) {
    if (createdContactId) {
      await service.from("contacts").delete().eq("id", createdContactId);
    }
    if (createdUserId) {
      await service.auth.admin.deleteUser(createdUserId);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
