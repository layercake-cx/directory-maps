import { createServiceClient, requireAdmin } from "../_shared/supabase.ts";

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

async function recordAdminEvent(
  service: ReturnType<typeof createServiceClient>,
  {
    eventType,
    actorUserId,
    clientId,
    contactId,
    source,
    error,
    associatedClients,
  }: {
    eventType: string;
    actorUserId: string;
    clientId: string;
    contactId?: string | null;
    source: string;
    error?: string;
    associatedClients?: Array<{ id: string; name: string | null }>;
  }
) {
  await service.from("admin_events").insert({
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
      source,
      contact_id: contactId ?? null,
      ...(associatedClients ? { associated_clients: associatedClients } : {}),
      ...(error ? { error } : {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const service = createServiceClient();
  try {
    const adminUser = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
    const contactId = typeof body?.contactId === "string" ? body.contactId.trim() : "";
    if (!clientId) return jsonResponse({ error: "Missing clientId." }, 400);
    if (!contactId) return jsonResponse({ error: "Missing contactId." }, 400);

    const { data: contact, error: contactError } = await service
      .from("contacts")
      .select("id, client_id, user_id, email, is_primary")
      .eq("id", contactId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (contactError) throw contactError;
    if (!contact) return jsonResponse({ error: "User contact not found." }, 404);

    const userId = contact.user_id as string | null;
    if (userId) {
      const { data: otherLinks, error: linksError } = await service
        .from("contacts")
        .select("client_id")
        .eq("user_id", userId)
        .neq("client_id", clientId);
      if (linksError) throw linksError;

      if ((otherLinks ?? []).length > 0) {
        const otherClientIds = Array.from(new Set((otherLinks ?? []).map((r) => r.client_id).filter(Boolean)));
        const { data: clients } = await service.from("clients").select("id, name").in("id", otherClientIds);
        const associated = (clients ?? []).map((c) => ({ id: c.id as string, name: (c.name as string) ?? null }));

        await recordAdminEvent(service, {
          eventType: "team_member_delete_blocked",
          actorUserId: adminUser.id,
          clientId,
          contactId,
          source: "admin_client_users_tab",
          error: "User associated with another client.",
          associatedClients: associated,
        });

        return jsonResponse(
          {
            error: "This user is associated with another client and cannot be deleted.",
            associatedClients: associated,
          },
          409
        );
      }

      const { error: authDeleteError } = await service.auth.admin.deleteUser(userId);
      if (authDeleteError) throw authDeleteError;
    }

    const { error: deleteContactError } = await service.from("contacts").delete().eq("id", contactId).eq("client_id", clientId);
    if (deleteContactError) throw deleteContactError;

    await recordAdminEvent(service, {
      eventType: "team_member_removed",
      actorUserId: adminUser.id,
      clientId,
      contactId,
      source: "admin_client_users_tab",
    });

    return jsonResponse({ ok: true, deletedContactId: contactId, deletedUserId: userId ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "Not authenticated" ? 401 : msg.includes("Admin access required") ? 403 : 500;
    return jsonResponse({ error: msg }, status);
  }
});
