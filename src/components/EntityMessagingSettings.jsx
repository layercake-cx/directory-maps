import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { recordAdminEvent } from "../lib/adminEvents.js";
import { emailDomainStatusLabel } from "../lib/clientEmail.js";
import { useMessagingAllowed } from "../hooks/useMessagingAllowed.js";
import EntitlementGate from "./EntitlementGate.jsx";
import { getBlockedMessage } from "../lib/entitlementMessages.js";
import styles from "../pages/client/ClientEmail.module.css";

const COLUMNS =
  "messaging_profile_id,messaging_enabled,email_test_mode,email_test_recipient,message_prompt,message_subject,message_intro";
const DEFAULT_SUBJECT_PLACEHOLDER = "Message received for {listing}";

/**
 * Messaging settings for ONE map or ONE directory: which sending profile to use,
 * the on/off switch, test mode + recipient, and the message text (prompt shown to
 * visitors, email subject, email opening message). Sending profiles themselves
 * (From address + domain) are created at organisation level under Messaging.
 *
 * Messaging is blocked until a profile is chosen — the switch stays disabled and the
 * public "Send message" / "Contact" controls do not appear.
 *
 * @param {{ entity: "map" | "directory", entityId: string, clientId: string,
 *   eventSource?: string, canManage?: boolean, onSaved?: () => void }} props
 */
export default function EntityMessagingSettings({
  entity,
  entityId,
  clientId,
  eventSource = "client_portal",
  canManage = true,
  onSaved,
}) {
  const table = entity === "directory" ? "directories" : "maps";
  // Profiles are created at organisation level (the Messaging page), which opens the
  // "New profile" form when given ?new=1. Staff land on the customer's Messaging tab.
  const newProfileHref =
    eventSource === "admin_dashboard"
      ? `/admin/clients/${encodeURIComponent(clientId)}/messaging?new=1`
      : "/client/email?new=1";
  const noun = entity === "directory" ? "directory" : "map";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [saved, setSaved] = useState(null); // last persisted row, for changed_fields

  const [profileId, setProfileId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [testRecipient, setTestRecipient] = useState("");
  const [prompt, setPrompt] = useState("");
  const [subject, setSubject] = useState("");
  const [intro, setIntro] = useState("");

  const { allowed, loading: gateLoading } = useMessagingAllowed(clientId, eventSource);

  const apply = useCallback((row) => {
    setSaved(row);
    setProfileId(row?.messaging_profile_id ?? "");
    setEnabled(!!row?.messaging_enabled);
    setTestMode(row?.email_test_mode !== false);
    setTestRecipient(row?.email_test_recipient ?? "");
    setPrompt(row?.message_prompt ?? "");
    setSubject(row?.message_subject ?? "");
    setIntro(row?.message_intro ?? "");
  }, []);

  const load = useCallback(async () => {
    if (!entityId || !clientId) return;
    setLoading(true);
    setErr("");
    try {
      const [row, profs] = await Promise.all([
        supabase.from(table).select(COLUMNS).eq("id", entityId).single(),
        supabase
          .from("messaging_profiles")
          .select("id,name,email_from_address,email_domain_status")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true }),
      ]);
      if (row.error) throw row.error;
      if (profs.error) throw profs.error;
      apply(row.data);
      setProfiles(profs.data ?? []);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [table, entityId, clientId, apply]);

  useEffect(() => {
    load();
  }, [load]);

  const hasProfile = !!profileId;
  const chosen = profiles.find((p) => p.id === profileId) ?? null;

  async function handleSave(e) {
    e.preventDefault();
    if (!canManage) return;
    setErr("");
    setMsg("");
    if (enabled && !hasProfile) {
      setErr("Choose a sending profile before turning messaging on.");
      return;
    }
    if (enabled && !prompt.trim()) {
      setErr("A prompt message is required when messaging is on.");
      return;
    }
    if (enabled && !subject.trim()) {
      setErr("An email subject is required when messaging is on.");
      return;
    }
    if (testMode && !testRecipient.trim()) {
      setErr("A test recipient email is required while test mode is on.");
      return;
    }

    const next = {
      messaging_profile_id: profileId || null,
      messaging_enabled: enabled && hasProfile,
      email_test_mode: testMode,
      email_test_recipient: testMode ? testRecipient.trim() : testRecipient.trim() || null,
      message_prompt: prompt.trim() || null,
      message_subject: subject.trim() || null,
      message_intro: intro.trim() || null,
    };

    setSaving(true);
    try {
      const { data, error } = await supabase.from(table).update(next).eq("id", entityId).select(COLUMNS).single();
      if (error) throw error;

      const changed = Object.keys(next).filter((k) => (saved?.[k] ?? null) !== (next[k] ?? null));
      recordAdminEvent(supabase, {
        eventType: entity === "directory" ? "email_directory_settings_updated" : "email_map_settings_updated",
        clientId,
        mapId: entity === "map" ? entityId : undefined,
        meta: {
          client_id: clientId,
          ...(entity === "map" ? { map_id: entityId } : { directory_id: entityId }),
          profile_id: next.messaging_profile_id,
          enabled: next.messaging_enabled,
          test_mode: next.email_test_mode,
          changed_fields: changed,
          source: eventSource,
        },
      });

      apply(data);
      setMsg(
        entity === "directory"
          ? "Saved. Publish the directory again for changes to the Contact button to appear on entry pages."
          : "Saved. Changes apply to the published map straight away.",
      );
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const toggle = (value, setter, disabled = false) => (
    <div
      className={`${styles.toggle} ${value ? styles.toggleOn : ""}`}
      onClick={() => { if (!disabled && canManage) setter(!value); }}
      role="switch"
      aria-checked={value}
      aria-disabled={disabled || !canManage}
      tabIndex={0}
      style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !disabled && canManage) {
          e.preventDefault();
          setter(!value);
        }
      }}
    >
      <div className={styles.toggleThumb} />
    </div>
  );

  if (loading) return <p>Loading…</p>;

  return (
    <EntitlementGate allowed={allowed} loading={gateLoading} message={getBlockedMessage("messaging")}>
      <form onSubmit={handleSave} className={styles.messagingGrid}>
        <section className={`${styles.panelBox} ${styles.panelBoxFull}`}>
          {err ? <p className={styles.error}>{err}</p> : null}
          {msg ? <p className={styles.success}>{msg}</p> : null}

          <h2 className={styles.sectionTitle}>Sending profile</h2>
          <p className={styles.hint}>
            Who messages from this {noun} are sent <em>from</em>. Messaging cannot be turned on until a profile is
            chosen. Profiles are created and verified under Messaging for your organisation.
          </p>
          <label className={styles.field}>
            <select
              value={profileId}
              onChange={(e) => {
                setProfileId(e.target.value);
                if (!e.target.value) setEnabled(false);
                setMsg("");
              }}
              disabled={!canManage}
              aria-label="Sending profile"
            >
              <option value="">— Choose a sending profile —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.email_from_address ? ` (${p.email_from_address})` : ""}
                </option>
              ))}
            </select>
          </label>
          {canManage ? (
            <p className={styles.hint}>
              <Link to={newProfileHref}>Create a new profile</Link>
            </p>
          ) : null}
          {profiles.length === 0 ? (
            <p className={styles.disabledNote}>
              Your organisation has no sending profiles yet. Create one, then come back to choose it.
            </p>
          ) : null}
          {chosen && chosen.email_domain_status !== "verified" ? (
            <p className={styles.note}>
              This profile&apos;s domain is <strong>{emailDomainStatusLabel(chosen.email_domain_status).toLowerCase()}</strong>.
              Messages will send from the platform default address using the profile&apos;s display name until it is verified.
            </p>
          ) : null}
        </section>

        <section className={`${styles.panelBox} ${enabled ? styles.panelBoxActive : styles.panelBoxOff}`}>
          <h2 className={styles.sectionTitle}>Enable messaging</h2>
          <p className={styles.hint}>
            {entity === "directory" ? (
              <>
                When on, a <strong>Contact</strong> button appears under Visit website on this directory&apos;s
                published entry pages, for entries that have an email address (after you publish again).
              </>
            ) : (
              <>
                When on, a &ldquo;Send message&rdquo; button appears on this map&apos;s listings that have an email
                address.
              </>
            )}
          </p>
          <div className={styles.toggleRow}>
            {toggle(enabled && hasProfile, setEnabled, !hasProfile)}
            <span className={styles.toggleLabel}>
              {!hasProfile
                ? "Messaging is off — choose a sending profile first"
                : enabled
                  ? "Messaging is on"
                  : "Messaging is off"}
            </span>
          </div>
        </section>

        <section className={`${styles.panelBox} ${testMode ? styles.panelBoxActive : ""}`}>
          <h2 className={styles.sectionTitle}>Test mode</h2>
          <p className={styles.hint}>
            {entity === "directory"
              ? "When test mode is on, messages go to the test recipient below instead of the entry's email address."
              : "When test mode is on, messages are sent to the test recipient below instead of the listing's email address."}{" "}
            Turn it off when you are ready to go live.
          </p>
          <div className={styles.toggleRow}>
            {toggle(testMode, setTestMode)}
            <span className={styles.toggleLabel}>
              {testMode ? "Test mode is on" : "Test mode is off — messages go to real recipients"}
            </span>
          </div>
          {testMode ? (
            <div className={styles.promptField}>
              <label className={styles.field}>
                <span>
                  Test recipient email <span className={styles.required}>*</span>
                </span>
                <input
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="you@yourcompany.com"
                  disabled={!canManage}
                />
              </label>
            </div>
          ) : null}
        </section>

        <section className={`${styles.panelBox} ${styles.panelBoxFull}`}>
          <h2 className={styles.sectionTitle}>Message text</h2>
          <div className={styles.emailTemplateFields}>
            <label className={styles.field}>
              <span>
                Prompt message {enabled ? <span className={styles.required}>*</span> : null}
              </span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Complete the form below and we'll pass your message on."
                rows={3}
                className={styles.textarea}
                disabled={!canManage}
              />
              <span className={styles.fieldHint}>
                Shown to visitors above the contact form.
              </span>
            </label>
            <label className={styles.field}>
              <span>
                Email subject {enabled ? <span className={styles.required}>*</span> : null}
              </span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={DEFAULT_SUBJECT_PLACEHOLDER}
                disabled={!canManage}
              />
              <span className={styles.fieldHint}>
                Subject line of the email the recipient receives. Use <code>{`{listing}`}</code> for the{" "}
                {entity === "directory" ? "entry" : "listing"} name.
              </span>
            </label>
            <label className={styles.field}>
              <span>Email opening message</span>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                placeholder="Optional — e.g. You have received a message via our directory for {listing}."
                rows={3}
                className={styles.textarea}
                disabled={!canManage}
              />
              <span className={styles.fieldHint}>
                Optional text at the top of the email, above the visitor&apos;s name and message. Leave blank to omit.
              </span>
            </label>
          </div>
          {canManage ? (
            <div className={styles.panelFooter}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save messaging settings"}
              </button>
            </div>
          ) : null}
        </section>
      </form>
    </EntitlementGate>
  );
}
