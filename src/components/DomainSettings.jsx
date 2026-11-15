import React, { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "../lib/supabase";
import { domainStatusLabel, domainStatusTone, invokeManageClientDomain } from "../lib/clientDomains.js";
import { recordAdminEvent } from "../lib/adminEvents.js";
import { useEntitlement } from "../hooks/useEntitlements.js";
import { fetchClientEntitlements } from "../lib/entitlements.js";
import EntitlementGate from "./EntitlementGate.jsx";
import { getBlockedMessage } from "../lib/entitlementMessages.js";
import { Button, Callout, DataTable, EmptyState, Field, Pill, Section, Select, Skeleton, TextInput, useConfirm } from "./ui/index.js";
import "../styles/wave-a/batch-1.css";

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available
    }
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      title="Copy to clipboard"
      icon={(
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

const DNS_COLUMNS = [
  { key: "type", label: "Type", render: (row) => <code>{row.type}</code> },
  { key: "name", label: "Name / Host", render: (row) => <code>{row.name}</code> },
  {
    key: "value",
    label: "Value",
    render: (row) => (
      <div className="b1-dns-value">
        <code>{row.value}</code>
        <CopyButton value={row.value} />
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (row) => (row.status === "verified" ? <Pill tone="ok">Verified</Pill> : <Pill tone="warn">Pending</Pill>),
  },
];

/** Maps the domain status helper's tones onto Pill tones. */
const PILL_TONE = { success: "ok", warning: "warn", error: "danger", muted: "neutral" };

/**
 * Shared custom-domain settings for client portal and admin customer detail.
 * `directoryId` scopes it to one directory (the directory's own Domain page): only that
 * directory's domains are listed and a new domain always publishes that directory.
 * @param {{ clientId: string, clientName?: string, eventSource?: string, directoryId?: string }} props
 */
export default function DomainSettings({ clientId, clientName = "", eventSource = "client_portal", directoryId = null }) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [domains, setDomains] = useState([]);
  const [maps, setMaps] = useState([]);
  const [directories, setDirectories] = useState([]);
  const [newHostname, setNewHostname] = useState("");
  const [newTarget, setNewTarget] = useState(""); // "map:<id>" or "directory:<id>"
  const [adding, setAdding] = useState(false);
  const [busyDomainId, setBusyDomainId] = useState(null);
  const [feedbackByDomain, setFeedbackByDomain] = useState({});

  const isClientPortal = eventSource === "client_portal";
  const { enabled: myCustomDomainEnabled, loading: myEntitlementLoading } = useEntitlement("custom_domain");
  const [clientCustomDomainEnabled, setClientCustomDomainEnabled] = useState(null); // null = loading

  useEffect(() => {
    if (isClientPortal || !clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await fetchClientEntitlements(clientId);
        if (!cancelled) setClientCustomDomainEnabled(resolved?.custom_domain?.enabled === true);
      } catch {
        // Fail open on a lookup error — this is a UX gate, not the real enforcement
        // (the manage_client_domain edge function re-checks server-side on "add").
        if (!cancelled) setClientCustomDomainEnabled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isClientPortal, clientId]);

  // Maps: gated by the paid maps.custom_domain entitlement (unchanged).
  // Directories: no commercial entitlement exists for this entity yet — the
  // add action gates on the `directories` beta flag server-side instead, so
  // a client with directories but no map entitlement can still publish one
  // of those on a custom domain. The form only needs to stay hidden when
  // neither path is available.
  const customDomainAllowed = isClientPortal ? !!myCustomDomainEnabled : !!clientCustomDomainEnabled;
  const gateLoading = isClientPortal ? myEntitlementLoading : clientCustomDomainEnabled === null;
  const canPublishAnything = customDomainAllowed || directories.length > 0;

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setErr("");
    try {
      const [{ data: d, error: dErr }, { data: m, error: mErr }, { data: dir, error: dirErr }] = await Promise.all([
        supabase
          .from("client_domains")
          .select("id,map_id,directory_id,hostname,status,dns_records,vercel_domain_id,verified_at,created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true }),
        supabase.from("maps").select("id,name").eq("client_id", clientId).order("name", { ascending: true }),
        supabase
          .from("directories")
          .select("id,name")
          .eq("client_id", clientId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);
      if (dErr) throw dErr;
      if (mErr) throw mErr;
      if (dirErr) throw dirErr;
      const scopedDirs = directoryId ? (dir ?? []).filter((x) => x.id === directoryId) : (dir ?? []);
      setDomains(directoryId ? (d ?? []).filter((x) => x.directory_id === directoryId) : (d ?? []));
      setMaps(directoryId ? [] : (m ?? []));
      setDirectories(scopedDirs);
      if (directoryId) {
        setNewTarget(`directory:${directoryId}`);
      } else if (!newTarget) {
        if ((m ?? []).length > 0) setNewTarget(`map:${m[0].id}`);
        else if ((dir ?? []).length > 0) setNewTarget(`directory:${dir[0].id}`);
      }
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, directoryId]);

  useEffect(() => {
    load();
  }, [load]);

  function mapName(mapId) {
    return maps.find((m) => m.id === mapId)?.name ?? "Unknown map";
  }

  function directoryName(directoryId) {
    return directories.find((d) => d.id === directoryId)?.name ?? "Unknown directory";
  }

  function targetLabel(domain) {
    return domain.directory_id ? `${directoryName(domain.directory_id)} (directory)` : mapName(domain.map_id);
  }

  async function handleAddDomain(e) {
    e.preventDefault();
    if (!clientId) return;
    const [targetType, targetId] = newTarget.split(":");
    if (!targetId) {
      setErr("Choose which map or directory this domain publishes.");
      return;
    }
    if (!newHostname.trim()) {
      setErr("Enter a domain or subdomain.");
      return;
    }
    setErr("");
    setMsg("");
    setAdding(true);
    try {
      const data = await invokeManageClientDomain({
        clientId,
        action: "add",
        mapId: targetType === "map" ? targetId : undefined,
        directoryId: targetType === "directory" ? targetId : undefined,
        hostname: newHostname.trim(),
      });
      setDomains((prev) => [...prev, data.domain]);
      recordAdminEvent(supabase, {
        eventType: "domain_added",
        clientId,
        mapId: data.domain.map_id,
        meta: {
          client_id: clientId,
          map_id: data.domain.map_id,
          directory_id: data.domain.directory_id,
          hostname: data.domain.hostname,
          source: eventSource,
        },
      });
      setNewHostname("");
      setMsg("Domain added. Add the DNS records below, then verify.");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleVerify(domain) {
    setErr("");
    setBusyDomainId(domain.id);
    setFeedbackByDomain((prev) => ({ ...prev, [domain.id]: null }));
    try {
      const data = await invokeManageClientDomain({ clientId, action: "verify", domainId: domain.id });
      setDomains((prev) => prev.map((d) => (d.id === domain.id ? data.domain : d)));
      const active = data.domain.status === "active";
      recordAdminEvent(supabase, {
        eventType: active ? "domain_verified" : "domain_verify_failed",
        clientId,
        mapId: domain.map_id,
        meta: {
          client_id: clientId,
          map_id: domain.map_id,
          directory_id: domain.directory_id,
          hostname: domain.hostname,
          source: eventSource,
          ...(domain.directory_id ? { login_redirect_registered: active && !data.domain.auth_redirect_warning } : {}),
        },
      });
      let text = active
        ? "Domain verified — DNS is correctly configured."
        : "Not verified yet. Make sure both records are added exactly as shown, then try again. DNS changes can take up to 48 hours to propagate.";
      if (active && data.domain.vercel_attach_warning) {
        text += ` DNS is verified, but connecting it to hosting had a problem: ${data.domain.vercel_attach_warning}. Try verifying again in a few minutes.`;
      }
      if (active && data.domain.auth_redirect_warning) {
        text += " DNS is verified, but listing sign-in links are not allowed to open this domain yet. Verify again in a few minutes.";
      }
      setFeedbackByDomain((prev) => ({
        ...prev,
        [domain.id]: { ok: active && !data.domain.vercel_attach_warning && !data.domain.auth_redirect_warning, text },
      }));
    } catch (e) {
      setFeedbackByDomain((prev) => ({ ...prev, [domain.id]: { ok: false, text: e?.message ?? String(e) } }));
    } finally {
      setBusyDomainId(null);
    }
  }

  async function handleRemove(domain) {
    const ok = await confirm({
      title: `Remove ${domain.hostname}?`,
      body: "This can't be undone.",
      confirmLabel: "Remove domain",
      tone: "danger",
    });
    if (!ok) return;
    setErr("");
    setBusyDomainId(domain.id);
    try {
      await invokeManageClientDomain({ clientId, action: "remove", domainId: domain.id });
      setDomains((prev) => prev.filter((d) => d.id !== domain.id));
      recordAdminEvent(supabase, {
        eventType: "domain_removed",
        clientId,
        mapId: domain.map_id,
        meta: {
          client_id: clientId,
          map_id: domain.map_id,
          directory_id: domain.directory_id,
          hostname: domain.hostname,
          source: eventSource,
        },
      });
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusyDomainId(null);
    }
  }

  const addFormId = useId();
  const noTargets = maps.length === 0 && directories.length === 0;

  return (
    <div className="section-stack">
      {err ? <Callout tone="danger">{err}</Callout> : null}
      {msg ? <Callout tone="ok">{msg}</Callout> : null}

      {loading ? (
        <Skeleton variant="form" rows={2} label="Loading domains" />
      ) : (
        <EntitlementGate allowed={canPublishAnything} loading={gateLoading} message={getBlockedMessage("custom_domain")}>
          <div className="section-stack">
            <Section
              title="Add a domain"
              footer={(
                <Button type="submit" form={addFormId} variant="primary" loading={adding} loadingLabel="Adding…" disabled={noTargets}>
                  Add domain
                </Button>
              )}
            >
              <form id={addFormId} onSubmit={handleAddDomain} className="b1-form">
                {directoryId ? null : (
                  <Field label="Publishes">
                    <Select value={newTarget} onChange={(e) => setNewTarget(e.target.value)}>
                      {noTargets ? <option value="">Nothing to publish yet</option> : null}
                      {maps.length > 0 ? (
                        <optgroup label="Maps">
                          {maps.map((m) => (
                            <option key={m.id} value={`map:${m.id}`}>
                              {m.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {directories.length > 0 ? (
                        <optgroup label="Directories">
                          {directories.map((d) => (
                            <option key={d.id} value={`directory:${d.id}`}>
                              {d.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </Select>
                  </Field>
                )}
                <Field label="Domain or subdomain">
                  <TextInput
                    value={newHostname}
                    onChange={(e) => setNewHostname(e.target.value)}
                    placeholder="directory.yourcompany.com"
                  />
                </Field>
              </form>
            </Section>

            {domains.length === 0 ? (
              <Section>
                <EmptyState
                  art="none"
                  title="No domains yet"
                  body={`Add one above to publish ${clientName ? `${clientName}'s` : "your"} directory on your own domain.`}
                />
              </Section>
            ) : (
              domains.map((domain) => {
                const verified = domain.status === "active";
                const hostingPending = verified && !domain.vercel_domain_id;
                const tone = hostingPending ? "warning" : domainStatusTone(domain.status);
                const label = hostingPending ? "DNS verified — hosting pending" : domainStatusLabel(domain.status);
                const feedback = feedbackByDomain[domain.id];
                const busy = busyDomainId === domain.id;
                const hasRecords = Array.isArray(domain.dns_records) && domain.dns_records.length > 0;
                return (
                  <Section
                    key={domain.id}
                    title={domain.hostname}
                    description={`Publishes: ${targetLabel(domain)}`}
                    actions={<Pill tone={PILL_TONE[tone] ?? "neutral"}>{label}</Pill>}
                    footer={(
                      <>
                        <Button variant="danger" onClick={() => handleRemove(domain)} disabled={busy}>
                          Remove
                        </Button>
                        <Button variant="primary" onClick={() => handleVerify(domain)} loading={busy} loadingLabel="Verifying…">
                          Verify DNS settings
                        </Button>
                      </>
                    )}
                  >
                    {feedback && !verified ? (
                      <Callout tone={feedback.ok ? "ok" : "warn"}>{feedback.text}</Callout>
                    ) : null}

                    {hasRecords ? (
                      <DataTable
                        caption={`DNS records for ${domain.hostname}`}
                        columns={DNS_COLUMNS}
                        rows={domain.dns_records}
                        getRowId={(row) => `${row.type}-${row.name}-${row.value}`}
                        getRowLabel={(row) => `${row.type} record`}
                      />
                    ) : null}

                    {!verified ? (
                      <Callout tone="info">
                        Add both records at your DNS provider exactly as shown, then click &ldquo;Verify DNS
                        settings&rdquo;. DNS changes can take up to 48 hours to propagate, though it&apos;s usually
                        much faster.
                      </Callout>
                    ) : hostingPending ? (
                      <Callout tone="info">
                        DNS is correctly configured. Connecting this domain to hosting — click &ldquo;Verify DNS
                        settings&rdquo; again in a few minutes if this doesn&apos;t clear on its own.
                      </Callout>
                    ) : null}
                  </Section>
                );
              })
            )}
          </div>
        </EntitlementGate>
      )}
    </div>
  );
}
