import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { fetchClientEntitlements } from "../../lib/entitlements.js";
import { getLimitReachedMessage } from "../../lib/entitlementMessages.js";
import EntitlementUsageHint from "../../components/EntitlementUsageHint.jsx";
import { Button, Callout, Checkbox, Field, FieldGrid, Section, SettingsLayout, TextInput } from "../../components/ui/index.js";
import "../../styles/wave-b/map-pages.css";

function slugify(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminMapNew() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const [defaultLat, setDefaultLat] = useState("51.5072");
  const [defaultLng, setDefaultLng] = useState("-0.1276");
  const [defaultZoom, setDefaultZoom] = useState("4");

  const [locationQuery, setLocationQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const [showListPanel, setShowListPanel] = useState(true);
  const [enableClustering, setEnableClustering] = useState(true);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [mapCount, setMapCount] = useState(null);
  const [maxMapsLimit, setMaxMapsLimit] = useState(null);
  const [entitlementLoading, setEntitlementLoading] = useState(true);

  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const finalSlug = (slug || suggestedSlug).trim();

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id,name,slug")
        .eq("id", clientId)
        .single();

      if (!error) setClient(data);
    })();
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const [{ count }, entitlements] = await Promise.all([
        supabase.from("maps").select("id", { count: "exact", head: true }).eq("client_id", clientId),
        fetchClientEntitlements(clientId).catch(() => ({})),
      ]);
      setMapCount(count ?? 0);
      setMaxMapsLimit(entitlements?.max_maps?.limit ?? null);
      setEntitlementLoading(false);
    })();
  }, [clientId]);

  const atMapLimit =
    !entitlementLoading && maxMapsLimit != null && mapCount != null && mapCount >= maxMapsLimit;

  async function lookupLocation(e) {
    e?.preventDefault?.();
    const q = locationQuery.trim();
    if (!q) return;
    if (!apiKey) {
      setErr("Cannot look up location: missing VITE_GOOGLE_MAPS_API_KEY.");
      return;
    }
    try {
      setGeocoding(true);
      setErr("");
      const url =
        "https://maps.googleapis.com/maps/api/geocode/json?address=" +
        encodeURIComponent(q) +
        "&key=" +
        encodeURIComponent(apiKey);
      const res = await fetch(url);
      const json = await res.json();
      if (json.status !== "OK" || !json.results?.length) {
        throw new Error(`No results for "${q}" (status: ${json.status || "ERROR"})`);
      }
      const loc = json.results[0].geometry.location;
      setDefaultLat(String(loc.lat));
      setDefaultLng(String(loc.lng));
      const approxType = json.results[0].types?.[0] || "";
      const zoomGuess =
        approxType.includes("country") || approxType.includes("continent")
          ? 5
          : approxType.includes("administrative_area_level_1") ||
            approxType.includes("administrative_area_level_2")
          ? 7
          : 10;
      setDefaultZoom(String(zoomGuess));
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setGeocoding(false);
    }
  }

  async function createMap(e) {
    e.preventDefault();
    setErr("");

    const cleanName = name.trim();
    if (!cleanName) return setErr("Map name is required.");
    if (!finalSlug) return setErr("Map slug is required.");
    if (atMapLimit) return setErr(getLimitReachedMessage("max_maps", mapCount, maxMapsLimit));

    const lat = Number(defaultLat);
    const lng = Number(defaultLng);
    const zoom = Number(defaultZoom);

    if (Number.isNaN(lat) || Number.isNaN(lng)) return setErr("Default lat/lng must be numbers.");
    if (!Number.isInteger(zoom) || zoom < 1 || zoom > 20) return setErr("Zoom must be an integer between 1 and 20.");

    try {
      setSaving(true);

      const mapId = crypto.randomUUID();
      const { error } = await supabase.from("maps").insert({
        id: mapId,
        client_id: clientId,
        name: cleanName,
        slug: finalSlug,
        default_lat: lat,
        default_lng: lng,
        default_zoom: zoom,
        show_list_panel: showListPanel,
        enable_clustering: enableClustering,
      });

      if (error) throw error;

      recordAdminEvent(supabase, {
        eventType: "map_design_created",
        clientId,
        mapId,
        meta: {
          client_id: clientId,
          map_id: mapId,
          name: cleanName,
          slug: finalSlug,
          default_center: { lat, lng },
          default_zoom: zoom,
          enable_clustering: enableClustering,
          show_list_panel: showListPanel,
          source: "admin_dashboard",
        },
      });

      // back to client detail (maps list)
      navigate(`/admin/clients/${encodeURIComponent(clientId)}`);
    } catch (e2) {
      // If you hit slug uniqueness constraint, Supabase will return an error message here
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <SettingsLayout
        className="mp-form"
        head={{
          title: "New map",
          breadcrumb: [
            { label: "Customers", to: "/admin/clients" },
            { label: client?.name ?? "…", to: `/admin/clients/${encodeURIComponent(clientId)}` },
            { label: "New map" },
          ],
        }}
      >
        <EntitlementUsageHint featureKey="max_maps" used={mapCount} limit={maxMapsLimit} atLimit={atMapLimit} />

        <form onSubmit={createMap}>
          <Section
            footer={
              <div className="mp-row">
                <Button variant="primary" type="submit" loading={saving} loadingLabel="Creating…" disabled={atMapLimit}>
                  Create map
                </Button>
                <Button as={Link} to={`/admin/clients/${encodeURIComponent(clientId)}`}>Cancel</Button>
              </div>
            }
          >
            <div className="mp-stack">
              <FieldGrid>
                <Field label="Map name">
                  <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UK Directory" />
                </Field>
                <Field
                  label="Web address (short name)"
                  hint={<>This becomes part of the map URL. Suggested: <strong>{suggestedSlug || "—"}</strong></>}
                >
                  <TextInput
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder={suggestedSlug || "e.g. uk-directory"}
                  />
                </Field>
              </FieldGrid>

              <div className="mp-stack mp-stack--tight">
                <h2 className="mp-subhead">Where do you want to centre your map?</h2>
                <p className="mp-note">
                  Search for a city or country and we’ll set the map centre and an appropriate zoom level.
                </p>
              </div>

              <div className="mp-inline-form">
                <Field label="Search for a place">
                  <TextInput
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    placeholder="e.g. London, UK or Canada"
                  />
                </Field>
                <Button onClick={lookupLocation} loading={geocoding} loadingLabel="Searching…">Search</Button>
              </div>

              <div className="mp-stack mp-stack--tight">
                <h3 className="mp-subhead">Fine-tune the start view (optional)</h3>
                <div className="mp-grid-3">
                  <Field label="Latitude">
                    <TextInput value={defaultLat} onChange={(e) => setDefaultLat(e.target.value)} />
                  </Field>
                  <Field label="Longitude">
                    <TextInput value={defaultLng} onChange={(e) => setDefaultLng(e.target.value)} />
                  </Field>
                  <Field label="Zoom" hint="4–6: continent / global, 7–10: country / region, 11+ closer in.">
                    <TextInput value={defaultZoom} onChange={(e) => setDefaultZoom(e.target.value)} />
                  </Field>
                </div>
              </div>

              <div className="mp-choice-row">
                <Checkbox label="Show list panel" checked={showListPanel} onChange={(e) => setShowListPanel(e.target.checked)} />
                <Checkbox label="Enable clustering" checked={enableClustering} onChange={(e) => setEnableClustering(e.target.checked)} />
              </div>

              {err ? <Callout tone="danger">{err}</Callout> : null}
            </div>
          </Section>
        </form>
      </SettingsLayout>
    </AdminLayout>
  );
}
