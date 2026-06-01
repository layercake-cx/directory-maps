import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../hooks/useClient.js";
import {
  emailDomainStatusLabel,
  emailDomainStatusTone,
  invokeManageClientEmail,
} from "../../lib/clientEmail.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import styles from "./ClientEmail.module.css";

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
    <button
      type="button"
      className={styles.copyBtn}
      onClick={handleCopy}
      title="Copy to clipboard"
      aria-label="Copy value"
    >
      {copied ? (
        <span className={styles.copyConfirm}>Copied</span>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export default function ClientEmail() {
  const { client, contact } = useClient();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [messagingEnabled, setMessagingEnabled] = useState(false);
  const [messagingPrompt, setMessagingPrompt] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [domainStatus, setDomainStatus] = useState("not_configured");
  const [emailDomain, setEmailDomain] = useState("");
  const [dnsRecords, setDnsRecords] = useState([]);
  const [hasDomain, setHasDomain] = useState(false);

  const canManage = contact?.is_primary || contact?.can_manage_maps;

  const loadEmail = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "messaging_enabled,messaging_prompt,email_from_name,email_from_address,email_domain,resend_domain_id,email_domain_status,email_dns_records"
        )
        .eq("id", client.id)
        .single();
      if (error) throw error;
      setMessagingEnabled(!!data?.messaging_enabled);
      setMessagingPrompt(data?.messaging_prompt ?? "");
      setFromName(data?.email_from_name ?? "");
      setFromAddress(data?.email_from_address ?? "");
      setEmailDomain(data?.email_domain ?? "");
      setDomainStatus(data?.email_domain_status ?? "not_configured");
      setDnsRecords(Array.isArray(data?.email_dns_records) ? data.email_dns_records : []);
      setHasDomain(!!data?.resend_domain_id);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [client?.id]);

  useEffect(() => {
    loadEmail();
  }, [loadEmail]);

  function applyEmailPayload(email) {
    if (!email) return;
    setFromName(email.email_from_name ?? "");
    setFromAddress(email.email_from_address ?? "");
    setEmailDomain(email.email_domain ?? "");
    setDomainStatus(email.email_domain_status ?? "not_configured");
    setDnsRecords(Array.isArray(email.email_dns_records) ? email.email_dns_records : []);
    setHasDomain(!!email.resend_domain_id);
  }

  async function handleToggleSave() {
    if (!client?.id) return;
    if (messagingEnabled && !messagingPrompt.trim()) {
      setErr("A prompt message is required when messaging is enabled.");
      return;
    }
    setErr("");
    setMsg("");
    setBusy("toggle");
    try {
      const { error } = await supabase
        .from("clients")
        .update({ messaging_enabled: messagingEnabled, messaging_prompt: messagingPrompt.trim() || null })
        .eq("id", client.id);
      if (error) throw error;
      recordAdminEvent(supabase, {
        eventType: "email_messaging_toggled",
        clientId: client.id,
        meta: { client_id: client.id, enabled: messagingEnabled, source: "client_portal" },
      });
      setMsg(messagingEnabled ? "Messaging enabled." : "Messaging disabled.");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!client?.id) return;
    setErr("");
    setMsg("");
    setBusy("save");
    try {
      const data = await invokeManageClientEmail({
        clientId: client.id,
        action: "save",
        fromName,
        fromAddress,
      });
      applyEmailPayload(data.email);
      setMsg("From address saved.");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function handleSetupDomain() {
    if (!client?.id) return;
    setErr("");
    setMsg("");
    setBusy("setup");
    try {
      const data = await invokeManageClientEmail({
        clientId: client.id,
        action: "setup_domain",
        fromAddress,
      });
      applyEmailPayload(data.email);
      setMsg("Domain registered. Add the DNS records below, then check verification.");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function handleVerify() {
    if (!client?.id) return;
    setErr("");
    setMsg("");
    setBusy("verify");
    try {
      const data = await invokeManageClientEmail({
        clientId: client.id,
        action: "verify",
      });
      applyEmailPayload(data.email);
      setMsg(
        data.email?.email_domain_status === "verified"
          ? "Domain verified. Map messages will send from your address."
          : "Verification checked. If DNS was just added, wait a few minutes and try again."
      );
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  if (!canManage) {
    return (
      <div className="page-main">
        <div className="admin-card" style={{ marginTop: 16 }}>
          <p>
            You don&apos;t have permission to configure messaging. Ask your account owner or someone with
            &quot;Manage maps&quot; access.
          </p>
        </div>
      </div>
    );
  }

  const tone = emailDomainStatusTone(domainStatus);
  const domainSectionDisabled = !messagingEnabled;

  return (
    <div className="page-main">
      <div className={`admin-card ${styles.card}`}>
        <h1 className={styles.title}>Messaging</h1>
        <p className={styles.lead}>
          Control whether visitors can send messages to directory listings, and configure the sender
          address those messages come from.
        </p>

        {err ? <p className={styles.error}>{err}</p> : null}
        {msg ? <p className={styles.success}>{msg}</p> : null}

        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            {/* ── Toggle section ─────────────────────────────────── */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Enable messaging</h2>
              <p className={styles.hint}>
                When on, a &ldquo;Send message&rdquo; button appears on listings that have an email address.
                Turn this off to hide the button across all your published maps.
              </p>

              <label className={styles.toggleRow}>
                <div
                  className={`${styles.toggle} ${messagingEnabled ? styles.toggleOn : ""}`}
                  onClick={() => setMessagingEnabled((v) => !v)}
                  role="switch"
                  aria-checked={messagingEnabled}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setMessagingEnabled((v) => !v); }}
                >
                  <div className={styles.toggleThumb} />
                </div>
                <span className={styles.toggleLabel}>
                  {messagingEnabled ? "Messaging is on" : "Messaging is off"}
                </span>
              </label>

              {messagingEnabled && (
                <div className={styles.promptField}>
                  <label className={styles.field}>
                    <span>
                      Prompt message <span className={styles.required}>*</span>
                    </span>
                    <textarea
                      value={messagingPrompt}
                      onChange={(e) => setMessagingPrompt(e.target.value)}
                      placeholder="e.g. Complete the form below and we'll pass your message on."
                      rows={3}
                      className={styles.textarea}
                      required
                    />
                    <span className={styles.hint} style={{ marginBottom: 0 }}>
                      Shown above the contact form inside the map. Required when messaging is enabled.
                    </span>
                  </label>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleToggleSave}
                  disabled={busy === "toggle"}
                >
                  {busy === "toggle" ? "Saving…" : "Save messaging settings"}
                </button>
              </div>
            </section>

            {/* ── From address ────────────────────────────────────── */}
            <section className={`${styles.section} ${domainSectionDisabled ? styles.sectionDisabled : ""}`}>
              {domainSectionDisabled && (
                <p className={styles.disabledNote}>
                  Enable messaging above to configure your sending domain.
                </p>
              )}
              <form onSubmit={handleSave}>
                <h2 className={styles.sectionTitle}>From address</h2>
                <p className={styles.hint}>
                  Use an address on a domain you control (e.g. <code>hello@yourcompany.com</code>). The
                  domain part must match the DNS setup below.
                </p>
                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span>Display name</span>
                    <input
                      type="text"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder={client?.name || "Your organisation"}
                      disabled={domainSectionDisabled}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Email address</span>
                    <input
                      type="email"
                      value={fromAddress}
                      onChange={(e) => setFromAddress(e.target.value)}
                      placeholder="hello@yourcompany.com"
                      required
                      disabled={domainSectionDisabled}
                    />
                  </label>
                </div>
                <button type="submit" className="btn btn-primary" disabled={domainSectionDisabled || busy === "save"}>
                  {busy === "save" ? "Saving…" : "Save"}
                </button>
              </form>
            </section>

            {/* ── Domain & DNS ─────────────────────────────────────── */}
            <section className={`${styles.section} ${domainSectionDisabled ? styles.sectionDisabled : ""}`}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Domain &amp; DNS</h2>
                <span className={`${styles.badge} ${styles[`badge--${tone}`]}`}>
                  {emailDomainStatusLabel(domainStatus)}
                </span>
              </div>
              {emailDomain ? (
                <p className={styles.hint}>
                  Domain: <strong>{emailDomain}</strong>
                </p>
              ) : null}

              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSetupDomain}
                  disabled={domainSectionDisabled || !fromAddress.trim() || busy === "setup"}
                >
                  {busy === "setup" ? "Working…" : hasDomain ? "Refresh DNS records" : "Set up domain"}
                </button>
                {hasDomain ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={handleVerify}
                    disabled={domainSectionDisabled || busy === "verify"}
                  >
                    {busy === "verify" ? "Checking…" : "Check verification"}
                  </button>
                ) : null}
              </div>

              {dnsRecords.length > 0 ? (
                <div className={styles.dnsBlock}>
                  <div className={styles.dnsGuide}>
                    <h3 className={styles.dnsGuideTitle}>How to add these records</h3>
                    <ol className={styles.dnsGuideSteps}>
                      <li>
                        <strong>Find your DNS provider.</strong> This is usually where you registered your
                        domain (GoDaddy, Namecheap, 123-reg, etc.) or wherever you manage DNS — often
                        Cloudflare. Log in and open the DNS settings for{" "}
                        <strong>{emailDomain || "your domain"}</strong>.
                      </li>
                      <li>
                        <strong>Add the records below exactly as shown.</strong> The records enable DKIM
                        signing so your mail is trusted and allow Resend to send on your behalf. Use the copy
                        button next to each value to avoid transcription errors.
                      </li>
                      <li>
                        <strong>Wait for propagation.</strong> DNS changes can take up to 48 hours worldwide,
                        though it&apos;s usually much faster (minutes to an hour). Once added, click &ldquo;Check
                        verification&rdquo; to confirm they&apos;re live.
                      </li>
                    </ol>
                    <p className={styles.dnsGuideNote}>
                      <strong>DMARC (recommended):</strong> For the strongest deliverability, also add a{" "}
                      <code>TXT</code> record: Name <code>_dmarc</code>, Value{" "}
                      <code>v=DMARC1; p=none; rua=mailto:dmarc@{emailDomain || "yourdomain.com"}</code>. DMARC
                      is not required for verification but protects your domain from spoofing.
                    </p>
                  </div>

                  <table className={styles.dnsTable}>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Name / Host</th>
                        <th>Value</th>
                        <th>Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dnsRecords.map((row, i) => (
                        <tr key={`${row.type}-${row.name}-${i}`}>
                          <td>
                            <code>{row.type || "—"}</code>
                            {row.record ? (
                              <span className={styles.recordKind}>{row.record}</span>
                            ) : null}
                          </td>
                          <td>
                            <code className={styles.dnsValue}>{row.name || "—"}</code>
                          </td>
                          <td>
                            <div className={styles.dnsValueCell}>
                              <code className={styles.dnsValue}>{row.value || "—"}</code>
                              {row.value ? <CopyButton value={row.value} /> : null}
                            </div>
                          </td>
                          <td>{row.priority != null && row.priority !== "" ? row.priority : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <p className={styles.note}>
                Until your domain is verified, messages use the platform default sender. Submissions are
                always saved under Stats regardless of email delivery.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
