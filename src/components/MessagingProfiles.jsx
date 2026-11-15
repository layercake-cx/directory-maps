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
import {
  Button, Callout, DataTable, EmptyState, Field, FieldGrid, Pill, Section, Skeleton, TextInput,
} from "./ui/index.js";
import "../styles/wave-b/messaging.css";

// emailDomainStatusTone (lib/clientEmail.js) -> Pill tone.
const PILL_TONE = { success: "ok", warning: "warn", error: "danger", muted: "neutral" };

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

  const columns = [
    { key: "name", label: "Name", render: (p) => <strong>{p.name}</strong> },
    { key: "email_from_address", label: "From", className: "wb5-wrap", render: (p) => p.email_from_address || "—" },
    {
      key: "email_domain_status",
      label: "Domain",
      render: (p) => (
        <Pill tone={PILL_TONE[emailDomainStatusTone(p.email_domain_status)] || "neutral"}>
          {emailDomainStatusLabel(p.email_domain_status)}
        </Pill>
      ),
    },
    {
      key: "usage",
      label: "Used by",
      render: (p) => {
        const u = usage[p.id] ?? { maps: 0, directories: 0 };
        const parts = [];
        if (u.maps) parts.push(`${u.maps} map${u.maps === 1 ? "" : "s"}`);
        if (u.directories) parts.push(`${u.directories} director${u.directories === 1 ? "y" : "ies"}`);
        return parts.length ? parts.join(", ") : "Not used yet";
      },
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (p) => (
        <Button size="sm" aria-label={`Edit ${p.name}`} onClick={() => setSelectedId(p.id)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      {err && !selected ? <Callout tone="danger">{err}</Callout> : null}

      {loading ? (
        <Skeleton variant="list" rows={3} label="Loading sending profiles" />
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
            <Section
              title="Sending profiles"
              description={(
                <>
                  A sending profile is the address visitor messages are sent <em>from</em>, with its own domain
                  verification. Create as many as you need, then choose one on each map or directory (under its
                  Messaging tab) and turn messaging on there. A map or directory with no profile chosen cannot
                  send messages.
                </>
              )}
              actions={
                !creating ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    New profile
                  </Button>
                ) : null
              }
            >
              <div className="wb5-stack">
                {creating ? (
                  <form onSubmit={handleCreate} className="wb5-form">
                    <Field label="Profile name" required>
                      <TextInput
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Events team"
                      />
                    </Field>
                    <FieldGrid>
                      <Field label="Display name">
                        <TextInput
                          type="text"
                          value={newFromName}
                          onChange={(e) => setNewFromName(e.target.value)}
                          placeholder={clientName || "Your organisation"}
                        />
                      </Field>
                      <Field label="Email address" required>
                        <TextInput
                          type="email"
                          value={newFromAddress}
                          onChange={(e) => setNewFromAddress(e.target.value)}
                          placeholder="hello@yourcompany.com"
                        />
                      </Field>
                    </FieldGrid>
                    <div className="wb5-row">
                      <Button type="submit" variant="primary" loading={busy} loadingLabel="Creating…">
                        Create profile
                      </Button>
                      <Button onClick={() => setCreating(false)} disabled={busy}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : null}

                {profiles.length === 0 && !creating ? (
                  <EmptyState
                    art="none"
                    title="No sending profiles yet"
                    body="Create one to start sending messages from a map or directory."
                  />
                ) : null}

                {profiles.length > 0 ? (
                  <DataTable
                    caption="Sending profiles"
                    columns={columns}
                    rows={profiles}
                    getRowId={(p) => p.id}
                    getRowLabel={(p) => p.name}
                  />
                ) : null}
              </div>
            </Section>
          )}
        </EntitlementGate>
      )}
    </>
  );
}
