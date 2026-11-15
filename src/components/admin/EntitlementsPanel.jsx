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
import { Button, Callout, Checkbox, DataTable, EmptyState, Field, Pill, Select, Skeleton, TextInput } from "../ui/index.js";
import "../../styles/wave-c/clients.css";

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

  if (loading) return <Skeleton variant="form" label="Loading entitlements" />;

  const columns = [
    {
      key: "name",
      label: "Feature",
      render: (f) => (
        <>
          <strong>{f.name}</strong>
          <span className="wc-cell-sub">
            {f.product_key}.{f.key}
          </span>
        </>
      ),
    },
    { key: "entitlement_type", label: "Type" },
    {
      key: "override",
      label: "Override",
      render: (f) => (
        <FeatureOverrideInput
          feature={f}
          override={overrideFor(f.id)}
          disabled={savingFeatureId === f.id}
          onChange={(patch) => handleOverrideChange(f, patch)}
        />
      ),
    },
    {
      key: "clear",
      label: "Clear",
      render: (f) =>
        overrideFor(f.id) ? (
          <Button size="sm" disabled={savingFeatureId === f.id} onClick={() => handleClearOverride(f)}>
            Clear
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="wc-stack">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <div className="wc-block">
        <h3 className="wc-subhead">Plan</h3>
        <p className="wc-muted">Sets this customer&apos;s commercial tier. Saved immediately.</p>
        <div className="wc-inline">
          <Field label="Plan" className="wc-field-auto">
            <Select value={planKey} disabled={savingPlan} onChange={(e) => handlePlanChange(e.target.value)}>
              {plans.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {selectedPlan?.is_founder_tier ? (
            <Pill tone="ok">Founder Members: all entitlements unlimited</Pill>
          ) : null}
        </div>
      </div>

      <div className="wc-block">
        <h3 className="wc-subhead">Per-feature overrides</h3>
        <p className="wc-muted">
          Grant or restrict a specific feature for this customer, overriding their plan default.
        </p>
        <DataTable
          caption="Per-feature overrides"
          columns={columns}
          rows={features}
          getRowLabel={(f) => f.name}
          empty={<EmptyState art="none" title="No entitlements in the catalog yet" />}
        />
      </div>
    </div>
  );
}

function FeatureOverrideInput({ feature, override, disabled, onChange }) {
  if (feature.entitlement_type === ENTITLEMENT_TYPES.BOOLEAN) {
    return (
      <Checkbox
        label="Enabled"
        checked={override?.bool_value === true}
        disabled={disabled}
        onChange={(e) => onChange({ bool_value: e.target.checked })}
      />
    );
  }

  if (
    feature.entitlement_type === ENTITLEMENT_TYPES.VOLUME ||
    feature.entitlement_type === ENTITLEMENT_TYPES.METERED
  ) {
    const field = feature.entitlement_type === ENTITLEMENT_TYPES.VOLUME ? "limit_value" : "included_allowance";
    const value = override?.[field] ?? "";
    return (
      <TextInput
        key={overrideKey(override)}
        type="number"
        min={0}
        aria-label={`${feature.name} override`}
        placeholder="Unlimited"
        defaultValue={value}
        disabled={disabled}
        className="wc-input-narrow"
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
      <TextInput
        key={overrideKey(override)}
        type="date"
        aria-label={`${feature.name} expiry date`}
        defaultValue={value}
        disabled={disabled}
        className="wc-input-auto"
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
