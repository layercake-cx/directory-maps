import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { recordAdminEvent } from "../lib/adminEvents.js";
import { canManageOrg } from "../lib/clientAuth.js";
import {
  archiveDirectory,
  deleteDirectoryPermanently,
  getContactDirectoryPermission,
  getDirectory,
  getMapsLinkedToDirectory,
} from "../lib/directories.js";
import { loadDirectoryTermIds, setDirectoryTerms } from "../lib/categorisations.js";
import { DirectoryContext } from "./directoryContext.js";

/**
 * Shared directory data/permissions for every route under a directory's panel (client and
 * admin). Extracted from what ClientDirectoryEntries.jsx/AdminDirectoryEntries.jsx used to fetch
 * and compute independently — same calls, same logic, now shared across sibling routes instead
 * of duplicated per tab.
 *
 * `client` (client-portal only): pass the already-loaded client object from ClientContext so this
 * provider doesn't refetch it. `clientId` (admin only): route param — the provider fetches the
 * client's name/slug itself since admin has no equivalent shared client context.
 */
export function DirectoryProvider({ directoryId, clientId, client: clientProp, isAdminView = false, contact, children }) {
  const navigate = useNavigate();
  const source = isAdminView ? "admin_dashboard" : "client_portal";
  const effectiveClientId = clientProp?.id ?? clientId ?? null;

  const recordEvent = useCallback(
    (eventType, meta) => {
      recordAdminEvent(supabase, { eventType, meta, source, clientId: effectiveClientId });
    },
    [source, effectiveClientId],
  );

  const [directory, setDirectory] = useState(null);
  const [client, setClient] = useState(clientProp ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [permission, setPermission] = useState(null);
  const [permissionChecked, setPermissionChecked] = useState(isAdminView);

  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const [directoryTermIds, setDirectoryTermIds] = useState([]);
  const [savingTerms, setSavingTerms] = useState(false);
  const [linkedMaps, setLinkedMaps] = useState([]);

  const refetch = useCallback(async () => {
    try {
      setDirectory(await getDirectory(directoryId));
    } catch (e) {
      setError(e?.message ?? String(e));
    }
  }, [directoryId]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        const tasks = [refetch()];
        if (isAdminView && !clientProp) {
          tasks.push(
            supabase.from("clients").select("id,name,slug").eq("id", clientId).single().then(({ data }) => setClient(data)),
          );
        }
        await Promise.all(tasks);
      } catch (e) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryId, clientId, isAdminView]);

  useEffect(() => {
    if (clientProp) setClient(clientProp);
  }, [clientProp]);

  useEffect(() => {
    loadDirectoryTermIds(directoryId).then(setDirectoryTermIds).catch(() => {});
  }, [directoryId]);

  useEffect(() => {
    getMapsLinkedToDirectory(directoryId).then(setLinkedMaps).catch(() => {});
  }, [directoryId]);

  const canManage = isAdminView ? true : canManageOrg(contact);

  useEffect(() => {
    if (canManage || contact?.has_all_access) {
      setPermissionChecked(true);
      return;
    }
    if (!contact?.id || !directoryId) return;
    setPermissionChecked(false);
    getContactDirectoryPermission(contact.id, directoryId)
      .then(setPermission)
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setPermissionChecked(true));
  }, [canManage, contact?.id, contact?.has_all_access, directoryId]);

  const handleDirectoryTermsChange = useCallback(
    async (ids) => {
      setDirectoryTermIds(ids);
      try {
        setSavingTerms(true);
        await setDirectoryTerms(directoryId, ids);
        recordEvent("directory_terms_updated", { directory_id: directoryId });
      } catch (e) {
        setError(e?.message ?? String(e));
      } finally {
        setSavingTerms(false);
      }
    },
    [directoryId, recordEvent],
  );

  const afterDeleteHref = isAdminView ? `/admin/clients/${encodeURIComponent(clientId)}` : "/client/directories";

  const handleArchive = useCallback(async () => {
    const publishedLinkedMaps = linkedMaps.filter((m) => m.current_publication_id);
    const warning = linkedMaps.length
      ? `\n\nWarning: ${linkedMaps.length === 1 ? "the map" : "maps"} "${linkedMaps.map((m) => m.name).join('", "')}" use${linkedMaps.length === 1 ? "s" : ""} this directory as ${linkedMaps.length === 1 ? "its" : "their"} live pin source. Archiving does NOT remove ${linkedMaps.length === 1 ? "it" : "them"} from public view` +
        (publishedLinkedMaps.length ? ` — ${publishedLinkedMaps.length === 1 ? "it is" : "they are"} published and will keep showing this directory's data. Archive or delete the map itself to remove it from public view.` : ".")
      : "";
    const audience = isAdminView ? "this customer's" : "your";
    if (!window.confirm(`Archive "${directory?.name}"? It will be hidden from ${audience} directories list.${warning}`)) return;
    try {
      setArchiving(true);
      await archiveDirectory(directoryId);
      recordEvent("directory_archived", { directory_id: directoryId, name: directory?.name });
      navigate(afterDeleteHref);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setArchiving(false);
    }
  }, [directoryId, directory?.name, linkedMaps, isAdminView, afterDeleteHref, navigate, recordEvent]);

  const handleDelete = useCallback(async () => {
    if (deleteText !== "DELETE") return;
    try {
      setDeleting(true);
      await deleteDirectoryPermanently(directoryId);
      recordEvent("directory_deleted", { directory_id: directoryId, name: directory?.name });
      navigate(afterDeleteHref);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }, [directoryId, directory?.name, deleteText, afterDeleteHref, navigate, recordEvent]);

  const basePath = isAdminView
    ? `/admin/clients/${encodeURIComponent(clientId)}/directories/${encodeURIComponent(directoryId)}`
    : `/client/directories/${encodeURIComponent(directoryId)}`;

  const hasAllAccess = !!contact?.has_all_access;
  const canEditEntries = canManage || hasAllAccess || !!permission?.can_edit_entries;
  const hasAccess = canManage || hasAllAccess || !!permission;

  const value = useMemo(
    () => ({
      directoryId,
      clientId: effectiveClientId,
      client,
      directory,
      loading,
      error,
      refetch,
      isAdminView,
      recordEvent,
      basePath,
      backHref: isAdminView ? `/admin/clients/${encodeURIComponent(clientId)}` : "/client/directories",
      backLabel: isAdminView ? "Back to customer" : "All directories",
      domainsHref: isAdminView ? `/admin/clients/${encodeURIComponent(clientId)}` : "/client/domains",
      canManage,
      canEditEntries,
      canPublish: canManage,
      hasAccess,
      permissionChecked,
      directoryTermIds,
      savingTerms,
      handleDirectoryTermsChange,
      linkedMaps,
      archiving,
      deleting,
      deleteOpen,
      setDeleteOpen,
      deleteText,
      setDeleteText,
      handleArchive,
      handleDelete,
    }),
    [
      directoryId,
      effectiveClientId,
      client,
      directory,
      loading,
      error,
      refetch,
      isAdminView,
      recordEvent,
      basePath,
      clientId,
      canManage,
      canEditEntries,
      hasAccess,
      permissionChecked,
      directoryTermIds,
      savingTerms,
      handleDirectoryTermsChange,
      linkedMaps,
      archiving,
      deleting,
      deleteOpen,
      deleteText,
      handleArchive,
      handleDelete,
    ],
  );

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}
