import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useEntitlement } from "../../hooks/useEntitlements.js";
import { fetchClientEntitlements } from "../../lib/entitlements.js";
import { getBlockedMessage } from "../../lib/entitlementMessages.js";
import { getDirectoryClaimSettings, saveDirectoryClaimSettings, isValidClaimNotifyEmail } from "../../lib/directoryClaimSettings.js";
import { publishDirectoryItem } from "../../lib/claimManager.js";
import {
  activateClaim,
  approveManualClaim,
  createManualClaim,
  listClaimsForDirectory,
  listUnclaimedEntries,
  reactivateClaim,
  revokeClaim,
  sendClaimUserMagicLink,
  setClaimPaymentStatus,
  suspendClaim,
  transferClaimOwnership,
} from "../../lib/claims.js";
import { supabase } from "../../lib/supabase";
import EntitlementGate from "../EntitlementGate.jsx";
import RichTextEditor from "./entryEdit/RichTextEditor.jsx";
import ClaimBannerSettings from "./ClaimBannerSettings.jsx";
import { bannerFromSettings, bannerToColumns, validateClaimBanner } from "../../lib/claimBanner.js";
import {
  Button, Callout, Dialog, EmptyState, ErrorState, Field, FieldGrid, Pill, RadioCards, Section, SegmentedControl,
  Select, SettingRow, Skeleton, Switch, Tabs, Textarea, TextInput, Toolbar, DataTable,
} from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";

const CURRENCIES = ["GBP", "USD", "EUR"];

const STATUS_LABELS = {
  claim_started: "Claim started",
  email_verification_pending: "Email verification pending",
  verified: "Verified",
  payment_pending: "Payment pending",
  active: "Active",
  payment_failed: "Payment issue",
  suspended: "Suspended",
  revoked: "Revoked",
};

/** A manual request that nobody has approved yet reads "Awaiting review" rather than "Claim started". */
function statusLabel(claim) {
  if (claim.status === "claim_started" && claim.request) return "Awaiting review";
  return STATUS_LABELS[claim.status] ?? claim.status;
}

/** Pill tone per claim status (the label always carries the meaning). */
function statusTone(claim) {
  if (claim.status === "claim_started" && claim.request) return "warn";
  switch (claim.status) {
    case "active": return "live";
    case "verified": return "info";
    case "payment_failed": return "danger";
    case "email_verification_pending":
    case "payment_pending":
    case "suspended": return "warn";
    default: return "neutral";
  }
}

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "Claim in progress", statuses: ["claim_started", "email_verification_pending", "verified", "payment_pending"] },
  { id: "active", label: "Active", statuses: ["active"] },
  { id: "payment_issue", label: "Payment issue", statuses: ["payment_failed"] },
  { id: "suspended", label: "Suspended", statuses: ["suspended"] },
  { id: "revoked", label: "Revoked", statuses: ["revoked"] },
];

/**
 * Small text-entry dialog that replaces window.prompt. Resolves through onSubmit(value) / onCancel().
 * `required` blocks an empty value; the value is returned trimmed only when `trim` is set.
 */
function PromptDialog({ title, label, hint, initial = "", type = "text", required = false, confirmLabel = "Confirm", danger = false, onSubmit, onCancel }) {
  const [value, setValue] = useState(initial);
  const formId = useId();
  const canSubmit = !required || value.trim().length > 0;
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" form={formId} variant={danger ? "danger-solid" : "primary"} disabled={!canSubmit}>{confirmLabel}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => { e.preventDefault(); if (canSubmit) onSubmit(value); }}>
        <Field label={label} hint={hint} required={required}>
          <TextInput type={type} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/**
 * Directory admin's Claims area (Claimed Directory Listings epic, Phase 2).
 * Overview / Claims / Settings sub-tabs, shared by client portal and admin
 * dashboard exactly like DomainSettings.jsx handles custom_domain — the
 * entitlement is resolved differently depending on which context this is
 * rendered in (the logged-in user's own client vs. an admin-supplied
 * clientId), since get_my_entitlements() only ever resolves the caller's
 * own client_id.
 */
export default function DirectoryClaimsPanel({ directoryId, clientId, canManage, recordEvent, eventSource = "client_portal" }) {
  const [subTab, setSubTab] = useState("overview");

  const isClientPortal = eventSource === "client_portal";
  const { enabled: myClaimsEnabled, loading: myEntitlementLoading } = useEntitlement("claims");
  const [adminClaimsEnabled, setAdminClaimsEnabled] = useState(null); // null = loading

  useEffect(() => {
    if (isClientPortal || !clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await fetchClientEntitlements(clientId);
        if (!cancelled) setAdminClaimsEnabled(resolved?.claims?.enabled === true);
      } catch {
        // Fail open on a lookup error -- this is a UX gate, not the real
        // enforcement (later phases' RPCs re-check server-side).
        if (!cancelled) setAdminClaimsEnabled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isClientPortal, clientId]);

  const claimsAllowed = isClientPortal ? !!myClaimsEnabled : !!adminClaimsEnabled;
  const gateLoading = isClientPortal ? myEntitlementLoading : adminClaimsEnabled === null;

  return (
    <div className="b3-stack">
      <Tabs
        label="Claims sections"
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "claims", label: "Claims" },
          { key: "settings", label: "Settings" },
        ]}
        current={subTab}
        onSelect={setSubTab}
      />

      <EntitlementGate allowed={claimsAllowed} loading={gateLoading} message={getBlockedMessage("claims")}>
        {subTab === "overview" && <ClaimsOverview />}
        {subTab === "claims" && (
          <ClaimsList directoryId={directoryId} canManage={canManage} recordEvent={recordEvent} />
        )}
        {subTab === "settings" && (
          <ClaimsSettingsForm
            directoryId={directoryId}
            canManage={canManage}
            recordEvent={recordEvent}
          />
        )}
      </EntitlementGate>
    </div>
  );
}

function ClaimsOverview() {
  return (
    <Section title="Overview">
      <p className="b3-text">
        Claim activity and commercial analytics will appear here once organisations start claiming listings in this directory.
      </p>
    </Section>
  );
}

function formatWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ClaimsList({ directoryId, canManage, recordEvent }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!directoryId) return;
    setLoading(true);
    setErr("");
    try {
      setClaims(await listClaimsForDirectory(directoryId));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const activeFilter = STATUS_FILTERS.find((f) => f.id === statusFilter);
    const term = search.trim().toLowerCase();
    return claims.filter((c) => {
      if (activeFilter?.statuses && !activeFilter.statuses.includes(c.status)) return false;
      if (!term) return true;
      const haystack = [c.entry_name, c.listing_domain, c.owner?.name, c.owner?.email].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [claims, search, statusFilter]);

  const expandedClaim = expandedId ? claims.find((c) => c.id === expandedId) : null;

  const columns = [
    {
      key: "entry_name",
      label: "Listing",
      render: (c) => (
        <button type="button" className="b3-expand-btn" aria-expanded={expandedId === c.id} onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}>
          {c.entry_name}
        </button>
      ),
    },
    { key: "listing_domain", label: "Domain", render: (c) => c.listing_domain ?? "—" },
    { key: "status", label: "Claim status", render: (c) => <Pill tone={statusTone(c)}>{statusLabel(c)}</Pill> },
    { key: "owner", label: "Owner", render: (c) => c.owner?.name || c.owner?.email || "—" },
    { key: "users", label: "Users", align: "right", render: (c) => c.users.length },
    { key: "payment", label: "Payment", render: (c) => c.payment?.payment_status ?? "—" },
    { key: "started_at", label: "Claimed", render: (c) => formatWhen(c.started_at) },
  ];

  return (
    <div className="b3-stack">
      <Section title="Claims">
        <Toolbar>
          <div className="b3-search">
            <Field label="Search claims">
              <TextInput
                type="search"
                placeholder="Search by listing, domain, or owner"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Claim status">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </Select>
          </Field>
          {canManage && (
            <Button variant="primary" className="b3-push" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? "Cancel" : "Create claim"}
            </Button>
          )}
        </Toolbar>

        {showCreate && canManage && (
          <CreateClaimForm
            directoryId={directoryId}
            recordEvent={recordEvent}
            onCreated={() => {
              setShowCreate(false);
              load();
            }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {err ? (
          <ErrorState title="Claims could not be loaded" body={`${err} Nothing has been lost.`} onRetry={load} />
        ) : (
          <DataTable
            caption="Claims"
            columns={columns}
            rows={filtered}
            getRowId={(c) => c.id}
            getRowLabel={(c) => c.entry_name}
            loading={loading}
            empty={
              <EmptyState
                art={claims.length === 0 ? "encouraging" : "searching"}
                title={claims.length === 0 ? "No claims yet" : "No claims match"}
                body={claims.length === 0 ? "Claims appear here when an organisation claims a listing." : "Try a different search or status."}
                actions={claims.length === 0 && canManage && !showCreate ? <Button variant="primary" onClick={() => setShowCreate(true)}>Create claim</Button> : null}
              />
            }
          />
        )}
      </Section>

      {expandedClaim && (
        <Section
          title={expandedClaim.entry_name}
          description="Claim details"
          actions={<Button size="sm" onClick={() => setExpandedId(null)}>Close</Button>}
          flush
        >
          <ClaimDetail key={expandedClaim.id} claim={expandedClaim} canManage={canManage} recordEvent={recordEvent} onChanged={load} />
        </Section>
      )}
    </div>
  );
}

function CreateClaimForm({ directoryId, recordEvent, onCreated, onCancel }) {
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [directoryItemId, setDirectoryItemId] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("domain_email");
  const [verificationNote, setVerificationNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listUnclaimedEntries(directoryId);
        if (!cancelled) {
          setEntries(rows);
          if (rows.length > 0) setDirectoryItemId(rows[0].id);
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setEntriesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [directoryId]);

  const selectedEntry = entries.find((e) => e.id === directoryItemId);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!directoryItemId) {
      setErr("Select a listing.");
      return;
    }
    try {
      setSaving(true);
      const claimId = await createManualClaim({
        directoryItemId,
        ownerName,
        ownerEmail,
        verificationMethod,
        verificationNote,
      });
      recordEvent?.("claim_started", { directory_id: directoryId, directory_item_id: directoryItemId, claim_id: claimId, created_by: "admin" });
      recordEvent?.(
        verificationMethod === "admin_override" ? "claim_verification_overridden" : "claim_email_verified",
        { directory_id: directoryId, directory_item_id: directoryItemId, claim_id: claimId, verification_method: verificationMethod },
      );
      onCreated?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="b3-form">
      <h3 className="b3-subhead">New claim</h3>
      {err ? <Callout tone="danger">{err}</Callout> : null}

      {entriesLoading ? (
        <Skeleton variant="form" rows={1} label="Loading listings" />
      ) : entries.length === 0 ? (
        <Callout tone="info">Every active listing already has a claim in progress or active.</Callout>
      ) : (
        <Field label="Listing">
          <Select value={directoryItemId} onChange={(e) => setDirectoryItemId(e.target.value)}>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <FieldGrid>
        <Field label="Owner name">
          <TextInput value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </Field>
        <Field label="Owner email" required>
          <TextInput type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
        </Field>
      </FieldGrid>

      <RadioCards
        legend="Verification"
        name="verification-method"
        value={verificationMethod}
        onChange={setVerificationMethod}
        options={[
          { value: "domain_email", label: `Verify against listing domain${selectedEntry ? ` (${selectedEntry.website_url || "no website on file"})` : ""}` },
          { value: "admin_override", label: "Admin override" },
        ]}
      />
      {verificationMethod === "admin_override" && (
        <Field label="Reason for override" hint="Why this claim is being verified without a matching email domain." required>
          <Textarea rows={2} value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} />
        </Field>
      )}

      <div className="b3-form-actions">
        <Button type="submit" variant="primary" loading={saving} loadingLabel="Creating…" disabled={entries.length === 0}>
          Create claim
        </Button>
        <Button onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}

function ClaimDetail({ claim, canManage, recordEvent, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [paymentStatus, setPaymentStatus] = useState(claim.payment?.payment_status || "");
  const [paymentType, setPaymentType] = useState(claim.payment?.payment_type || "");
  const [prompt, setPrompt] = useState(null);

  const meta = { directory_id: claim.directory_id, directory_item_id: claim.directory_item_id, claim_id: claim.id };

  /** Resolves with the entered text, or null when the dialog is cancelled (same contract as window.prompt). */
  function askText(opts) {
    return new Promise((resolve) => setPrompt({ ...opts, resolve }));
  }
  function settlePrompt(value) {
    prompt?.resolve(value);
    setPrompt(null);
  }

  async function run(action, eventType, eventMeta) {
    setErr("");
    setMsg("");
    try {
      setBusy(true);
      await action();
      if (eventType) recordEvent?.(eventType, { ...meta, ...eventMeta });
      onChanged?.();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite() {
    if (!claim.owner?.email) return;
    setErr("");
    setMsg("");
    try {
      setBusy(true);
      await sendClaimUserMagicLink(claim.owner.email, { claimId: claim.id });
      await supabase.from("claim_users").update({ invited_at: new Date().toISOString() }).eq("id", claim.owner.id);
      recordEvent?.("claim_user_invited", { ...meta, claim_user_id: claim.owner.id, role: "owner" });
      setMsg(`Invitation sent to ${claim.owner.email}.`);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePayment(e) {
    e.preventDefault();
    await run(() => setClaimPaymentStatus(claim.id, { paymentStatus, paymentType }));
  }

  async function handleRevoke() {
    const reason = await askText({
      title: "Revoke this claim?",
      label: "Reason for revoking this claim",
      hint: "Optional.",
      confirmLabel: "Revoke claim",
      danger: true,
    });
    if (reason === null) return;
    await run(async () => {
      await revokeClaim(claim.id, reason);
      // Same as activation: rebuild this one listing so the public page
      // shows Claim this listing again. Never blocks the revoke itself.
      try {
        await publishDirectoryItem(claim.directory_item_id);
        recordEvent?.("claimed_listing_published", { ...meta, trigger: "auto_on_revoke" });
      } catch {
        // swallow -- the claim is already revoked; a directory Publish can rebuild the page
      }
    }, "claim_revoked", { reason: reason || undefined });
  }

  async function handleActivate() {
    await run(async () => {
      await activateClaim(claim.id);
      // Best-effort: republish this one entry immediately so the public
      // page reflects the claim right away, rather than sitting stale
      // until someone separately clicks Publish. Never blocks activation
      // itself if the publish fails.
      try {
        await publishDirectoryItem(claim.directory_item_id);
        recordEvent?.("claimed_listing_published", { ...meta, trigger: "auto_on_activation" });
      } catch {
        // swallow -- activation already succeeded, publish can be retried later
      }
    }, "claim_activated", { activation_reason: "admin_manual" });
  }

  async function handleApproveRequest() {
    const note = await askText({
      title: `Approve ${claim.request?.requester_name || "this person"} as owner of this listing?`,
      label: "Note",
      hint: "Optional.",
      confirmLabel: "Approve request",
    });
    if (note === null) return;
    await run(() => approveManualClaim(claim.id, note), "claim_verification_overridden", { verification_method: "admin_override" });
  }

  async function handleTransferOwnership() {
    const email = await askText({
      title: "Transfer ownership",
      label: "New owner's email address",
      type: "email",
      required: true,
      confirmLabel: "Transfer ownership",
    });
    if (email === null || !email.trim()) return;
    setErr("");
    setMsg("");
    try {
      setBusy(true);
      const { status, claimUserId } = await transferClaimOwnership(claim.id, { email: email.trim() });
      recordEvent?.("claim_ownership_transfer_started", { ...meta, from_claim_user_id: claim.owner?.id, to_claim_user_id: claimUserId });
      if (status === "completed") {
        recordEvent?.("claim_ownership_transferred", { ...meta, from_claim_user_id: claim.owner?.id, to_claim_user_id: claimUserId });
        setMsg(`Ownership transferred to ${email.trim()}.`);
      } else {
        await sendClaimUserMagicLink(email.trim(), { claimId: claim.id });
        setMsg(`Invitation sent to ${email.trim()}. Ownership transfers once they sign in.`);
      }
      onChanged?.();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="b3-detail">
      {err ? <Callout tone="danger">{err}</Callout> : null}
      {msg ? <Callout tone="ok">{msg}</Callout> : null}

      <div className="b3-detail-grid">
        <div>
          <p className="b3-detail-label">Verification</p>
          <p className="b3-detail-value">
            {claim.verification_method === "admin_override" ? "Admin override" : claim.verification_method === "domain_email" ? "Domain email" : "Not verified"} · {claim.claimant_email}
          </p>
        </div>
        {claim.request && (
          <div className="b3-detail-wide">
            <p className="b3-detail-label">Manual request from {claim.request.requester_name}</p>
            <p className="b3-detail-value b3-pre">{claim.request.message || "No message."}</p>
          </div>
        )}
        <div>
          <p className="b3-detail-label">Created by</p>
          <p className="b3-detail-value">{claim.created_by === "admin" ? "Admin" : "Self-service"}</p>
        </div>
        {claim.revoked_reason && (
          <div>
            <p className="b3-detail-label">Revoked reason</p>
            <p className="b3-detail-value">{claim.revoked_reason}</p>
          </div>
        )}
        <div>
          <p className="b3-detail-label">Users</p>
          <p className="b3-detail-value">{claim.users.map((u) => `${u.name || u.email} (${u.role})`).join(", ") || "—"}</p>
        </div>
      </div>

      {canManage && (
        <div className="b3-row">
          {claim.owner?.email && claim.status !== "revoked" && (
            <Button disabled={busy} onClick={handleInvite}>
              {claim.owner?.user_id ? "Resend invitation" : "Send invitation"}
            </Button>
          )}
          {claim.status === "claim_started" && claim.request && (
            <Button variant="primary" disabled={busy} onClick={handleApproveRequest}>
              Approve request
            </Button>
          )}
          {(claim.status === "verified" || claim.status === "payment_pending") && (
            <Button variant="primary" disabled={busy} onClick={handleActivate}>
              Activate
            </Button>
          )}
          {claim.status === "active" && (
            <Button disabled={busy} onClick={() => run(() => suspendClaim(claim.id), "claim_suspended")}>
              Suspend
            </Button>
          )}
          {claim.status === "suspended" && (
            <Button disabled={busy} onClick={() => run(() => reactivateClaim(claim.id), "claim_reactivated")}>
              Reactivate
            </Button>
          )}
          {claim.status === "active" && (
            <Button disabled={busy} onClick={handleTransferOwnership}>
              Transfer ownership
            </Button>
          )}
          {claim.status !== "revoked" && (
            <Button variant="danger" disabled={busy} onClick={handleRevoke}>
              Revoke
            </Button>
          )}
        </div>
      )}

      {canManage && claim.status !== "revoked" && (
        <form onSubmit={handleSavePayment} className="b3-row b3-row--end">
          <Field label="Payment status" hint="For example paid, invoiced, complimentary.">
            <TextInput value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} />
          </Field>
          <Field label="Payment type">
            <Select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
              <option value="">Not set</option>
              <option value="one_off">One-off</option>
              <option value="annual_recurring">Annual recurring</option>
            </Select>
          </Field>
          <Button type="submit" disabled={busy}>Save payment status</Button>
        </form>
      )}

      {prompt ? (
        <PromptDialog
          title={prompt.title}
          label={prompt.label}
          hint={prompt.hint}
          type={prompt.type}
          required={prompt.required}
          confirmLabel={prompt.confirmLabel}
          danger={prompt.danger}
          onSubmit={settlePrompt}
          onCancel={() => settlePrompt(null)}
        />
      ) : null}
    </div>
  );
}

function ClaimsSettingsForm({ directoryId, canManage, recordEvent }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const load = useCallback(async () => {
    if (!directoryId) return;
    setLoading(true);
    try {
      const row = await getDirectoryClaimSettings(directoryId);
      setSettings({ ...row, banner: bannerFromSettings(row) });
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    if (!canManage || !settings) return;
    setErr("");
    setMsg("");
    const { errors: bannerErrors } = validateClaimBanner(settings.banner, { enabled: !!settings.enabled });
    if (Object.keys(bannerErrors).length) {
      setShowErrors(true);
      setErr("Fix the highlighted claim banner fields before saving.");
      return;
    }
    if (settings.claim_mode === "manual" && !isValidClaimNotifyEmail(settings.claim_notify_email)) {
      setErr("Enter a valid mailbox for manual claim requests.");
      return;
    }
    try {
      setSaving(true);
      await saveDirectoryClaimSettings(directoryId, {
        enabled: settings.enabled,
        claim_mode: settings.claim_mode === "manual" ? "manual" : "auto",
        claim_notify_email: settings.claim_mode === "manual" ? settings.claim_notify_email : settings.claim_notify_email || null,
        price_cents: settings.price_cents,
        currency: settings.currency,
        payment_type: settings.payment_type,
        payment_provider: settings.payment_provider,
        intro_html: settings.intro_html,
        ...bannerToColumns(settings.banner),
      });
      recordEvent?.("directory_claim_settings_updated", {
        directory_id: directoryId,
        changed_fields: ["enabled", "claim_mode", "claim_notify_email", "price_cents", "currency", "payment_type", "intro_html", "banner"],
      });
      setMsg("Claim settings saved.");
      await load();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  if (!settings && !loading && err) {
    return <ErrorState title="Claim settings could not be loaded" body={`${err} Nothing has been lost.`} onRetry={() => { setErr(""); load(); }} />;
  }

  if (loading || !settings) {
    return (
      <Section title="Claim settings">
        <Skeleton variant="form" rows={4} label="Loading claim settings" />
      </Section>
    );
  }

  const disabled = !canManage;
  const priceValue = settings.price_cents == null ? "" : (settings.price_cents / 100).toFixed(2);

  return (
    <form className="b3-stack" onSubmit={handleSave}>
      {err ? <Callout tone="danger">{err}</Callout> : null}
      {msg ? <Callout tone="ok">{msg}</Callout> : null}
      {!canManage && <Callout tone="info">Only an Owner or Manager can change claim settings.</Callout>}

      <Section title="Claim settings" flush>
        <SettingRow
          label="Claims enabled"
          description={<>When on, an unclaimed listing's public page shows a <strong>Claim this listing</strong> button.</>}
          control={<Switch checked={!!settings.enabled} disabled={disabled} onChange={(next) => setSettings((s) => ({ ...s, enabled: next }))} />}
        />
      </Section>

      <Section title="How claims are handled" description="Changing this takes effect on listing pages after the directory is next published.">
        <fieldset className="choice-group" disabled={disabled}>
          <RadioCards
            legend="Claim mode"
            name="claim-mode"
            value={settings.claim_mode === "manual" ? "manual" : "auto"}
            onChange={(v) => setSettings((s) => ({ ...s, claim_mode: v }))}
            options={[
              { value: "auto", label: "Automatic verification", description: "The visitor enters a work email matching the listing's website and signs in with a link we email them." },
              { value: "manual", label: "Manual review", description: "The visitor sends their name, email and a message to a mailbox you choose. You then create the claim yourself from the Claims tab." },
            ]}
          />
          {settings.claim_mode === "manual" && (
            <div className="b3-narrow-field">
              <Field
                label="Send requests to"
                hint="Sent using this directory's email sending settings (Settings → Email sending), so messaging must be enabled with a sending profile chosen."
              >
                <TextInput
                  id="claim-notify-email"
                  type="email"
                  value={settings.claim_notify_email || ""}
                  onChange={(e) => setSettings((s) => ({ ...s, claim_notify_email: e.target.value }))}
                  placeholder="claims@yourorganisation.com"
                />
              </Field>
            </div>
          )}
        </fieldset>
      </Section>

      <Section title="Price and payment">
        <FieldGrid>
          <Field label="Price">
            <TextInput
              id="claim-price"
              type="number"
              min="0"
              step="0.01"
              value={priceValue}
              onChange={(e) => {
                const n = e.target.value === "" ? null : Math.round(Number(e.target.value) * 100);
                setSettings((s) => ({ ...s, price_cents: Number.isFinite(n) ? n : null }));
              }}
              disabled={disabled}
              placeholder="0.00"
            />
          </Field>
          <Field label="Currency">
            <Select
              id="claim-currency"
              value={settings.currency ?? "GBP"}
              onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))}
              disabled={disabled}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <fieldset className="choice-group" disabled={disabled}>
            <legend className="field-label">Payment type</legend>
            <SegmentedControl
              label="Payment type"
              value={settings.payment_type}
              onChange={(v) => setSettings((s) => ({ ...s, payment_type: v }))}
              options={[
                { value: "one_off", label: "One-off" },
                { value: "annual_recurring", label: "Annual recurring" },
              ]}
            />
          </fieldset>
          <Field label="Payment provider">
            <TextInput id="claim-provider" value="Stripe" disabled readOnly />
          </Field>
        </FieldGrid>
      </Section>

      <Section title="Claim introduction" description="Shown to a visitor before they start claiming a listing — benefits, price, what happens next.">
        <RichTextEditor
          value={settings.intro_html || ""}
          onChange={(html) => setSettings((s) => ({ ...s, intro_html: html }))}
          editable={canManage}
        />
      </Section>

      <ClaimBannerSettings
        directoryId={directoryId}
        banner={settings.banner}
        onChange={(banner) => setSettings((s) => ({ ...s, banner }))}
        disabled={disabled}
        enabled={!!settings.enabled}
        showErrors={showErrors}
      />

      {canManage && (
        <div className="b3-form-actions">
          <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">Save claim settings</Button>
        </div>
      )}
    </form>
  );
}
