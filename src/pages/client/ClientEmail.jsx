import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../hooks/useClient.js";
import {
  emailDomainStatusLabel,
  emailDomainStatusTone,
  invokeManageClientEmail,
} from "../../lib/clientEmail.js";
import styles from "./ClientEmail.module.css";

export default function ClientEmail() {
  const { client, contact, refetch } = useClient();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [domainStatus, setDomainStatus] = useState("not_configured");
  const [emailDomain, setEmailDomain] = useState("");
  const [dnsRecords, setDnsRecords] = useState([]);
  const [hasDomain, setHasDomain] = useState(false);

  const canManage =
    contact?.is_primary || contact?.can_manage_maps;

  const loadEmail = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "email_from_name,email_from_address,email_domain,resend_domain_id,email_domain_status,email_dns_records"
        )
        .eq("id", client.id)
        .single();
      if (error) throw error;
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
    refetch?.();
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
            You don&apos;t have permission to configure email. Ask your account owner or someone with
            &quot;Manage maps&quot; access.
          </p>
        </div>
      </div>
    );
  }

  const tone = emailDomainStatusTone(domainStatus);

  return (
    <div className="page-main">
      <div className={`admin-card ${styles.card}`}>
        <h1 className={styles.title}>Email</h1>
        <p className={styles.lead}>
          Configure the sender address for &quot;Send message&quot; on your published maps. Visitors&apos;
          messages are delivered by Resend; you add DNS records on your domain so mail is trusted and
          deliverable.
        </p>

        {err ? <p className={styles.error}>{err}</p> : null}
        {msg ? <p className={styles.success}>{msg}</p> : null}

        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            <form onSubmit={handleSave} className={styles.section}>
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

            <section className={styles.section}>
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
                  disabled={!fromAddress.trim() || busy === "setup"}
                >
                  {busy === "setup" ? "Working…" : hasDomain ? "Refresh DNS records" : "Set up domain"}
                </button>
                {hasDomain ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={handleVerify}
                    disabled={busy === "verify"}
                  >
                    {busy === "verify" ? "Checking…" : "Check verification"}
                  </button>
                ) : null}
              </div>

              {dnsRecords.length > 0 ? (
                <div className={styles.dnsBlock}>
                  <p className={styles.hint}>
                    Add these records at your DNS provider (Cloudflare, GoDaddy, etc.). Propagation can
                    take up to 48 hours; often it&apos;s much faster.
                  </p>
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
                            <code className={styles.dnsValue}>{row.value || "—"}</code>
                          </td>
                          <td>{row.priority != null && row.priority !== "" ? row.priority : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <p className={styles.note}>
                Until your domain is verified, messages use the platform default sender (
                <code>RESEND_FROM</code>). Submissions are always saved under Stats / database regardless
                of email delivery.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
