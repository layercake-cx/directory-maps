import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  emailDomainStatusLabel,
  emailDomainStatusTone,
  invokeManageClientEmail,
} from "../lib/clientEmail.js";
import { recordAdminEvent } from "../lib/adminEvents.js";
import { useMessagingAllowed } from "../hooks/useMessagingAllowed.js";
import EntitlementGate from "./EntitlementGate.jsx";
import { getBlockedMessage } from "../lib/entitlementMessages.js";
import MessagingProfileEditor from "./MessagingProfileEditor.jsx";
import styles from "../pages/client/ClientEmail.module.css";

const PROFILE_COLUMNS =
  "id,client_id,name,email_from_name,email_from_address,email_domain,resend_domain_id,email_domain_status,email_dns_records";

/**
 * Organisation-level list of messaging profiles (sending identities), for the client
 * portal and the admin customer detail. Which profile a map or directory sends through,
 * whether messaging is on, test mode, and the message text are set on the map or
 * directory itself.
 * @param {{ clientId: string, clientName?: string, eventSource?: string }} props
 */
export default function MessagingProfiles({ clientId, clientName = "", eventSource = "client_portal" }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [usage, setUsage] = useState({}); // profileId -> { maps, directories }
  const [selectedId, setSelectedId] = useState(null);
  // ?new=1 (from a map or directory's Sending profile panel) opens the create form straight away.
  const [creating, setCreating] = useState(() => new URLSearchParams(window.location.search).get("new") === "1");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFromName, setNewFromName] = useState("");
  const [newFromAddress, setNewFromAddress] = useState("");

  const { allowed: messagingAllowed, loading: messagingGateLoading } = useMessagingAllowed(clientId, eventSource);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("messaging_profiles")
        .select(PROFILE_COLUMNS)
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      setProfiles(rows);

      const counts = {};
      if (rows.length) {
        const ids = rows.map((p) => p.id);
        const [maps, dirs] = await Promise.all([
          supabase.from("maps").select("messaging_profile_id").in("messaging_profile_id", ids),
          supabase.from("directories").select("messaging_profile_id").in("messaging_profile_id", ids),
        ]);
        for (const r of maps.data ?? []) {
          (counts[r.messaging_profile_id] ??= { maps: 0, directories: 0 }).maps += 1;
        }
        for (const r of dirs.data ?? []) {
          (counts[r.messaging_profile_id] ??= { maps: 0, directories: 0 }).directories += 1;
        }
      }
      setUsage(counts);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleUpdated(profile) {
    if (!profile) return;
    setProfiles((rows) => rows.map((p) => (p.id === profile.id ? { ...p, ...profile } : p)));
  }

  function handleDeleted(id) {
    setProfiles((rows) => rows.filter((p) => p.id !== id));
    setSelectedId(null);
    load();
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || !newFromAddress.trim()) {
      setErr("A profile name and a from email address are required.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const data = await invokeManageClientEmail({
        clientId,
        action: "create",
        name: newName,
        fromName: newFromName,
        fromAddress: newFromAddress,
      });
      recordAdminEvent(supabase, {
        eventType: "email_profile_created",
        clientId,
        meta: { client_id: clientId, profile_id: data.profile.id, email_provider: "resend", source: eventSource },
      });
      setProfiles((rows) => [...rows, data.profile]);
      setCreating(false);
      setNewName("");
      setNewFromName("");
      setNewFromAddress("");
      setSelectedId(data.profile.id);
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setBusy(false);
    }
  }

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  return (
    <>
      {err && !selected ? <p className={styles.error}>{err}</p> : null}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <EntitlementGate
          allowed={messagingAllowed}
          loading={messagingGateLoading}
          message={getBlockedMessage("messaging")}
        >
          {selected ? (
            <MessagingProfileEditor
              profile={selected}
              clientId={clientId}
              clientName={clientName}
              eventSource={eventSource}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className={styles.messagingGrid}>
              <section className={`${styles.panelBox} ${styles.panelBoxFull}`}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Sending profiles</h2>
                  {!creating ? (
                    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                      New profile
                    </button>
                  ) : null}
                </div>
                <p className={styles.hint}>
                  A sending profile is the address visitor messages are sent <em>from</em>, with its own domain
                  verification. Create as many as you need, then choose one on each map or directory (under its
                  Messaging tab) and turn messaging on there. A map or directory with no profile chosen cannot
                  send messages.
                </p>

                {creating ? (
                  <form onSubmit={handleCreate} className={styles.panelSubsection}>
                    <label className={styles.field}>
                      <span>
                        Profile name <span className={styles.required}>*</span>
                      </span>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Events team"
                        required
                      />
                    </label>
                    <div className={styles.fromAddressRow}>
                      <label className={styles.field}>
                        <span>Display name</span>
                        <input
                          type="text"
                          value={newFromName}
                          onChange={(e) => setNewFromName(e.target.value)}
                          placeholder={clientName || "Your organisation"}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>
                          Email address <span className={styles.required}>*</span>
                        </span>
                        <input
                          type="email"
                          value={newFromAddress}
                          onChange={(e) => setNewFromAddress(e.target.value)}
                          placeholder="hello@yourcompany.com"
                          required
                        />
                      </label>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className="btn btn-primary" disabled={busy}>
                        {busy ? "Creating…" : "Create profile"}
                      </button>
                      <button type="button" className="btn" onClick={() => setCreating(false)} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}

                {profiles.length === 0 && !creating ? (
                  <p className={styles.note}>
                    No sending profiles yet. Create one to start sending messages from a map or directory.
                  </p>
                ) : null}

                {profiles.length > 0 ? (
                  <table className={styles.dnsTable}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>From</th>
                        <th>Domain</th>
                        <th>Used by</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.map((p) => {
                        const u = usage[p.id] ?? { maps: 0, directories: 0 };
                        const parts = [];
                        if (u.maps) parts.push(`${u.maps} map${u.maps === 1 ? "" : "s"}`);
                        if (u.directories) parts.push(`${u.directories} director${u.directories === 1 ? "y" : "ies"}`);
                        const tone = emailDomainStatusTone(p.email_domain_status);
                        return (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                            </td>
                            <td>{p.email_from_address || "—"}</td>
                            <td>
                              <span className={`${styles.badge} ${styles[`badge--${tone}`]}`}>
                                {emailDomainStatusLabel(p.email_domain_status)}
                              </span>
                            </td>
                            <td>{parts.length ? parts.join(", ") : "Not used yet"}</td>
                            <td>
                              <button type="button" className="btn" onClick={() => setSelectedId(p.id)}>
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : null}
              </section>
            </div>
          )}
        </EntitlementGate>
      )}
    </>
  );
}
