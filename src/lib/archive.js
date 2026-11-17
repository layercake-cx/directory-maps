import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { recordAdminEvent } from "./adminEvents.js";

/**
 * Archive / Restore (docs/design/discover-ui/ARCHIVE_BRIEF.md). Archiving never deletes anything: it flips
 * is_active and stamps who/when. "Live" = the item is active AND its customer is active; the database
 * computes that (is_entity_live), so archiving a customer never touches its maps or directories.
 */

export const ARCHIVE_CONFIRM_WORD = "ARCHIVE";

/** The typed confirmation: exact, case-sensitive, surrounding spaces trimmed. */
export function isArchiveConfirmation(text) {
  return String(text ?? "").trim() === ARCHIVE_CONFIRM_WORD;
}

const TABLES = { map: "maps", directory: "directories", client: "clients" };
const LABELS = { map: "map", directory: "directory", client: "customer" };

export function entityNoun(entityType, count = 1) {
  if (entityType === "directory") return count === 1 ? "directory" : "directories";
  if (entityType === "map") return count === 1 ? "map" : "maps";
  return count === 1 ? "customer" : "customers";
}

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/** Archive (archived = true) or restore (false) one or many rows. Throws on failure; nothing changes then. */
export async function setArchived(entityType, ids, archived) {
  const table = TABLES[entityType];
  const list = [...new Set((ids ?? []).filter(Boolean))];
  if (!table || list.length === 0) return;
  const patch = archived
    ? { is_active: false, archived_at: new Date().toISOString(), archived_by: await currentUserId() }
    : { is_active: true, archived_at: null, archived_by: null };
  const { data, error } = await supabase.from(table).update(patch).in("id", list).select("id");
  if (error) throw error;
  if ((data?.length ?? 0) !== list.length) {
    throw new Error(`Could not ${archived ? "archive" : "restore"} every ${LABELS[entityType]} (permission denied?). Nothing was changed for the rest.`);
  }
}

export const archiveMap = (id) => setArchived("map", [id], true);
export const restoreMap = (id) => setArchived("map", [id], false);
export const archiveMaps = (ids) => setArchived("map", ids, true);
export const restoreMaps = (ids) => setArchived("map", ids, false);
export const archiveClient = (id) => setArchived("client", [id], true);
export const restoreClient = (id) => setArchived("client", [id], false);
export const archiveDirectories = (ids) => setArchived("directory", ids, true);

/**
 * Fire-and-forget admin events: `<entity>_archived` / `_restored`, `_bulk_` variants carry a count.
 * `items` are `{id, name, was_live}`; `trigger` is row_menu | bulk | banner | settings | undo.
 */
export function recordArchiveEvent({ entityType, action, items, trigger, clientId, isStaff, source }) {
  const bulk = items.length > 1;
  const eventType = `${entityType}_${bulk ? "bulk_" : ""}${action}`;
  const base = {
    actor_role: "admin",
    actor_admin_scope: isStaff ? "platform_admin" : "client_manager",
    client_id: entityType === "client" ? items[0]?.id ?? clientId ?? null : clientId ?? null,
    source: source ?? (isStaff ? "admin_dashboard" : "client_portal"),
    trigger,
  };
  const meta = bulk
    ? { ...base, count: items.length, ids: items.map((i) => i.id), was_live: items.some((i) => i.was_live) }
    : { ...base, [`${entityType}_id`]: items[0]?.id, ...(entityType === "map" ? { map_id: items[0]?.id } : {}), name: items[0]?.name, was_live: !!items[0]?.was_live };
  recordAdminEvent(supabase, { eventType, meta, clientId: base.client_id });
}

const bullet = (text) => text;

/**
 * Real consequences for the Archive dialog, computed from data before it opens.
 * Only live items are listed as "going offline". Returns an array of strings.
 *
 * @param {"directory"|"map"|"client"} entityType
 * @param {{id: string, name?: string, published_at?: string|null}[]} items
 */
export async function getArchiveConsequences(entityType, items) {
  const ids = items.map((i) => i.id);
  const out = [];
  try {
    if (entityType === "directory") {
      const { data: doms } = await supabase.from("client_domains").select("hostname, status").in("directory_id", ids);
      const hosts = (doms ?? []).filter((d) => d.status === "active").map((d) => d.hostname);
      const anyLive = items.some((i) => i.published_at);
      if (anyLive) out.push(bullet(`${hosts.length ? hosts.join(", ") : "The directory site"} goes offline. Visitors see a "no longer available" page.`));
      const { data: assocs } = await supabase.from("directory_map_associations").select("map_id").in("directory_id", ids);
      if (assocs?.length) {
        const { data: maps } = await supabase.from("maps").select("name").in("id", [...new Set(assocs.map((a) => a.map_id))]);
        const names = (maps ?? []).map((m) => m.name);
        out.push(bullet(`${names.length} linked ${entityNoun("map", names.length)} (${names.join(", ")}) stop updating from ${ids.length > 1 ? "these directories" : "this directory"}.`));
      }
      out.push("Claims, enquiries and AI jobs stop.");
      out.push("Entries, pages, settings and publish history are all kept.");
    } else if (entityType === "map") {
      if (items.some((i) => i.published_at)) out.push('The map and every embed go offline. Embeds show "This map is no longer available".');
      const { data: srcs } = await supabase.from("map_data_sources").select("sync_schedule").in("map_id", ids).not("sync_schedule", "is", null);
      if (srcs?.length) out.push("Scheduled Google Sheets syncs pause.");
      out.push("Listings, groups, filters and settings are kept.");
    } else {
      const id = ids[0];
      const [{ data: maps }, { data: dirs }, { data: contacts }] = await Promise.all([
        supabase.from("maps").select("id, published_at, is_active").eq("client_id", id),
        supabase.from("directories").select("id, published_at, is_active").eq("client_id", id),
        supabase.from("contacts").select("id").eq("client_id", id).not("user_id", "is", null),
      ]);
      const liveMaps = (maps ?? []).filter((m) => m.is_active && m.published_at).length;
      const liveDirs = (dirs ?? []).filter((d) => d.is_active && d.published_at).length;
      out.push(`${liveMaps} ${entityNoun("map", liveMaps)} and ${liveDirs} ${entityNoun("directory", liveDirs)} go offline (custom domains included).`);
      const users = contacts?.length ?? 0;
      out.push(`${users} ${users === 1 ? "user" : "users"} can't sign in. They'll see "This account is archived. Contact Layercake to restore it."`);
      out.push("Scheduled syncs, AI jobs and outgoing emails stop.");
      out.push("Billing and plan are not changed here.");
    }
  } catch {
    // Consequences are advisory: never block the dialog because a count failed.
  }
  return out;
}

/** True when the signed-in user belongs to an archived customer (ClientGate then signs them out). */
export async function isMyClientArchived() {
  const { data, error } = await supabase.rpc("my_client_is_archived");
  if (error) return false; // fail open: the database still returns no rows for an archived customer
  return data === true;
}

/** 'live' | 'archived' | 'missing' for a public page that could not load its entity. */
export async function fetchEntityStatusBySlug(entityType, clientSlug, entitySlug) {
  const { data, error } = await supabase.rpc("entity_status_by_slug", {
    p_entity_type: entityType, p_client_slug: clientSlug, p_entity_slug: entitySlug,
  });
  return error ? "missing" : data ?? "missing";
}

export async function fetchEntityStatus(entityType, entityId) {
  const { data, error } = await supabase.rpc("entity_status", { p_entity_type: entityType, p_entity_id: entityId });
  return error ? "missing" : data ?? "missing";
}

/** Best-effort display name of whoever archived something (a contact record, when readable). */
export function useArchivedByName(userId) {
  const [name, setName] = useState(null);
  useEffect(() => {
    if (!userId) { setName(null); return undefined; }
    let cancelled = false;
    supabase.from("contacts").select("name, email").eq("user_id", userId).limit(1).maybeSingle()
      .then(({ data }) => { if (!cancelled) setName(data?.name || data?.email || null); }, () => {});
    return () => { cancelled = true; };
  }, [userId]);
  return name;
}
