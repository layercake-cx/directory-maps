import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

export type SeatCheck = {
  ok: boolean;
  /** null = unlimited */
  limit: number | null;
  /** Current contacts for the client. */
  used: number;
  /** Unaccepted, unexpired invitations (each will take a seat when accepted). */
  pending: number;
  message: string | null;
};

/**
 * Mirrors the precedence in the `enforce_seats_limit()` trigger on public.contacts
 * (kill switch > client override > founder tier > plan row > feature default) so we can refuse an
 * invitation up front instead of emailing a link that dead-ends at sign-up. The trigger stays the
 * source of truth; this is a courtesy pre-check.
 *
 * `ignoreInvitationId`: exclude this invitation from the pending count (when accepting it).
 * `countPending`: set false when the caller is about to insert the contact itself.
 */
export async function checkSeatAvailability(
  service: SupabaseClient,
  clientId: string,
  opts: { ignoreInvitationId?: string; countPending?: boolean } = {}
): Promise<SeatCheck> {
  const { data: feature, error: fErr } = await service
    .from("features")
    .select("id, kill_switch_enabled, default_limit_value")
    .eq("product_key", "maps")
    .eq("key", "seats")
    .maybeSingle();
  if (fErr) throw fErr;
  if (!feature) return { ok: true, limit: null, used: 0, pending: 0, message: null };

  const { data: client, error: cErr } = await service
    .from("clients")
    .select("plan_key")
    .eq("id", clientId)
    .maybeSingle();
  if (cErr) throw cErr;
  const planKey = (client?.plan_key as string | null) ?? "standard";

  const [{ data: plan }, { data: override }, { data: planFeature }] = await Promise.all([
    service.from("plans").select("is_founder_tier").eq("key", planKey).maybeSingle(),
    service
      .from("client_overrides")
      .select("limit_value")
      .eq("feature_id", feature.id)
      .eq("client_id", clientId)
      .maybeSingle(),
    service
      .from("plan_features")
      .select("limit_value")
      .eq("feature_id", feature.id)
      .eq("plan_key", planKey)
      .maybeSingle(),
  ]);

  let limit: number | null;
  if (feature.kill_switch_enabled) limit = 0;
  else if (override) limit = override.limit_value ?? null;
  else if (plan?.is_founder_tier) limit = null;
  else if (planFeature) limit = planFeature.limit_value ?? null;
  else limit = feature.default_limit_value ?? null;

  if (limit === null) return { ok: true, limit, used: 0, pending: 0, message: null };

  const { count: used, error: uErr } = await service
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);
  if (uErr) throw uErr;

  let pending = 0;
  if (opts.countPending !== false) {
    let q = service
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString());
    if (opts.ignoreInvitationId) q = q.neq("id", opts.ignoreInvitationId);
    const { count, error: pErr } = await q;
    if (pErr) throw pErr;
    pending = count ?? 0;
  }

  const taken = (used ?? 0) + pending;
  if (taken >= limit) {
    const pendingNote = pending > 0 ? ` (${used ?? 0} in use, ${pending} pending invitation${pending === 1 ? "" : "s"})` : "";
    return {
      ok: false,
      limit,
      used: used ?? 0,
      pending,
      message:
        `No team seats left for this organisation: ${limit} seat${limit === 1 ? "" : "s"} on its plan${pendingNote}. ` +
        `Upgrade the plan or add a seat override before inviting more people.`,
    };
  }
  return { ok: true, limit, used: used ?? 0, pending, message: null };
}
