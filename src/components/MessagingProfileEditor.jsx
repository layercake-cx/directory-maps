import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  emailDomainStatusLabel,
  emailDomainStatusTone,
  getPlatformDefaultFromAddress,
  invokeManageClientEmail,
} from "../lib/clientEmail.js";
import { recordAdminEvent } from "../lib/adminEvents.js";
import { buildDnsSetupEmailText, resolveSenderFirstName } from "../lib/dnsSetupInstructions.js";
import {
  Button, Callout, DataTable, Dialog, Field, FieldGrid, Pill, Section, Textarea, TextInput, useConfirm,
} from "./ui/index.js";
import "../styles/wave-b/messaging.css";

// emailDomainStatusTone (lib/clientEmail.js) -> Pill tone.
const PILL_TONE = { success: "ok", warning: "warn", error: "danger", muted: "neutral" };

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
      size="sm"
      variant="ghost"
      onClick={handleCopy}
      title="Copy to clipboard"
      aria-label={copied ? "Copied" : "Copy value"}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function DnsStatusPill({ status }) {
  if (status === "verified") return <Pill tone="ok">Verified</Pill>;
  if (status === "pending") return <Pill tone="warn">Pending</Pill>;
  return <Pill tone="danger">Not verified</Pill>;
}

function SetupInstructionsOverlay({ open, onClose, text }) {
  const [copied, setCopied] = useState(false);

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
    <Dialog
      title="Setup instructions"
      onClose={onClose}
      wide
      footer={(
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={handleCopy}>
            {copied ? "Copied" : "Copy to clipboard"}
          </Button>
        </>
      )}
    >
      <div className="wb5-stack">
        <p className="wb5-text">
          Copy the text below and paste it into an email to whoever manages your DNS (IT support,
          web agency, domain registrar, etc.).
        </p>
        <Field label="DNS setup instructions for email">
          <Textarea
            className="wb5-instructions"
            readOnly
            value={text}
            rows={14}
            onFocus={(e) => e.target.select()}
          />
        </Field>
      </div>
    </Dialog>
  );
}


/**
 * Edit one messaging profile (a sending identity): name, From name/address, and
 * the Resend domain + DNS setup. Message text (prompt/subject/intro) is NOT
 * here — it lives on each map or directory.
 * @param {{ profile: object, clientId: string, clientName?: string, eventSource?: string,
 *   onUpdated: (profile: object) => void, onDeleted: (id: string) => void, onClose: () => void }} props
 */
export default function MessagingProfileEditor({
  profile,
  clientId,
  clientName = "",
  eventSource = "client_portal",
  onUpdated,
  onDeleted,
  onClose,
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [verifyFeedback, setVerifyFeedback] = useState(null);
  const [setupFeedback, setSetupFeedback] = useState(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [senderFirstName, setSenderFirstName] = useState("");
  const confirm = useConfirm();

  const [name, setName] = useState(profile.name ?? "");
  const [fromName, setFromName] = useState(profile.email_from_name ?? "");
  const [fromAddress, setFromAddress] = useState(profile.email_from_address ?? "");

  const domainStatus = profile.email_domain_status ?? "not_configured";
  const emailDomain = profile.email_domain ?? "";
  const dnsRecords = Array.isArray(profile.email_dns_records) ? profile.email_dns_records : [];
  const hasDomain = !!profile.resend_domain_id || dnsRecords.length > 0;

  // Re-seed the form when a different profile is opened.
  useEffect(() => {
    setName(profile.name ?? "");
    setFromName(profile.email_from_name ?? "");
    setFromAddress(profile.email_from_address ?? "");
    setErr("");
    setMsg("");
    setVerifyFeedback(null);
    setSetupFeedback(null);
  }, [profile.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSenderFirstName(resolveSenderFirstName(data.session?.user));
    });
  }, []);

  function track(eventType, extra = {}) {
    recordAdminEvent(supabase, {
      eventType,
      clientId,
      meta: { client_id: clientId, profile_id: profile.id, email_provider: "resend", source: eventSource, ...extra },
    });
  }

  function changedFields() {
    const changed = [];
    if (name.trim() !== (profile.name ?? "")) changed.push("name");
    if (fromName.trim() !== (profile.email_from_name ?? "")) changed.push("email_from_name");
    if (fromAddress.trim().toLowerCase() !== (profile.email_from_address ?? "")) changed.push("email_from_address");
    return changed;
  }

  async function saveProfile() {
    const changed = changedFields();
    const data = await invokeManageClientEmail({
      clientId,
      action: "save",
      profileId: profile.id,
      name,
      fromName,
      fromAddress,
    });
    onUpdated(data.profile);
    if (changed.length) track("email_profile_updated", { changed_fields: changed });
    return data.profile;
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setErr("Give this profile a name.");
      return;
    }
    setErr("");
    setMsg("");
    setBusy("save");
    try {
      await saveProfile();
      setMsg("Profile saved.");
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setBusy("");
    }
  }

  async function handleSetupDomain() {
    if (!fromAddress.trim()) {
      setSetupFeedback({ ok: false, text: "Enter a from email address above before setting up the domain." });
      return;
    }
    setErr("");
    setMsg("");
    setSetupFeedback(null);
    setBusy("setup");
    try {
      await saveProfile();
      track("email_domain_setup_started", { domain: fromAddress.split("@")[1]?.trim().toLowerCase() ?? null });
      const data = await invokeManageClientEmail({
        clientId,
        action: "setup_domain",
        profileId: profile.id,
        fromAddress,
      });
      if (!data?.profile) {
        throw new Error("Domain setup returned no data. Try again or contact support.");
      }
      onUpdated(data.profile);

      const records = Array.isArray(data.profile.email_dns_records) ? data.profile.email_dns_records : [];
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
    setErr("");
    setMsg("");
    setVerifyFeedback(null);
    setBusy("verify");
    try {
      const data = await invokeManageClientEmail({ clientId, action: "verify", profileId: profile.id });
      onUpdated(data.profile);
      const verified = data.profile?.email_domain_status === "verified";
      const anyVerified = Array.isArray(data.profile?.email_dns_records) &&
        data.profile.email_dns_records.some((r) => r.status === "verified");
      track(verified ? "email_domain_verified" : "email_domain_verify_failed", {
        domain: data.profile?.email_domain ?? null,
      });
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

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${profile.name || "this profile"}?`,
      body: "Any map or directory using this profile will stop sending messages until you choose another profile for it. This cannot be undone.",
      confirmLabel: "Delete profile",
      tone: "danger",
    });
    if (!ok) return;
    setErr("");
    setMsg("");
    setBusy("delete");
    try {
      const data = await invokeManageClientEmail({ clientId, action: "delete", profileId: profile.id });
      track("email_profile_deleted", {
        maps_affected: data.maps_affected ?? 0,
        directories_affected: data.directories_affected ?? 0,
      });
      onDeleted(profile.id);
    } catch (e) {
      setErr(e?.message ?? String(e));
      setBusy("");
    }
  }

  const tone = PILL_TONE[emailDomainStatusTone(domainStatus)] || "neutral";
  const domainVerified = domainStatus === "verified";
  const platformDefaultFrom = getPlatformDefaultFromAddress();
  const setupInstructionsText = buildDnsSetupEmailText({
    fromAddress,
    emailDomain,
    dnsRecords,
    senderFirstName,
  });

  const dmarcValue = emailDomain ? `v=DMARC1; p=none; rua=mailto:dmarc@${emailDomain}` : "";
  const dnsRows = [
    ...dnsRecords.map((row, i) => ({ ...row, _key: `${row.type}-${row.name}-${i}` })),
    ...(emailDomain ? [{ _key: "dmarc", _dmarc: true }] : []),
  ];
  const dnsColumns = [
    {
      key: "type",
      label: "Type",
      render: (row) => (row._dmarc ? (
        <>
          <code>TXT</code>
          <span className="wb5-dns-kind">DMARC</span>
        </>
      ) : (
        <>
          <code>{row.type || "—"}</code>
          {row.record ? <span className="wb5-dns-kind">{row.record}</span> : null}
        </>
      )),
    },
    {
      key: "name",
      label: "Name / Host",
      render: (row) => <code className="wb5-wrap">{row._dmarc ? `_dmarc.${emailDomain}` : row.name || "—"}</code>,
    },
    {
      key: "value",
      label: "Value",
      render: (row) => {
        const value = row._dmarc ? dmarcValue : row.value;
        return (
          <>
            <div className="wb5-dns-value">
              <code>{value || "—"}</code>
              {value ? <CopyButton value={value} /> : null}
            </div>
            {row._dmarc ? <span className="wb5-dns-kind">Recommended</span> : null}
          </>
        );
      },
    },
    {
      key: "priority",
      label: "Priority",
      render: (row) => (!row._dmarc && row.priority != null && row.priority !== "" ? row.priority : "—"),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (row._dmarc ? "—" : <DnsStatusPill status={row.status} />),
    },
  ];

  return (
    <>
      <div className="wb5-stack">
        {err ? <Callout tone="danger">{err}</Callout> : null}
        {msg ? <Callout tone="ok">{msg}</Callout> : null}

        <Section
          title={profile.name || "Sending profile"}
          actions={<Button onClick={onClose}>Back to profiles</Button>}
        >
          <form onSubmit={handleSave} className="wb5-form">
            <p className="wb5-text">
              A sending profile is who messages come <em>from</em>. Choose it on each map or directory under
              its Messaging tab. Until the domain below is verified, messages send from the platform default,{" "}
              <strong>{platformDefaultFrom}</strong>, using this profile&apos;s display name.
            </p>
            <Field label="Profile name" required hint="Only used to tell your profiles apart. Visitors never see it.">
              <TextInput
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Events team"
              />
            </Field>
            <FieldGrid>
              <Field label="Display name">
                <TextInput
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder={clientName || "Your organisation"}
                />
              </Field>
              <Field label="Email address">
                <TextInput
                  type="email"
                  value={fromAddress}
                  onChange={(e) => setFromAddress(e.target.value)}
                  placeholder="hello@yourcompany.com"
                  required
                />
              </Field>
            </FieldGrid>
            <div className="wb5-row">
              <Button type="submit" variant="primary" loading={busy === "save"} loadingLabel="Saving…">
                Save
              </Button>
            </div>
          </form>
        </Section>

        <Section
          title="Domain & DNS"
          actions={<Pill tone={tone}>{emailDomainStatusLabel(domainStatus)}</Pill>}
        >
          <div className="wb5-stack">
            {emailDomain ? (
              <p className="wb5-text">
                Domain: <strong>{emailDomain}</strong>
              </p>
            ) : null}

            {!fromAddress.trim() ? (
              <Callout tone="info">
                Enter a from email address above before setting up the domain (Save is optional — Set up
                domain saves it automatically).
              </Callout>
            ) : null}

            <div className="wb5-row">
              {!hasDomain || dnsRecords.length === 0 ? (
                <Button
                  variant="primary"
                  onClick={handleSetupDomain}
                  disabled={!fromAddress.trim()}
                  loading={busy === "setup"}
                  loadingLabel="Working…"
                >
                  Set up domain
                </Button>
              ) : null}
              {hasDomain ? (
                <>
                  <Button
                    variant="primary"
                    onClick={handleVerify}
                    loading={busy === "verify"}
                    loadingLabel="Verifying…"
                  >
                    Verify DNS settings
                  </Button>
                  {domainStatus !== "verified" ? (
                    <Button
                      onClick={() => setInstructionsOpen(true)}
                      disabled={dnsRecords.length === 0}
                      title={dnsRecords.length === 0 ? "Set up the domain first to generate DNS records" : undefined}
                    >
                      Setup instructions
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>

            {!busy && setupFeedback && !domainVerified ? (
              <Callout tone={setupFeedback.ok ? "ok" : "warn"}>{setupFeedback.text}</Callout>
            ) : null}

            {busy === "verify" ? (
              <Callout tone="info">
                Verifying your DNS records with Resend — this can take up to 20 seconds…
              </Callout>
            ) : null}

            {!busy && verifyFeedback && !domainVerified ? (
              <Callout tone={verifyFeedback.ok ? "ok" : "warn"}>{verifyFeedback.text}</Callout>
            ) : null}

            {dnsRecords.length > 0 ? (
              <>
                {!domainVerified ? (
                  <Callout tone="info" title="How to add these records">
                    <ol className="wb5-steps">
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
                    <p className="wb5-guide-note">
                      <strong>DMARC</strong> is included in the table below. It is not checked by our
                      verification step but is strongly recommended — it protects your domain from spoofing
                      and improves deliverability over time.
                    </p>
                  </Callout>
                ) : null}

                <DataTable
                  caption="DNS records"
                  columns={dnsColumns}
                  rows={dnsRows}
                  getRowId={(row) => row._key}
                  getRowLabel={(row) => (row._dmarc ? "DMARC record" : `${row.type || ""} record`)}
                />
              </>
            ) : null}

            {!domainVerified ? (
              <p className="wb5-note">
                Until your domain is verified, messages use the platform default sender. Submissions are
                always saved under Stats regardless of email delivery.
              </p>
            ) : null}
          </div>
        </Section>

        <Section title="Delete profile" tone="danger">
          <div className="wb5-row">
            <Button variant="danger" onClick={handleDelete} loading={busy === "delete"} loadingLabel="Deleting…">
              Delete profile
            </Button>
          </div>
        </Section>
      </div>

      <SetupInstructionsOverlay
        open={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
        text={setupInstructionsText}
      />
    </>
  );
}
