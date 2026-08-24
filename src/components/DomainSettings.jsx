import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { domainStatusLabel, domainStatusTone, invokeManageClientDomain } from "../lib/clientDomains.js";
import { recordAdminEvent } from "../lib/adminEvents.js";
import { useEntitlement } from "../hooks/useEntitlements.js";
import { fetchClientEntitlements } from "../lib/entitlements.js";
import EntitlementGate from "./EntitlementGate.jsx";
import { getBlockedMessage } from "../lib/entitlementMessages.js";
import styles from "../pages/client/ClientDomains.module.css";
import emailStyles from "../pages/client/ClientEmail.module.css";

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
    <button type="button" className={emailStyles.copyBtn} onClick={handleCopy} title="Copy to clipboard" aria-label="Copy value">
      {copied ? <span className={emailStyles.copyConfirm}>Copied</span> : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function DnsStatusIcon({ status }) {
  if (status === "verified") {
    return (
      <span className={emailStyles.dnsStatusVerified} title="Verified">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Verified">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  }
  return (
    <span className={emailStyles.dnsStatusPending} title="Pending">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Pending">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    </span>
  );
}

/**
 * Shared custom-domain settings for client portal and admin customer detail.
 * @param {{ clientId: string, clientName?: string, eventSource?: string }} props
 */
export default function DomainSettings({ clientId, clientName = "", eventSource = "client_portal" }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [domains, setDomains] = useState([]);
  const [maps, setMaps] = useState([]);
  const [newHostname, setNewHostname] = useState("");
  const [newMapId, setNewMapId] = useState("");
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

  const customDomainAllowed = isClientPortal ? !!myCustomDomainEnabled : !!clientCustomDomainEnabled;
  const gateLoading = isClientPortal ? myEntitlementLoading : clientCustomDomainEnabled === null;

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setErr("");
    try {
      const [{ data: d, error: dErr }, { data: m, error: mErr }] = await Promise.all([
        supabase
          .from("client_domains")
          .select("id,map_id,hostname,status,dns_records,verified_at,created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true }),
        supabase.from("maps").select("id,name").eq("client_id", clientId).order("name", { ascending: true }),
      ]);
      if (dErr) throw dErr;
      if (mErr) throw mErr;
      setDomains(d ?? []);
      setMaps(m ?? []);
      if (!newMapId && (m ?? []).length > 0) setNewMapId(m[0].id);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  function mapName(mapId) {
    return maps.find((m) => m.id === mapId)?.name ?? "Unknown map";
  }

  async function handleAddDomain(e) {
    e.preventDefault();
    if (!clientId) return;
    if (!newMapId) {
      setErr("Choose which map this domain publishes.");
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
        mapId: newMapId,
        hostname: newHostname.trim(),
      });
      setDomains((prev) => [...prev, data.domain]);
      recordAdminEvent(supabase, {
        eventType: "domain_added",
        clientId,
        mapId: newMapId,
        meta: { client_id: clientId, map_id: newMapId, hostname: data.domain.hostname, source: eventSource },
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
        meta: { client_id: clientId, map_id: domain.map_id, hostname: domain.hostname, source: eventSource },
      });
      setFeedbackByDomain((prev) => ({
        ...prev,
        [domain.id]: {
          ok: active,
          text: active
            ? "Domain verified — DNS is correctly configured."
            : "Not verified yet. Make sure both records are added exactly as shown, then try again. DNS changes can take up to 48 hours to propagate.",
        },
      }));
    } catch (e) {
      setFeedbackByDomain((prev) => ({ ...prev, [domain.id]: { ok: false, text: e?.message ?? String(e) } }));
    } finally {
      setBusyDomainId(null);
    }
  }

  async function handleRemove(domain) {
    if (!window.confirm(`Remove ${domain.hostname}? This can't be undone.`)) return;
    setErr("");
    setBusyDomainId(domain.id);
    try {
      await invokeManageClientDomain({ clientId, action: "remove", domainId: domain.id });
      setDomains((prev) => prev.filter((d) => d.id !== domain.id));
      recordAdminEvent(supabase, {
        eventType: "domain_removed",
        clientId,
        mapId: domain.map_id,
        meta: { client_id: clientId, map_id: domain.map_id, hostname: domain.hostname, source: eventSource },
      });
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusyDomainId(null);
    }
  }

  return (
    <>
      {err ? <p className={emailStyles.error}>{err}</p> : null}
      {msg ? <p className={emailStyles.success}>{msg}</p> : null}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <EntitlementGate allowed={customDomainAllowed} loading={gateLoading} message={getBlockedMessage("custom_domain")}>
          <form onSubmit={handleAddDomain} className={styles.addForm}>
            <label className={`${emailStyles.field} ${styles.field}`}>
              <span>Map</span>
              <select value={newMapId} onChange={(e) => setNewMapId(e.target.value)}>
                {maps.length === 0 ? <option value="">No maps yet</option> : null}
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${emailStyles.field} ${styles.field}`}>
              <span>Domain or subdomain</span>
              <input
                type="text"
                value={newHostname}
                onChange={(e) => setNewHostname(e.target.value)}
                placeholder="directory.yourcompany.com"
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={adding || maps.length === 0}>
              {adding ? "Adding…" : "Add domain"}
            </button>
          </form>

          {domains.length === 0 ? (
            <p className={styles.emptyState}>
              No domains yet. Add one above to publish {clientName ? `${clientName}'s` : "your"} directory on your
              own domain.
            </p>
          ) : (
            <div className={styles.domainList}>
              {domains.map((domain) => {
                const tone = domainStatusTone(domain.status);
                const verified = domain.status === "active";
                const feedback = feedbackByDomain[domain.id];
                const busy = busyDomainId === domain.id;
                return (
                  <div key={domain.id} className={styles.domainCard}>
                    <div className={styles.domainCardHeader}>
                      <h3 className={styles.domainHostname}>{domain.hostname}</h3>
                      <span className={`${emailStyles.badge} ${emailStyles[`badge--${tone}`]}`}>
                        {domainStatusLabel(domain.status)}
                      </span>
                    </div>
                    <p className={styles.domainMapLabel}>Publishes: {mapName(domain.map_id)}</p>

                    <div className={emailStyles.actions}>
                      <button
                        type="button"
                        className={`btn btn-primary ${emailStyles.verifyBtn}`}
                        onClick={() => handleVerify(domain)}
                        disabled={busy}
                      >
                        {busy ? "Verifying…" : "Verify DNS settings"}
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => handleRemove(domain)} disabled={busy}>
                        Remove
                      </button>
                    </div>

                    {feedback && !verified ? (
                      <div
                        className={`${emailStyles.verifyBanner} ${feedback.ok ? emailStyles.verifyBannerOk : emailStyles.verifyBannerWarn}`}
                      >
                        <span>{feedback.text}</span>
                      </div>
                    ) : null}

                    {Array.isArray(domain.dns_records) && domain.dns_records.length > 0 ? (
                      <div className={emailStyles.dnsBlock}>
                        <table className={emailStyles.dnsTable}>
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th>Name / Host</th>
                              <th>Value</th>
                              <th className={emailStyles.dnsStatusTh} title="Verification status">
                                ✓
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {domain.dns_records.map((row, i) => (
                              <tr key={`${row.type}-${i}`}>
                                <td>
                                  <code>{row.type}</code>
                                </td>
                                <td>
                                  <code className={emailStyles.dnsValue}>{row.name}</code>
                                </td>
                                <td>
                                  <div className={emailStyles.dnsValueCell}>
                                    <code className={emailStyles.dnsValue}>{row.value}</code>
                                    <CopyButton value={row.value} />
                                  </div>
                                </td>
                                <td className={emailStyles.dnsStatusCell}>
                                  <DnsStatusIcon status={row.status} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {!verified ? (
                      <p className={emailStyles.note}>
                        Add both records at your DNS provider exactly as shown, then click &ldquo;Verify DNS
                        settings&rdquo;. DNS changes can take up to 48 hours to propagate, though it&apos;s usually
                        much faster.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </EntitlementGate>
      )}
    </>
  );
}
