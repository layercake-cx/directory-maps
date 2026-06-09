import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  emailDomainStatusLabel,
  emailDomainStatusTone,
  getPlatformDefaultFromAddress,
  invokeManageClientEmail,
} from "../lib/clientEmail.js";
import { recordAdminEvent } from "../lib/adminEvents.js";
import { buildDnsSetupEmailText, resolveSenderFirstName } from "../lib/dnsSetupInstructions.js";
import styles from "../pages/client/ClientEmail.module.css";

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

function domainVerifyButtonIconKind(status) {
  if (status === "verified") return "success";
  if (status === "failed" || status === "temporary_failure") return "error";
  if (status === "pending" || status === "not_started" || status === "not_configured") return "warning";
  return "warning";
}

function DomainVerifyButtonIcon({ status }) {
  const kind = domainVerifyButtonIconKind(status);
  const className = `${styles.verifyBtnIcon} ${styles[`verifyBtnIcon--${kind}`]}`;

  if (kind === "success") {
    return (
      <span className={className} aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  }

  if (kind === "warning") {
    return (
      <span className={className} aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>
    );
  }

  return (
    <span className={className} aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    </span>
  );
}

function DnsStatusIcon({ status }) {
  if (status === "verified") {
    return (
      <span className={styles.dnsStatusVerified} title="Verified">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Verified">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className={styles.dnsStatusPending} title="Pending">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Pending">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>
    );
  }
  return (
    <span className={styles.dnsStatusNone} title="Not verified">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Not verified">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    </span>
  );
}

function SetupInstructionsOverlay({ open, onClose, text }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  return (
    <div
      className={styles.instructionsOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dns-setup-instructions-title"
      onClick={onClose}
    >
      <div className={styles.instructionsModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.instructionsHeader}>
          <h3 id="dns-setup-instructions-title" className={styles.instructionsTitle}>
            Setup instructions
          </h3>
          <button
            type="button"
            className={styles.instructionsClose}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className={styles.instructionsLead}>
          Copy the text below and paste it into an email to whoever manages your DNS (IT support,
          web agency, domain registrar, etc.).
        </p>
        <textarea
          className={styles.instructionsText}
          readOnly
          value={text}
          aria-label="DNS setup instructions for email"
          onFocus={(e) => e.target.select()}
        />
        <div className={styles.instructionsActions}>
          <button type="button" className="btn btn-primary" onClick={handleCopy}>
            {copied ? "Copied" : "Copy to clipboard"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Shared messaging / email domain settings for client portal and admin customer detail.
 * @param {{ clientId: string, clientName?: string, eventSource?: string, showPageTitle?: boolean }} props
 */
export default function MessagingSettings({
  clientId,
  clientName = "",
  eventSource = "client_portal",
  showPageTitle = true,
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [verifyFeedback, setVerifyFeedback] = useState(null);
  const [setupFeedback, setSetupFeedback] = useState(null);

  const [messagingEnabled, setMessagingEnabled] = useState(false);
  const [messagingPrompt, setMessagingPrompt] = useState("");
  const [emailTestMode, setEmailTestMode] = useState(true);
  const [emailTestRecipient, setEmailTestRecipient] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [domainStatus, setDomainStatus] = useState("not_configured");
  const [emailDomain, setEmailDomain] = useState("");
  const [dnsRecords, setDnsRecords] = useState([]);
  const [hasDomain, setHasDomain] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [senderFirstName, setSenderFirstName] = useState("");

  const loadEmail = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "messaging_enabled,messaging_prompt,email_test_mode,email_test_recipient,email_from_name,email_from_address,email_domain,resend_domain_id,email_domain_status,email_dns_records"
        )
        .eq("id", clientId)
        .single();
      if (error) throw error;
      setMessagingEnabled(!!data?.messaging_enabled);
      setMessagingPrompt(data?.messaging_prompt ?? "");
      setEmailTestMode(data?.email_test_mode !== false);
      setEmailTestRecipient(data?.email_test_recipient ?? "");
      setFromName(data?.email_from_name ?? "");
      setFromAddress(data?.email_from_address ?? "");
      setEmailDomain(data?.email_domain ?? "");
      setDomainStatus(data?.email_domain_status ?? "not_configured");
      setDnsRecords(Array.isArray(data?.email_dns_records) ? data.email_dns_records : []);
      setHasDomain(
        !!data?.resend_domain_id ||
          (Array.isArray(data?.email_dns_records) && data.email_dns_records.length > 0)
      );
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadEmail();
  }, [loadEmail]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSenderFirstName(resolveSenderFirstName(data.session?.user));
    });
  }, []);

  function applyEmailPayload(email) {
    if (!email) return;
    setFromName(email.email_from_name ?? "");
    setFromAddress(email.email_from_address ?? "");
    setEmailDomain(email.email_domain ?? "");
    setDomainStatus(email.email_domain_status ?? "not_configured");
    setDnsRecords(Array.isArray(email.email_dns_records) ? email.email_dns_records : []);
    setHasDomain(!!email.resend_domain_id || (Array.isArray(email.email_dns_records) && email.email_dns_records.length > 0));
  }

  async function handleToggleSave() {
    if (!clientId) return;
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
        .eq("id", clientId);
      if (error) throw error;
      recordAdminEvent(supabase, {
        eventType: "email_messaging_toggled",
        clientId,
        meta: { client_id: clientId, enabled: messagingEnabled, source: eventSource },
      });
      setMsg(messagingEnabled ? "Messaging enabled." : "Messaging disabled.");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function handleTestModeSave() {
    if (!clientId) return;
    if (emailTestMode && !emailTestRecipient.trim()) {
      setErr("A test recipient email is required when test mode is enabled.");
      return;
    }
    setErr("");
    setMsg("");
    setBusy("testmode");
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          email_test_mode: emailTestMode,
          email_test_recipient: emailTestMode ? emailTestRecipient.trim() : null,
        })
        .eq("id", clientId);
      if (error) throw error;
      setMsg(emailTestMode ? "Test mode enabled." : "Test mode disabled — emails will go to listing addresses.");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!clientId) return;
    setErr("");
    setMsg("");
    setBusy("save");
    try {
      const data = await invokeManageClientEmail({
        clientId,
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
    if (!clientId) return;
    if (!fromAddress.trim()) {
      setSetupFeedback({
        ok: false,
        text: "Enter a from email address above before setting up the domain.",
      });
      return;
    }
    setErr("");
    setMsg("");
    setSetupFeedback(null);
    setBusy("setup");
    try {
      const saved = await invokeManageClientEmail({
        clientId,
        action: "save",
        fromName,
        fromAddress,
      });
      applyEmailPayload(saved.email);

      const data = await invokeManageClientEmail({
        clientId,
        action: "setup_domain",
        fromAddress,
      });

      if (!data?.email) {
        throw new Error("Domain setup returned no data. Try again or contact support.");
      }

      applyEmailPayload(data.email);

      const records = Array.isArray(data.email.email_dns_records) ? data.email.email_dns_records : [];
      if (!records.length) {
        setSetupFeedback({
          ok: false,
          text: "Domain was registered but no DNS records were returned. Try Set up domain again, or check that the manage_client_email edge function is deployed with a full-access Resend key.",
        });
        return;
      }

      setSetupFeedback({
        ok: true,
        text: "Domain registered. Add the DNS records below, then verify DNS settings.",
      });
    } catch (e) {
      setSetupFeedback({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setBusy("");
    }
  }

  async function handleVerify() {
    if (!clientId) return;
    setErr("");
    setMsg("");
    setVerifyFeedback(null);
    setBusy("verify");
    try {
      const data = await invokeManageClientEmail({
        clientId,
        action: "verify",
      });
      applyEmailPayload(data.email);
      const verified = data.email?.email_domain_status === "verified";
      const anyVerified = Array.isArray(data.email?.email_dns_records) &&
        data.email.email_dns_records.some((r) => r.status === "verified");
      setVerifyFeedback({
        ok: verified,
        text: verified
          ? "Your domain records are correctly configured. Messages will now send from your address."
          : anyVerified
          ? "Some records are verified — check which rows still have a pending or unverified icon, then ensure those are added exactly as shown. DNS can take up to 48 hours to propagate."
          : "No records could be verified yet. Make sure all records are added to your DNS provider exactly as shown below, then try again. DNS changes can take up to 48 hours to take effect.",
      });
    } catch (e) {
      setVerifyFeedback({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setBusy("");
    }
  }

  const tone = emailDomainStatusTone(domainStatus);
  const domainVerified = domainStatus === "verified";
  const platformDefaultFrom = getPlatformDefaultFromAddress();
  const setupInstructionsText = buildDnsSetupEmailText({
    fromAddress,
    emailDomain,
    dnsRecords,
    senderFirstName,
  });

  return (
    <>
      {showPageTitle ? (
        <>
          <h1 className={styles.title}>Messaging</h1>
          <p className={styles.lead}>
            Control whether visitors can send messages to directory listings, and configure the sender
            address those messages come from.
          </p>
        </>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 4px 0", fontSize: 18 }}>Messaging</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--lc-muted)" }}>
            Configure messaging, test mode, and sending domain for this customer — same controls as the client portal.
          </p>
        </div>
      )}

      {err ? <p className={styles.error}>{err}</p> : null}
      {msg ? <p className={styles.success}>{msg}</p> : null}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className={styles.messagingGrid}>
          <section className={`${styles.panelBox} ${messagingEnabled ? styles.panelBoxActive : styles.panelBoxOff}`}>
            <h2 className={styles.sectionTitle}>Enable messaging</h2>
            <p className={styles.hint}>
              When on, a &ldquo;Send message&rdquo; button appears on listings that have an email address.
              Turn this off to hide the button across all published maps.
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

            <div className={styles.panelFooter}>
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

          <section className={`${styles.panelBox} ${emailTestMode ? styles.panelBoxActive : ""}`}>
            <h2 className={styles.sectionTitle}>Test mode</h2>
            <p className={styles.hint}>
              When test mode is on, contact form messages are redirected to the test recipient below
              instead of the listing&apos;s email address. Turn off when ready to go live.
            </p>

            <label className={styles.toggleRow}>
              <div
                className={`${styles.toggle} ${emailTestMode ? styles.toggleOn : ""}`}
                onClick={() => setEmailTestMode((v) => !v)}
                role="switch"
                aria-checked={emailTestMode}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setEmailTestMode((v) => !v); }}
              >
                <div className={styles.toggleThumb} />
              </div>
              <span className={styles.toggleLabel}>
                {emailTestMode ? "Test mode is on" : "Test mode is off — emails go to listing addresses"}
              </span>
            </label>

            {emailTestMode && (
              <div className={styles.promptField}>
                <label className={styles.field}>
                  <span>Test recipient email <span className={styles.required}>*</span></span>
                  <input
                    type="email"
                    value={emailTestRecipient}
                    onChange={(e) => setEmailTestRecipient(e.target.value)}
                    placeholder="you@yourcompany.com"
                    required
                  />
                  <span className={styles.hint} style={{ marginBottom: 0 }}>
                    All contact form messages will be sent here instead of listing email addresses.
                  </span>
                </label>
              </div>
            )}

            <div className={styles.panelFooter}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleTestModeSave}
                disabled={busy === "testmode"}
              >
                {busy === "testmode" ? "Saving…" : "Save test mode settings"}
              </button>
            </div>
          </section>

          <section className={`${styles.panelBox} ${styles.panelBoxFull}`}>
            <form onSubmit={handleSave} className={styles.panelSubsection}>
              <h2 className={styles.sectionTitle}>From address</h2>
              <p className={styles.hint}>
                The address you want map contact emails to be sent from. Once saved, complete the domain
                setup below — otherwise messages will send from the platform default,{" "}
                <strong>{platformDefaultFrom}</strong>.
              </p>
              <div className={styles.fromAddressRow}>
                <label className={styles.field}>
                  <span>Display name</span>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder={clientName || "Your organisation"}
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
                  />
                </label>
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy === "save"}>
                {busy === "save" ? "Saving…" : "Save"}
              </button>
            </form>

            <hr className={styles.panelDivider} />

            <div className={styles.panelSubsection}>
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

            {!fromAddress.trim() ? (
              <p className={styles.disabledNote}>
                Enter a from email address above before setting up the domain (Save is optional — Set up
                domain saves it automatically).
              </p>
            ) : null}

            <div className={styles.actions}>
              {!hasDomain || dnsRecords.length === 0 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSetupDomain}
                  disabled={!fromAddress.trim() || busy === "setup"}
                >
                  {busy === "setup" ? "Working…" : "Set up domain"}
                </button>
              ) : null}
              {hasDomain ? (
                <>
                  <button
                    type="button"
                    className={`btn btn-primary ${styles.verifyBtn}`}
                    onClick={handleVerify}
                    disabled={busy === "verify"}
                  >
                    {busy !== "verify" ? <DomainVerifyButtonIcon status={domainStatus} /> : null}
                    {busy === "verify" ? "Verifying…" : "Verify DNS settings"}
                  </button>
                  {domainStatus !== "verified" ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setInstructionsOpen(true)}
                      disabled={dnsRecords.length === 0}
                      title={dnsRecords.length === 0 ? "Set up the domain first to generate DNS records" : undefined}
                    >
                      Setup instructions
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>

            {!busy && setupFeedback && !domainVerified ? (
              <div className={`${styles.verifyBanner} ${setupFeedback.ok ? styles.verifyBannerOk : styles.verifyBannerWarn}`}>
                <span>{setupFeedback.text}</span>
              </div>
            ) : null}

            {busy === "verify" && (
              <p className={styles.verifyWaiting}>
                Verifying your DNS records with Resend — this can take up to 20 seconds…
              </p>
            )}

            {!busy && verifyFeedback && !domainVerified && (
              <div className={`${styles.verifyBanner} ${verifyFeedback.ok ? styles.verifyBannerOk : styles.verifyBannerWarn}`}>
                <span className={styles.verifyBannerIcon} aria-hidden>
                  {verifyFeedback.ok ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  )}
                </span>
                <span>{verifyFeedback.text}</span>
              </div>
            )}

            {dnsRecords.length > 0 ? (
              <div className={styles.dnsBlock}>
                {!domainVerified ? (
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
                        though it&apos;s usually much faster (minutes to an hour). Once added, click &ldquo;Verify
                        DNS settings&rdquo; to confirm they&apos;re live.
                      </li>
                    </ol>
                    <p className={styles.dnsGuideNote}>
                      <strong>DMARC</strong> is included in the table below. It is not checked by our
                      verification step but is strongly recommended — it protects your domain from spoofing
                      and improves deliverability over time.
                    </p>
                  </div>
                ) : null}

                <table className={styles.dnsTable}>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Name / Host</th>
                      <th>Value</th>
                      <th>Priority</th>
                      <th className={styles.dnsStatusTh} title="Verification status">✓</th>
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
                        <td className={styles.dnsStatusCell}>
                          <DnsStatusIcon status={row.status} />
                        </td>
                      </tr>
                    ))}
                    {emailDomain ? (() => {
                      const dmarcValue = `v=DMARC1; p=none; rua=mailto:dmarc@${emailDomain}`;
                      return (
                        <tr className={styles.dnsRowDmarc}>
                          <td>
                            <code>TXT</code>
                            <span className={styles.recordKind}>DMARC</span>
                          </td>
                          <td>
                            <code className={styles.dnsValue}>_dmarc.{emailDomain}</code>
                          </td>
                          <td>
                            <div className={styles.dnsValueCell}>
                              <code className={styles.dnsValue}>{dmarcValue}</code>
                              <CopyButton value={dmarcValue} />
                            </div>
                            <span className={styles.dmarcLabel}>Recommended</span>
                          </td>
                          <td>—</td>
                          <td className={styles.dnsStatusCell}>—</td>
                        </tr>
                      );
                    })() : null}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!domainVerified ? (
              <p className={styles.note}>
                Until your domain is verified, messages use the platform default sender. Submissions are
                always saved under Stats regardless of email delivery.
              </p>
            ) : null}
            </div>
          </section>
        </div>
      )}

      <SetupInstructionsOverlay
        open={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
        text={setupInstructionsText}
      />
    </>
  );
}
