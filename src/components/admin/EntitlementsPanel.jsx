import React, { useCallback, useEffect, useState } from "react";
import {
  ENTITLEMENT_TYPES,
  listPlans,
  listFeatures,
  listClientEntitlementOverrides,
  getClientPlanKey,
  setClientPlanKey,
  setClientEntitlementOverride,
  clearClientEntitlementOverride,
} from "../../lib/entitlements.js";

/**
 * Self-contained "Entitlements" panel — plan assignment + per-feature
 * overrides for one client. Modelled on CategorisationsPanel.jsx (its own
 * data loading via clientId, recordEvent passed through for audit logging).
 * Admin-only (Epic 1 v1 has no client self-serve UI).
 */
export default function EntitlementsPanel({ clientId, recordEvent }) {
  const [plans, setPlans] = useState([]);
  const [features, setFeatures] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [planKey, setPlanKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingFeatureId, setSavingFeatureId] = useState(null);

  const emit = useCallback(
    (eventType, meta) => {
      recordEvent?.(eventType, { client_id: clientId ?? null, ...meta });
    },
    [recordEvent, clientId]
  );

  const refresh = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [planList, featureList, overrideList, currentPlanKey] = await Promise.all([
        listPlans(),
        listFeatures(),
        listClientEntitlementOverrides(clientId),
        getClientPlanKey(clientId),
      ]);
      setPlans(planList);
      setFeatures(featureList);
      setOverrides(overrideList);
      setPlanKey(currentPlanKey ?? "standard");
      setError("");
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedPlan = plans.find((p) => p.key === planKey) ?? null;

  async function handlePlanChange(nextPlanKey) {
    const previous = planKey;
    if (nextPlanKey === previous) return;
    setPlanKey(nextPlanKey);
    setSavingPlan(true);
    try {
      await setClientPlanKey(clientId, nextPlanKey);
      emit("entitlements_plan_changed", { from_plan_key: previous, to_plan_key: nextPlanKey });
    } catch (e) {
      setPlanKey(previous);
      setError(e?.message ?? String(e));
    } finally {
      setSavingPlan(false);
    }
  }

  function overrideFor(featureId) {
    return overrides.find((o) => o.feature_id === featureId) ?? null;
  }

  async function handleOverrideChange(feature, patch) {
    setSavingFeatureId(feature.id);
    try {
      await setClientEntitlementOverride(clientId, feature.id, patch);
      emit("entitlements_override_set", {
        feature_key: feature.key,
        entitlement_type: feature.entitlement_type,
        ...patch,
      });
      await refresh();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setSavingFeatureId(null);
    }
  }

  async function handleClearOverride(feature) {
    setSavingFeatureId(feature.id);
    try {
      await clearClientEntitlementOverride(clientId, feature.id);
      emit("entitlements_override_cleared", { feature_key: feature.key });
      await refresh();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setSavingFeatureId(null);
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      {error ? <p style={{ margin: "0 0 12px 0", color: "#b91c1c" }}>{error}</p> : null}

      <h3 style={{ margin: "0 0 8px 0", fontSize: 15 }}>Plan</h3>
      <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "var(--lc-muted)" }}>
        Sets this customer&apos;s commercial tier. Saved immediately.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <select
          value={planKey}
          disabled={savingPlan}
          onChange={(e) => handlePlanChange(e.target.value)}
          style={{ padding: "8px 10px" }}
        >
          {plans.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        {selectedPlan?.is_founder_tier ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: "#047857" }}>
            Founder Members — all entitlements unlimited
          </span>
        ) : null}
      </div>

      <h3 style={{ margin: "20px 0 8px 0", fontSize: 15 }}>Per-feature overrides</h3>
      <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "var(--lc-muted)" }}>
        Grant or restrict a specific feature for this customer, overriding their plan default.
      </p>

      {features.length === 0 ? (
        <p style={{ opacity: 0.8 }}>No entitlements in the catalog yet.</p>
      ) : (
        <table className="admin-table" style={{ marginTop: 0 }}>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Type</th>
              <th>Override</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {features.map((f) => {
              const ov = overrideFor(f.id);
              const savingThis = savingFeatureId === f.id;
              return (
                <tr key={f.id}>
                  <td>
                    <strong>{f.name}</strong>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      {f.product_key}.{f.key}
                    </div>
                  </td>
                  <td>{f.entitlement_type}</td>
                  <td>
                    <FeatureOverrideInput
                      feature={f}
                      override={ov}
                      disabled={savingThis}
                      onChange={(patch) => handleOverrideChange(f, patch)}
                    />
                  </td>
                  <td>
                    {ov ? (
                      <button type="button" disabled={savingThis} onClick={() => handleClearOverride(f)}>
                        Clear
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FeatureOverrideInput({ feature, override, disabled, onChange }) {
  if (feature.entitlement_type === ENTITLEMENT_TYPES.BOOLEAN) {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: disabled ? "wait" : "pointer" }}>
        <input
          type="checkbox"
          checked={override?.bool_value === true}
          disabled={disabled}
          onChange={(e) => onChange({ bool_value: e.target.checked })}
        />
        Enabled
      </label>
    );
  }

  if (
    feature.entitlement_type === ENTITLEMENT_TYPES.VOLUME ||
    feature.entitlement_type === ENTITLEMENT_TYPES.METERED
  ) {
    const field = feature.entitlement_type === ENTITLEMENT_TYPES.VOLUME ? "limit_value" : "included_allowance";
    const value = override?.[field] ?? "";
    return (
      <input
        key={overrideKey(override)}
        type="number"
        min={0}
        placeholder="Unlimited"
        defaultValue={value}
        disabled={disabled}
        style={{ width: 100, padding: "6px 8px" }}
        onBlur={(e) => {
          const next = e.target.value === "" ? null : Number(e.target.value);
          onChange({ [field]: next });
        }}
      />
    );
  }

  if (feature.entitlement_type === ENTITLEMENT_TYPES.TIME_BOXED) {
    const value = override?.expires_at ? override.expires_at.slice(0, 10) : "";
    return (
      <input
        key={overrideKey(override)}
        type="date"
        defaultValue={value}
        disabled={disabled}
        style={{ padding: "6px 8px" }}
        onBlur={(e) => {
          const next = e.target.value ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString() : null;
          onChange({ bool_value: true, expires_at: next });
        }}
      />
    );
  }

  return null;
}

/** Forces the number/date input to remount (picking up defaultValue) after a save round-trips. */
function overrideKey(override) {
  return override?.updated_at ?? "new";
}
