import React, { useCallback, useEffect, useState } from "react";
import { useEntitlement } from "../../hooks/useEntitlements.js";
import { fetchClientEntitlements } from "../../lib/entitlements.js";
import { getBlockedMessage } from "../../lib/entitlementMessages.js";
import { getDirectoryClaimSettings, saveDirectoryClaimSettings } from "../../lib/directoryClaimSettings.js";
import EntitlementGate from "../EntitlementGate.jsx";
import MapDataTabs from "../MapDataTabs.jsx";
import RichTextEditor from "./entryEdit/RichTextEditor.jsx";

const CURRENCIES = ["GBP", "USD", "EUR"];

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
        {subTab === "claims" && <ClaimsList />}
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

function ClaimsList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  return (
    <div className="admin-card">
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
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
          <option value="all">All</option>
          <option value="unclaimed">Unclaimed</option>
          <option value="in_progress">Claim in progress</option>
          <option value="active">Active</option>
          <option value="payment_issue">Payment issue</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

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
            <tr>
              <td colSpan={7} style={{ padding: "16px 0", textAlign: "center", opacity: 0.6 }}>
                No claims yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
