const ROLE_ORDER = { owner: 0, manager: 1, member: 2 };

export function sortTeamRows(rows) {
  return [...rows].sort((a, b) => {
    const aPending = a.row_kind === "invite_pending";
    const bPending = b.row_kind === "invite_pending";
    if (aPending !== bPending) return aPending ? 1 : -1;
    const ra = ROLE_ORDER[a.role] ?? 9;
    const rb = ROLE_ORDER[b.role] ?? 9;
    if (ra !== rb) return ra - rb;
    return (a.email ?? "").localeCompare(b.email ?? "", undefined, { sensitivity: "base" });
  });
}

export function getTeamStatus(row) {
  if (row.row_kind === "invite_pending") {
    return { label: "Invite pending", tone: "pending" };
  }
  if (!row.user_id) {
    return { label: "Active", tone: "active" };
  }
  if (!row.email_confirmed_at) {
    return { label: "Awaiting verification", tone: "warning" };
  }
  if (row.last_sign_in_at) {
    return { label: "Active", tone: "active" };
  }
  return { label: "Never signed in", tone: "muted" };
}

export function formatLastLoggedIn(row) {
  if (row.row_kind === "invite_pending") return "—";
  if (!row.user_id) return "—";
  if (!row.email_confirmed_at) return "—";
  if (!row.last_sign_in_at) return "Never";

  const d = new Date(row.last_sign_in_at);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function inviteMapNames(mapIds, maps) {
  if (!mapIds?.length) return "—";
  const byId = new Map((maps ?? []).map((m) => [m.id, m.name]));
  const names = mapIds.map((id) => byId.get(id)).filter(Boolean);
  if (!names.length) return `${mapIds.length} map(s)`;
  return names.join(", ");
}
