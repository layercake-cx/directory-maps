import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useEntitlement } from "../../hooks/useEntitlements.js";
import { fetchClientEntitlements } from "../../lib/entitlements.js";
import { getBlockedMessage } from "../../lib/entitlementMessages.js";
import { getDirectoryClaimSettings, saveDirectoryClaimSettings } from "../../lib/directoryClaimSettings.js";
import {
  activateClaim,
  createManualClaim,
  listClaimsForDirectory,
  listUnclaimedEntries,
  reactivateClaim,
  revokeClaim,
  sendClaimUserMagicLink,
  setClaimPaymentStatus,
  suspendClaim,
} from "../../lib/claims.js";
import { supabase } from "../../lib/supabase";
import EntitlementGate from "../EntitlementGate.jsx";
import MapDataTabs from "../MapDataTabs.jsx";
import RichTextEditor from "./entryEdit/RichTextEditor.jsx";

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

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "Claim in progress", statuses: ["claim_started", "email_verification_pending", "verified", "payment_pending"] },
  { id: "active", label: "Active", statuses: ["active"] },
  { id: "payment_issue", label: "Payment issue", statuses: ["payment_failed"] },
  { id: "suspended", label: "Suspended", statuses: ["suspended"] },
  { id: "revoked", label: "Revoked", statuses: ["revoked"] },
];

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
    <div>
      <MapDataTabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "claims", label: "Claims" },
          { id: "settings", label: "Settings" },
        ]}
        activeTab={subTab}
        onChange={setSubTab}
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
    <div className="admin-card">
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Overview</p>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
        Claim activity and commercial analytics will appear here once organisations start claiming listings in this directory.
      </p>
    </div>
  );
}

function formatWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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

  return (
    <div className="admin-card">
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="search"
          placeholder="Search by listing, domain, or owner"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 240px", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        {canManage && (
          <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setShowCreate((s) => !s)}>
            {showCreate ? "Cancel" : "Create claim"}
          </button>
        )}
      </div>

      {err && <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>}

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

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.7 }}>
              <th style={{ padding: "6px 8px 6px 0", fontWeight: 600 }}>Listing</th>
              <th style={{ padding: "6px 8px", fontWeight: 600 }}>Domain</th>
              <th style={{ padding: "6px 8px", fontWeight: 600 }}>Claim status</th>
              <th style={{ padding: "6px 8px", fontWeight: 600 }}>Owner</th>
              <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Users</th>
              <th style={{ padding: "6px 8px", fontWeight: 600 }}>Payment</th>
              <th style={{ padding: "6px 0 6px 8px", fontWeight: 600 }}>Claimed</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: "16px 0", textAlign: "center", opacity: 0.6 }}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "16px 0", textAlign: "center", opacity: 0.6 }}>No claims yet.</td></tr>
            )}
            {!loading && filtered.map((c) => (
              <React.Fragment key={c.id}>
                <tr
                  style={{ borderTop: "1px solid var(--lc-border)", cursor: "pointer" }}
                  onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}
                >
                  <td style={{ padding: "8px 8px 8px 0" }}>{c.entry_name}</td>
                  <td style={{ padding: "8px" }}>{c.listing_domain ?? "—"}</td>
                  <td style={{ padding: "8px" }}>{STATUS_LABELS[c.status] ?? c.status}</td>
                  <td style={{ padding: "8px" }}>{c.owner?.name || c.owner?.email || "—"}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{c.users.length}</td>
                  <td style={{ padding: "8px" }}>{c.payment?.payment_status ?? "—"}</td>
                  <td style={{ padding: "8px 0 8px 8px", whiteSpace: "nowrap" }}>{formatWhen(c.started_at)}</td>
                </tr>
                {expandedId === c.id && (
                  <tr>
                    <td colSpan={7} style={{ padding: "0 0 12px" }}>
                      <ClaimDetail claim={c} canManage={canManage} recordEvent={recordEvent} onChanged={load} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
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
    <form onSubmit={handleSubmit} className="admin-card" style={{ marginBottom: 16, display: "grid", gap: 12 }}>
      {err && <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>{err}</p>}

      <div>
        <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Listing</label>
        {entriesLoading ? (
          <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>Loading listings…</p>
        ) : entries.length === 0 ? (
          <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>Every active listing already has a claim in progress or active.</p>
        ) : (
          <select
            value={directoryItemId}
            onChange={(e) => setDirectoryItemId(e.target.value)}
            style={{ width: "100%", maxWidth: 420, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
          >
            {entries.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Owner name</label>
          <input
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Owner email</label>
          <input
            type="email"
            required
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
          />
        </div>
      </div>

      <div>
        <span style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Verification</span>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="radio" name="verification-method" checked={verificationMethod === "domain_email"} onChange={() => setVerificationMethod("domain_email")} />
            Verify against listing domain{selectedEntry ? ` (${selectedEntry.website_url || "no website on file"})` : ""}
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="radio" name="verification-method" checked={verificationMethod === "admin_override"} onChange={() => setVerificationMethod("admin_override")} />
            Admin override
          </label>
        </div>
        {verificationMethod === "admin_override" && (
          <textarea
            required
            value={verificationNote}
            onChange={(e) => setVerificationNote(e.target.value)}
            placeholder="Why this claim is being verified without a matching email domain"
            rows={2}
            style={{ width: "100%", maxWidth: 500, marginTop: 8, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
          />
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={saving || entries.length === 0}>
          {saving ? "Creating…" : "Create claim"}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
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

  const meta = { directory_id: claim.directory_id, directory_item_id: claim.directory_item_id, claim_id: claim.id };

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
      await sendClaimUserMagicLink(claim.owner.email);
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

  return (
    <div className="admin-card" style={{ margin: "0 8px", background: "#f9fafb" }}>
      {err && <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 13 }}>{msg}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, fontSize: 13, marginBottom: 12 }}>
        <div><strong>Verification</strong><div>{claim.verification_method === "admin_override" ? "Admin override" : "Domain email"} · {claim.claimant_email}</div></div>
        <div><strong>Created by</strong><div>{claim.created_by === "admin" ? "Admin" : "Self-service"}</div></div>
        {claim.revoked_reason && <div><strong>Revoked reason</strong><div>{claim.revoked_reason}</div></div>}
        <div>
          <strong>Users</strong>
          <div>{claim.users.map((u) => `${u.name || u.email} (${u.role})`).join(", ") || "—"}</div>
        </div>
      </div>

      {canManage && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {claim.owner?.email && claim.status !== "revoked" && (
            <button type="button" className="btn" disabled={busy} onClick={handleInvite}>
              {claim.owner?.user_id ? "Resend invitation" : "Send invitation"}
            </button>
          )}
          {(claim.status === "verified" || claim.status === "payment_pending") && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => activateClaim(claim.id), "claim_activated", { activation_reason: "admin_manual" })}>
              Activate
            </button>
          )}
          {claim.status === "active" && (
            <button type="button" className="btn" disabled={busy} onClick={() => run(() => suspendClaim(claim.id), "claim_suspended")}>
              Suspend
            </button>
          )}
          {claim.status === "suspended" && (
            <button type="button" className="btn" disabled={busy} onClick={() => run(() => reactivateClaim(claim.id), "claim_reactivated")}>
              Reactivate
            </button>
          )}
          {claim.status !== "revoked" && (
            <button
              type="button"
              className="btn"
              style={{ color: "#b91c1c" }}
              disabled={busy}
              onClick={() => {
                // eslint-disable-next-line no-alert
                const reason = window.prompt("Reason for revoking this claim (optional):", "");
                if (reason === null) return;
                run(() => revokeClaim(claim.id, reason), "claim_revoked", { reason: reason || undefined });
              }}
            >
              Revoke
            </button>
          )}
        </div>
      )}

      {canManage && claim.status !== "revoked" && (
        <form onSubmit={handleSavePayment} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Payment status</label>
            <input type="text" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} placeholder="e.g. paid, invoiced, complimentary" style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--lc-border)", fontSize: 12 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Payment type</label>
            <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--lc-border)", fontSize: 12 }}>
              <option value="">—</option>
              <option value="one_off">One-off</option>
              <option value="annual_recurring">Annual recurring</option>
            </select>
          </div>
          <button type="submit" className="btn" disabled={busy} style={{ fontSize: 12 }}>Save payment status</button>
        </form>
      )}
    </div>
  );
}

function ClaimsSettingsForm({ directoryId, canManage, recordEvent }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!directoryId) return;
    setLoading(true);
    try {
      setSettings(await getDirectoryClaimSettings(directoryId));
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
    try {
      setSaving(true);
      await saveDirectoryClaimSettings(directoryId, {
        enabled: settings.enabled,
        price_cents: settings.price_cents,
        currency: settings.currency,
        payment_type: settings.payment_type,
        payment_provider: settings.payment_provider,
        intro_html: settings.intro_html,
      });
      recordEvent?.("directory_claim_settings_updated", {
        directory_id: directoryId,
        changed_fields: ["enabled", "price_cents", "currency", "payment_type", "intro_html"],
      });
      setMsg("Claim settings saved.");
      await load();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="admin-card">
        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Loading…</p>
      </div>
    );
  }

  const disabled = !canManage;
  const priceValue = settings.price_cents == null ? "" : (settings.price_cents / 100).toFixed(2);

  return (
    <form className="admin-card" onSubmit={handleSave} style={{ display: "grid", gap: 16 }}>
      {err && <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 13, margin: 0 }}>{msg}</p>}

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, cursor: disabled ? "default" : "pointer" }}>
        <input
          type="checkbox"
          checked={!!settings.enabled}
          onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
          disabled={disabled}
          style={{ marginTop: 2 }}
        />
        <span>
          <strong>Claims enabled</strong>
          <div style={{ opacity: 0.65, marginTop: 2 }}>
            When on, an unclaimed listing's public page shows a <strong>Claim this listing</strong> button.
          </div>
        </span>
      </label>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }} htmlFor="claim-price">Price</label>
          <input
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
            style={{ width: 120, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }} htmlFor="claim-currency">Currency</label>
          <select
            id="claim-currency"
            value={settings.currency ?? "GBP"}
            onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))}
            disabled={disabled}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <span style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Payment type</span>
          <div style={{ display: "flex", gap: 12, alignItems: "center", height: 34 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input
                type="radio"
                name="claim-payment-type"
                checked={settings.payment_type === "one_off"}
                onChange={() => setSettings((s) => ({ ...s, payment_type: "one_off" }))}
                disabled={disabled}
              />
              One-off
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input
                type="radio"
                name="claim-payment-type"
                checked={settings.payment_type === "annual_recurring"}
                onChange={() => setSettings((s) => ({ ...s, payment_type: "annual_recurring" }))}
                disabled={disabled}
              />
              Annual recurring
            </label>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }} htmlFor="claim-provider">Payment provider</label>
          <input
            id="claim-provider"
            type="text"
            value="Stripe"
            disabled
            style={{ width: 100, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13, opacity: 0.7 }}
          />
        </div>
      </div>

      <div>
        <span style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Claim introduction</span>
        <p style={{ margin: "0 0 8px", fontSize: 12, opacity: 0.65 }}>Shown to a visitor before they start claiming a listing — benefits, price, what happens next.</p>
        <RichTextEditor
          value={settings.intro_html || ""}
          onChange={(html) => setSettings((s) => ({ ...s, intro_html: html }))}
          editable={canManage}
        />
      </div>

      {!canManage && (
        <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can change claim settings.</p>
      )}

      {canManage && (
        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save claim settings"}
          </button>
        </div>
      )}
    </form>
  );
}
