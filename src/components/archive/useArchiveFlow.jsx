import React, { useCallback, useState } from "react";
import { ArchiveDialog, useConfirm, useToast } from "../ui/index.js";
import { entityNoun, getArchiveConsequences, recordArchiveEvent, setArchived } from "../../lib/archive.js";

/**
 * One archive/restore flow for every list and record page (ARCHIVE_BRIEF.md §2.5).
 * Archive: loads the real consequences, opens ArchiveDialog (typed ARCHIVE), then Toast with Undo.
 * Restore: a single click (customers get a plain confirm), Toast "… restored." (+ "It's live again.").
 *
 * @param {{ entityType: "directory"|"map"|"client", isStaff?: boolean, clientId?: string|null,
 *   onChanged?: () => void }} opts
 * Items are `{id, name, published_at?, client_id?}`; "was live" is derived from published_at.
 * @returns {{ requestArchive: Function, restore: Function, dialog: React.ReactNode, busyIds: string[] }}
 */
export function useArchiveFlow({ entityType, isStaff = false, clientId = null, onChanged }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [req, setReq] = useState(null);
  const [busyIds, setBusyIds] = useState([]);
  const thing = entityType === "client" ? "customer" : entityType;

  const normalise = (items) =>
    items.map((i) => ({
      id: i.id,
      name: i.name,
      client_id: i.client_id ?? clientId,
      published_at: i.published_at,
      was_live: !!i.published_at && i.is_active !== false,
    }));

  const restore = useCallback(
    async (items, trigger = "row_menu") => {
      const list = normalise(items);
      if (entityType === "client") {
        const ok = await confirm({
          title: `Restore ${list[0].name}?`,
          body: "Users can sign in again and their live maps and directories come back.",
          confirmLabel: "Restore customer",
        });
        if (!ok) return;
      }
      setBusyIds(list.map((i) => i.id));
      try {
        await setArchived(entityType, list.map((i) => i.id), false);
        recordArchiveEvent({ entityType, action: "restored", items: list, trigger, clientId: list[0].client_id, isStaff });
        const anyLive = list.some((i) => i.was_live);
        const label = list.length > 1 ? `${list.length} ${entityNoun(entityType, list.length)}` : list[0].name;
        toast(`${label} restored.${anyLive ? " It's live again." : ""}`);
        onChanged?.();
      } catch (e) {
        toast(e?.message ?? String(e));
      } finally {
        setBusyIds([]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityType, isStaff, clientId, onChanged, confirm, toast],
  );

  const requestArchive = useCallback(
    async (items, trigger = "row_menu") => {
      const list = normalise(items);
      const consequences = await getArchiveConsequences(entityType, list);
      setReq({ items: list, trigger, consequences });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityType, clientId],
  );

  async function confirmArchive() {
    const { items, trigger } = req;
    await setArchived(entityType, items.map((i) => i.id), true); // throws: the dialog stays open with the error
    recordArchiveEvent({ entityType, action: "archived", items, trigger, clientId: items[0].client_id, isStaff });
    setReq(null);
    const label = items.length > 1 ? `${items.length} ${entityNoun(entityType, items.length)}` : items[0].name;
    toast(`${label} archived. It's offline now.`, { action: { label: "Undo", onClick: () => restore(items, "undo") } });
    onChanged?.();
  }

  const dialog = req ? (
    <ArchiveDialog
      entityType={thing}
      name={req.items[0].name}
      count={req.items.length}
      consequences={req.consequences}
      onConfirm={confirmArchive}
      onClose={() => setReq(null)}
    />
  ) : null;

  return { requestArchive, restore, dialog, busyIds };
}
