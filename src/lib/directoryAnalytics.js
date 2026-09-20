/** Per-directory GA4 / GTM destination helpers. */

export const GA4_MEASUREMENT_ID = /^G-[A-Z0-9]+$/;
export const GTM_CONTAINER_ID = /^GTM-[A-Z0-9]+$/;

export function emptyAnalyticsForm() {
  return {
    ga4Enabled: false,
    ga4MeasurementId: "",
    gtmEnabled: false,
    gtmContainerId: "",
  };
}

export function analyticsFormFromJson(raw) {
  const form = emptyAnalyticsForm();
  const destinations = Array.isArray(raw?.destinations) ? raw.destinations : [];
  for (const d of destinations) {
    if (!d || typeof d !== "object") continue;
    if (d.provider === "ga4") {
      form.ga4Enabled = !!d.enabled;
      form.ga4MeasurementId = String(d.measurement_id || "").trim();
    }
    if (d.provider === "gtm") {
      form.gtmEnabled = !!d.enabled;
      form.gtmContainerId = String(d.container_id || "").trim();
    }
  }
  return form;
}

/**
 * @returns {{ ok: true, json: object } | { ok: false, error: string }}
 */
export function analyticsJsonFromForm(form) {
  const destinations = [];
  const ga4Id = String(form.ga4MeasurementId || "").trim().toUpperCase();
  const gtmId = String(form.gtmContainerId || "").trim().toUpperCase();
  const ga4Enabled = !!form.ga4Enabled;
  const gtmEnabled = !!form.gtmEnabled;

  if (ga4Enabled || ga4Id) {
    if (!ga4Id) return { ok: false, error: "Enter a Google Analytics 4 Measurement ID (G-XXXXXXXXXX)." };
    if (!GA4_MEASUREMENT_ID.test(ga4Id)) {
      return { ok: false, error: "GA4 Measurement ID must look like G-XXXXXXXXXX." };
    }
    destinations.push({ provider: "ga4", enabled: ga4Enabled, measurement_id: ga4Id });
  }
  if (gtmEnabled || gtmId) {
    if (!gtmId) return { ok: false, error: "Enter a Google Tag Manager Container ID (GTM-XXXXXXX)." };
    if (!GTM_CONTAINER_ID.test(gtmId)) {
      return { ok: false, error: "GTM Container ID must look like GTM-XXXXXXX." };
    }
    destinations.push({ provider: "gtm", enabled: gtmEnabled, container_id: gtmId });
  }

  if (!destinations.length) return { ok: true, json: null };
  return { ok: true, json: { destinations } };
}

export function analyticsJsonEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
