import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMapDraft } from "../../context/MapDraftContext.js";
import { supabase } from "../../lib/supabase";
import { getClientIdForCurrentUser } from "../../lib/clientAuth";
import { useAuth } from "../../hooks/useAuth.js";
import PublishedMapView from "../../components/PublishedMapView.jsx";
import { normalizePinSize } from "../../lib/markerIcons";
import { sanitizeSvgFile } from "../../lib/sanitizeSvg.js";
import {
  buildPublicationConfig,
  normalizePublicationConfig,
  publicationConfigsEqual,
  triggerSnapshotRegeneration,
  triggerDirectoryPagesRegeneration,
} from "../../lib/mapPublication.js";
import FilterFieldsPanel from "../../components/FilterFieldsPanel.jsx";
import EntityMessagingSettings from "../../components/EntityMessagingSettings.jsx";
import { loadFilterFields, loadFilterValuesForMap, filterFieldsForPublication, resolveColorForListing, setMapColorFilterFieldId } from "../../lib/filterFields.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { hasSubscriptionAccess } from "../../lib/subscriptionAccess.js";
import { formatContactMessageError, submitContactMessage } from "../../lib/contactMessage.js";
import {
  buildMapStyles,
  DEFAULT_MAP_STYLE_SETTINGS,
  normalizeMapStyleSettings,
} from "../../lib/mapStyleSettings.js";
import { ErrorState, Skeleton, useConfirm } from "../../components/ui";
import {
  MapDesignPanel, MapGeneralPanel, MapGroupDesignEditor, MapGroupsPanel, MapListingLogoPanel, MapMessageDrawer, MapOverlayPanel,
  MapPanelsPanel, MapPublishPage, MapSearchPanel, MapSettingsStrip, MapStylePanel,
  PAGE_SIZE, MAP_STYLE_PRESET_SETTINGS, groupOverridesFromGroups, listingsWithGroupColours, buildEditTheme, defaultPresetIdFromMapTypeId, buildEmbedIframe, buildEmbedThumbnail,
} from "../../components/mapDashboard";
import "../admin/admin.css";

// Map design/publish page for client managers. Presentation lives in src/components/mapDashboard (shared with the admin
// page); this file keeps the data loading, draft auto-save, publish and group logic.
// Hex values below (#4A9BAA, #ffffff, ...) are default map theme DATA stored in theme_json, not styling.

export default function ClientMapDashboard() {
  const { mapId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const confirm = useConfirm();
  const { setHasDraft, publishPanelOpen, setPublishPanelOpen, openPublishRef, closePublishRef } =
    useMapDraft();
  const isPublishOpen = publishPanelOpen;

  const [client, setClient] = useState(null);
  const [messagingTestMode, setMessagingTestMode] = useState(true); // safe default
  const [messagingTestRecipient, setMessagingTestRecipient] = useState("");
  const [map, setMap] = useState(null);
  const [listings, setListings] = useState([]);
  const [groups, setGroups] = useState([]);
  /** DIR-E4: true when this map's pins/groups come from a linked directory instead of its own listings/groups. */
  const [isDirectorySourced, setIsDirectorySourced] = useState(false);
  const [filterFields, setFilterFields] = useState([]);
  const [filterValuesByListing, setFilterValuesByListing] = useState({});

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const customPinTileInputRef = useRef(null);
  const groupCustomPinTileInputRef = useRef(null);

  const [overlayTab, setOverlayTab] = useState(null);
  const [dataSearch, setDataSearch] = useState("");
  const [dataPage, setDataPage] = useState(0);

  // form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [defaultLat, setDefaultLat] = useState("");
  const [defaultLng, setDefaultLng] = useState("");
  const [defaultZoom, setDefaultZoom] = useState("");
  const [showListPanel, setShowListPanel] = useState(true);
  const [showMapTitle, setShowMapTitle] = useState(false);
  const [showSearch, setShowSearch] = useState(true);
  const [showGroupDropdowns, setShowGroupDropdowns] = useState(true);
  const [enableClustering, setEnableClustering] = useState(true);
  const [clusterRadius, setClusterRadius] = useState(80);
  const [markerStyle, setMarkerStyle] = useState("pin");
  const [pinSize, setPinSize] = useState("medium");
  const [markerColor, setMarkerColor] = useState("#4A9BAA");
  const [customPinUrl, setCustomPinUrl] = useState("");
  const [clusterColor, setClusterColor] = useState("#4A9BAA");
  const [clusterOpacity, setClusterOpacity] = useState(100);
  const [pinBorderColor, setPinBorderColor] = useState("#ffffff");
  const [pinBorderSize, setPinBorderSize] = useState(0);
  const [pinDropShadow, setPinDropShadow] = useState(0);
  const [pinShadowDistance, setPinShadowDistance] = useState(20);
  const [pinShadowOpacity, setPinShadowOpacity] = useState(100);
  const [pinFaviconUrl, setPinFaviconUrl] = useState("");
  const [buttonColor, setButtonColor] = useState("#4A9BAA");
  const [panelBackgroundColor, setPanelBackgroundColor] = useState("#ffffff");
  const [panelBackgroundOpacity, setPanelBackgroundOpacity] = useState(0.88);
  const [panelBorderRadius, setPanelBorderRadius] = useState(12);
  const [pinDetailLayout, setPinDetailLayout] = useState("map");
  const [panelLinkColor, setPanelLinkColor] = useState("#4A9BAA");

  // Search panel settings (Search tab) + map description (General tab)
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [searchPanelBgColor, setSearchPanelBgColor] = useState("#ffffff");
  const [searchPanelBgOpacity, setSearchPanelBgOpacity] = useState(0.92);
  const [searchPanelTextColor, setSearchPanelTextColor] = useState("#111827");
  const [listingBgColor, setListingBgColor] = useState("#ffffff");
  const [listingBorderColor, setListingBorderColor] = useState("#e5e7eb");
  const [listingOpacity, setListingOpacity] = useState(1);
  const [showContinentFilter, setShowContinentFilter] = useState(false);
  const [showKey, setShowKey] = useState(true);
  const [showLogo, setShowLogo] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [showListings, setShowListings] = useState(true);

  const [centerLabel, setCenterLabel] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const [customPinUploading, setCustomPinUploading] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [selectedMarkerPoint, setSelectedMarkerPoint] = useState(null);
  const [clampedPanelPosition, setClampedPanelPosition] = useState(null);
  const [centerOnListingId, setCenterOnListingId] = useState(null);
  const pinOverlayRef = useRef(null);
  const [publishedSnapshot, setPublishedSnapshot] = useState(null);
  const [publicationHistory, setPublicationHistory] = useState([]);
  const [publishNote, setPublishNote] = useState("");
  const [publishedAt, setPublishedAt] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [mapTypeId, setMapTypeId] = useState("roadmap");
  const [mapStyleSettings, setMapStyleSettings] = useState(DEFAULT_MAP_STYLE_SETTINGS);
  const [selectedMapStylePreset, setSelectedMapStylePreset] = useState(null);
  const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
  const mapOptionsRef = useRef(null);

  const [reorderedGroupIds, setReorderedGroupIds] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupEditDesign, setGroupEditDesign] = useState(null);
  const [groupCustomPinUploading, setGroupCustomPinUploading] = useState(false);
  const [savingGroups, setSavingGroups] = useState(false);
  const groupDraftTimerRef = useRef(null);
  const groupDraftPrimedRef = useRef(false);

  const [messageDrawerOpen, setMessageDrawerOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    testToEmail: "",
  });
  const [contactFormSubmitting, setContactFormSubmitting] = useState(false);
  const [contactFormSent, setContactFormSent] = useState(false);
  const [contactFormError, setContactFormError] = useState("");

  // Draft auto-save for design/panels fields
  const isLoadedRef = useRef(false);
  const draftTimerRef = useRef(null);
  const saveDraftThemeRef = useRef(null);
  const [draftStatus, setDraftStatus] = useState(""); // "" | "saving" | "saved"

  // Draft auto-save for general fields
  const draftGeneralTimerRef = useRef(null);
  const saveDraftGeneralRef = useRef(null);
  const [draftGeneralStatus, setDraftGeneralStatus] = useState("");

  const hasActiveSubscription = hasSubscriptionAccess({ client, userEmail: user?.email });

  const embedSrc = useMemo(() => {
    const clientSlug = client?.slug;
    const mapSlug = map?.slug;
    if (clientSlug && mapSlug) {
      return `${window.location.origin}/${clientSlug}/${mapSlug}`;
    }
    return `${window.location.origin}/embed?map=${encodeURIComponent(mapId)}`;
  }, [mapId, client?.slug, map?.slug]);

  const [embedWidth, setEmbedWidth] = useState("100");
  const [embedWidthUnit, setEmbedWidthUnit] = useState("%");
  const [embedHeight, setEmbedHeight] = useState("800");

  const embedIframe = useMemo(
    () => buildEmbedIframe({ embedSrc, embedWidth, embedWidthUnit, embedHeight, mapId }),
    [embedSrc, embedWidth, embedWidthUnit, embedHeight, mapId],
  );

  const [thumbSize, setThumbSize] = useState("medium");

  const embedThumbnail = useMemo(
    () => buildEmbedThumbnail({ embedSrc, mapId, thumbSize }),
    [embedSrc, mapId, thumbSize],
  );

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  // isProductionEnv kept for reference; contact form test mode is now driven by client.email_test_mode
  const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT || "preview";
  const isProductionEnv = ENVIRONMENT === "production";
  // messagingTestMode / messagingTestRecipient are kept in dedicated state
  // and fetched separately so they stay current even if the user changed
  // the setting in the Messaging tab without remounting this page.
  const mapCenter = useMemo(() => {
    const lat = Number(defaultLat);
    const lng = Number(defaultLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return { lat: 51.5074, lng: -0.1278 };
    return { lat, lng };
  }, [defaultLat, defaultLng]);
  const liveMapStyles = useMemo(() => {
    return buildMapStyles(
      mapStyleSettings.colors.land,
      mapStyleSettings.colors.water,
      mapStyleSettings.colors.roads,
      mapStyleSettings.detail,
      mapStyleSettings.overlays
    );
  }, [mapStyleSettings]);

  function updateMapStyleSettings(updater) {
    setSelectedMapStylePreset(null);
    setMapStyleSettings((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return normalizeMapStyleSettings(next);
    });
  }

  function applyMapStylePreset(presetId) {
    const preset = MAP_STYLE_PRESET_SETTINGS[presetId];
    if (!preset) return;
    setSelectedMapStylePreset(presetId);
    setMapTypeId(presetId);
    setMapStyleSettings(normalizeMapStyleSettings(preset));
  }

  const groupOverridesById = useMemo(() => groupOverridesFromGroups(groups), [groups]);

  const globalDesignForGroup = useMemo(
    () => ({
      marker_style: markerStyle,
      marker_color: markerColor,
      pinBorderColor,
      pinBorderSize,
      pinDropShadow,
      pinShadowDistance,
      pinShadowOpacity,
      clusterColor,
      custom_pin_url: customPinUrl || null,
      pin_favicon_url: (pinFaviconUrl || "").trim() || null,
      pinSize: normalizePinSize(pinSize),
    }),
    [markerStyle, markerColor, pinBorderColor, pinBorderSize, pinDropShadow, pinShadowDistance, pinShadowOpacity, clusterColor, customPinUrl, pinFaviconUrl, pinSize],
  );

  const listingsWithColor = useMemo(
    () => listingsWithGroupColours({ listings, groupOverridesById, editingGroupId, groupEditDesign, globalDesignForGroup }),
    [listings, groupOverridesById, editingGroupId, groupEditDesign, globalDesignForGroup],
  );

  const refreshFilterFields = React.useCallback(async () => {
    if (!mapId) return;
    try {
      const [fields, values] = await Promise.all([
        loadFilterFields(mapId, { includeArchived: true }),
        loadFilterValuesForMap(mapId),
      ]);
      setFilterFields(fields);
      setFilterValuesByListing(values);
    } catch (e) {
      console.warn("filter fields load:", e?.message ?? e);
    }
  }, [mapId]);

  useEffect(() => { void refreshFilterFields(); }, [refreshFilterFields]);

  const recordFilterEvent = React.useCallback((eventType, meta) => {
    recordAdminEvent(supabase, { eventType, meta, source: "client_portal", clientId: client?.id ?? null, mapId });
  }, [client?.id, mapId]);

  const publishedFilterFields = useMemo(() => filterFieldsForPublication(filterFields), [filterFields]);

  const colorFilterFieldId = map?.color_filter_field_id || null;

  const previewListings = useMemo(
    () =>
      listingsWithColor.map((l) => {
        const values = filterValuesByListing[l.id] || [];
        const categoryColor = resolveColorForListing({ colorFieldId: colorFilterFieldId, fields: publishedFilterFields, values });
        return {
          ...l,
          filterValues: values,
          ...(colorFilterFieldId ? { group_color: categoryColor } : {}),
        };
      }),
    [listingsWithColor, filterValuesByListing, colorFilterFieldId, publishedFilterFields]
  );

  const updateColorFilterField = React.useCallback(async (fieldId) => {
    try {
      await setMapColorFilterFieldId(mapId, fieldId);
      setMap((prev) => (prev ? { ...prev, color_filter_field_id: fieldId || null } : prev));
      recordFilterEvent("map_design_color_field_changed", { field_id: fieldId || null });
    } catch (e) {
      setErr(e?.message || "Failed to update pin colour source");
    }
  }, [mapId, recordFilterEvent]);

  const groupNameById = useMemo(() => {
    const m = new Map();
    (groups || []).forEach((g) => m.set(g.id, g.name || "—"));
    return m;
  }, [groups]);
  const filteredListings = useMemo(
    () =>
      (listings || []).filter((l) =>
        !dataSearch.trim() ||
        l.name?.toLowerCase().includes(dataSearch.toLowerCase()) ||
        l.address?.toLowerCase().includes(dataSearch.toLowerCase())
      ),
    [listings, dataSearch]
  );
  const totalPages = Math.ceil(filteredListings.length / PAGE_SIZE);
  const pageListings = useMemo(
    () => filteredListings.slice(dataPage * PAGE_SIZE, (dataPage + 1) * PAGE_SIZE),
    [filteredListings, dataPage]
  );
  const totalFilteredListings = filteredListings.length;

  useEffect(() => {
    const maxPage = totalPages > 0 ? totalPages - 1 : 0;
    if (dataPage > maxPage) {
      setDataPage(maxPage);
    }
  }, [dataPage, totalPages]);

  async function updateListingLogoBg(listingId, newValue) {
    if (isDirectorySourced) {
      setErr("This map's entries are managed in its linked directory — edit the logo there.");
      return;
    }
    const normalizedValue = newValue || null;
    const { error } = await supabase.from("listings").update({ logo_bg: normalizedValue }).eq("id", listingId);
    if (error) {
      setErr(error.message || "Failed to update logo background.");
      return;
    }
    setListings((prev) => prev.map((l) => (l.id === listingId ? { ...l, logo_bg: normalizedValue } : l)));
  }

  const orderedGroupsList = useMemo(() => {
    const list = groups || [];
    if (reorderedGroupIds && reorderedGroupIds.length === list.length) {
      const byId = new Map(list.map((g) => [g.id, g]));
      return reorderedGroupIds.map((id) => byId.get(id)).filter(Boolean);
    }
    return list;
  }, [groups, reorderedGroupIds]);

  const draftPublicationConfig = useMemo(
    () =>
      buildPublicationConfig({
        groups: orderedGroupsList,
        defaultLat,
        defaultLng,
        defaultZoom,
        showListPanel,
        enableClustering,
        clusterRadius,
        markerStyle,
        markerColor,
        customPinUrl,
        clusterColor,
        clusterOpacity: clusterOpacity / 100,
        pinBorderColor,
        pinBorderSize,
        pinDropShadow,
        pinFaviconUrl,
        buttonColor,
        panelBackgroundColor,
        panelBackgroundOpacity,
        panelBorderRadius,
        pinDetailLayout,
        panelLinkColor,
        pinSize,
        showSearch,
        showGroupDropdowns,
        showMapTitle,
        mapThemeJsonBase: map?.theme_json,
        mapTypeId,
        mapStyleSettings,
        mapName: map?.name ?? null,
        logoUrl,
        description,
        searchPanelBgColor,
        searchPanelBgOpacity,
        searchPanelTextColor,
        listingBgColor,
        listingBorderColor,
        listingOpacity,
        showContinentFilter,
        showKey,
        showLogo,
        showTitle,
        showListings,
        filterFields: publishedFilterFields,
        colorFilterFieldId,
      }),
    [
      publishedFilterFields,
      colorFilterFieldId,
      orderedGroupsList,
      defaultLat,
      defaultLng,
      defaultZoom,
      showListPanel,
      enableClustering,
      clusterRadius,
      markerStyle,
      markerColor,
      customPinUrl,
      clusterColor,
      clusterOpacity,
      pinBorderColor,
      pinBorderSize,
      pinDropShadow,
      pinFaviconUrl,
      buttonColor,
      panelBackgroundColor,
      panelBackgroundOpacity,
      panelBorderRadius,
      pinDetailLayout,
      panelLinkColor,
      pinSize,
      showSearch,
      showGroupDropdowns,
      showMapTitle,
      mapTypeId,
      mapStyleSettings,
      map?.theme_json,
      map?.name,
      logoUrl,
      description,
      searchPanelBgColor,
      searchPanelBgOpacity,
      searchPanelTextColor,
      listingBgColor,
      listingBorderColor,
      listingOpacity,
      showContinentFilter,
      showKey,
      showLogo,
      showTitle,
      showListings,
    ],
  );

  const hasUnpublishedChanges = useMemo(() => {
    const draft = draftPublicationConfig;
    const pub = publishedSnapshot;
    if (!pub) return true;
    return !publicationConfigsEqual(draft, pub);
  }, [draftPublicationConfig, publishedSnapshot]);

  useEffect(() => { setHasDraft(hasUnpublishedChanges); }, [hasUnpublishedChanges, setHasDraft]);
  useEffect(() => () => setHasDraft(false), [setHasDraft]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const isSameMapReload = map?.id === mapId;
        if (!isSameMapReload) setLoading(true);
        setErr("");
        setMsg("");

        const currentClientId = await getClientIdForCurrentUser();
        if (!currentClientId) {
          setErr("No client account linked. Use the client dashboard first.");
          setLoading(false);
          return;
        }

        let m = null;
        let [{ data: c, error: ce }, { data: g, error: ge }, listingsRes] = await Promise.all([
          supabase
            .from("clients")
            .select("id,name,slug,subscription_active_override,email_test_mode,email_test_recipient")
            .eq("id", currentClientId)
            .single(),
          supabase
            .from("groups")
            .select("id,name,sort_order,color,theme_json")
            .eq("map_id", mapId)
            .order("sort_order", { ascending: true }),
          supabase
            .from("listings")
            .select("id,name,lat,lng,group_id,is_active,logo_url,website_url,email,phone,address,country,notes_html,allow_html,logo_bg")
            .eq("map_id", mapId),
        ]);
        let l = listingsRes.data;
        let le = listingsRes.error;
        if (le && String(le.message || "").includes("logo_bg")) {
          const fallback = await supabase
            .from("listings")
            .select("id,name,lat,lng,group_id,is_active,logo_url,website_url,email,phone,address,country,notes_html,allow_html")
            .eq("map_id", mapId);
          l = (fallback.data || []).map((row) => ({ ...row, logo_bg: null }));
          le = fallback.error;
        }
        if (ce) throw ce;
        if (ge) throw ge;
        if (le) throw le;

        // DIR-E4: if this map reads its pins live from a directory, the
        // design preview needs to show that data too — same normalization
        // as EmbedMap.jsx (directory_group_id -> group_id, no per-group
        // theme_json since directory_groups has no such column).
        const { data: mapAssoc } = await supabase
          .from("directory_map_associations")
          .select("directory_id")
          .eq("map_id", mapId)
          .maybeSingle();
        const directorySourced = !!mapAssoc?.directory_id;
        if (directorySourced) {
          const [{ data: entries, error: eErr }, { data: dGroups, error: dgErr }] = await Promise.all([
            supabase.from("public_directory_entries").select("*").eq("directory_id", mapAssoc.directory_id),
            supabase
              .from("directory_groups")
              .select("id,directory_id,name,sort_order,color")
              .eq("directory_id", mapAssoc.directory_id)
              .order("sort_order", { ascending: true }),
          ]);
          if (eErr) throw eErr;
          if (dgErr) throw dgErr;
          l = (entries ?? []).map((e) => ({ ...e, group_id: e.directory_group_id ?? null }));
          g = (dGroups ?? []).map((gr) => ({ ...gr, theme_json: null }));
        }

        const { data: mapRow, error: me } = await supabase
          .from("maps")
          .select(
            "id,client_id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering,cluster_radius,marker_style,marker_color,theme_json,custom_pin_url,published_config,published_at,current_publication_id,color_filter_field_id",
          )
          .eq("id", mapId)
          .eq("client_id", currentClientId)
          .single();

        const msg = String(me?.message || "");
        if (
          me &&
          (msg.includes("cluster_radius") ||
            msg.includes("custom_pin_url") ||
            msg.includes("published_") ||
            msg.includes("current_publication") ||
            msg.includes("color_filter_field_id"))
        ) {
          const { data: mapRowFallback, error: me2 } = await supabase
            .from("maps")
            .select(
              "id,client_id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering,marker_style,marker_color,theme_json",
            )
            .eq("id", mapId)
            .eq("client_id", currentClientId)
            .single();
          if (me2) throw me2;
          m = mapRowFallback;
        } else {
          if (me) throw me;
          m = mapRow;
        }

        if (!cancelled) {
          setClient(c);
          // Fetch messaging test mode settings fresh from the view so they
          // stay current even if the user changed them in the Messaging tab.
          supabase
            .from("map_messaging_settings")
            .select("email_test_mode,email_test_recipient")
            .eq("map_id", mapId)
            .single()
            .then(({ data: ms }) => {
              if (ms && !cancelled) {
                setMessagingTestMode(ms.email_test_mode !== false);
                setMessagingTestRecipient(ms.email_test_recipient ?? "");
              }
            });
          setMap(m);
          setGroups(g ?? []);
          setListings(l ?? []);
          setIsDirectorySourced(directorySourced);

          setName(m.name ?? "");
          setSlug(m.slug ?? "");
          setDefaultLat(String(m.default_lat ?? ""));
          setDefaultLng(String(m.default_lng ?? ""));
          setDefaultZoom(String(m.default_zoom ?? ""));
          setShowListPanel(!!m.show_list_panel);
          setEnableClustering(!!m.enable_clustering);
          setClusterRadius(m.cluster_radius ?? 80);
          setMarkerStyle(m.marker_style ?? "pin");
          setMarkerColor(m.marker_color ?? "#4A9BAA");
          setCustomPinUrl(m.custom_pin_url ?? "");
          try {
            const theme = typeof m.theme_json === "string" ? JSON.parse(m.theme_json || "{}") : m.theme_json || {};
            setClusterColor(theme.clusterColor ?? "#4A9BAA");
            setClusterOpacity(Math.round((theme.clusterOpacity ?? 1) * 100));
            setPinBorderColor(theme.pinBorderColor ?? "#ffffff");
            setPinBorderSize(Math.max(0, Math.min(15, Number(theme.pinBorderSize) ?? 0)));
            setPinDropShadow(Math.max(0, Math.min(30, Number(theme.pinDropShadow ?? theme.pinDropShadowPx ?? 0) ?? 0)));
            setPinShadowDistance(Math.max(0, Math.min(30, Number(theme.pinShadowDistance ?? 20))));
            setPinShadowOpacity(Math.max(0, Math.min(100, Number(theme.pinShadowOpacity ?? 100))));
            setPinFaviconUrl(
              String(theme.pin_favicon_url ?? theme.pinFaviconUrl ?? "").trim(),
            );
            setButtonColor(theme.buttonColor ?? "#4A9BAA");
            setPanelBackgroundColor(theme.panelBackgroundColor ?? "#ffffff");
            setPanelBackgroundOpacity(theme.panelBackgroundOpacity ?? 0.88);
            setPanelBorderRadius(Math.max(0, Math.min(28, Number(theme.panelBorderRadius) ?? 12)));
            setPinDetailLayout(theme.pinDetailLayout === "drawer" ? "drawer" : "map");
            setPanelLinkColor(theme.panelLinkColor ?? "#4A9BAA");
            setPinSize(normalizePinSize(theme.pinSize));
            setDescription(theme.description ?? "");
            setLogoUrl(theme.logoUrl ?? "");
            setSearchPanelBgColor(theme.searchPanelBgColor ?? "#ffffff");
            setSearchPanelBgOpacity(theme.searchPanelBgOpacity ?? 0.92);
            setSearchPanelTextColor(theme.searchPanelTextColor ?? "#111827");
            setListingBgColor(theme.listingBgColor ?? "#ffffff");
            setListingBorderColor(theme.listingBorderColor ?? "#e5e7eb");
            setListingOpacity(theme.listingOpacity ?? 1);
            setShowContinentFilter(theme.showContinentFilter === true);
            setShowKey(theme.showKey !== false);
            setShowSearch(theme.showSearch !== false);
            setShowGroupDropdowns(theme.showGroupDropdowns !== false);
            setShowMapTitle(!!theme.showMapTitle);
            setShowLogo(theme.showLogo !== false);
            setShowTitle(theme.showTitle !== false);
            setShowListings(theme.showListings !== false);
            setCenterLabel(theme.centerLabel ?? "");
            const loadedMapTypeId = theme.mapTypeId ?? "roadmap";
            const normalizedMapStyleSettings = normalizeMapStyleSettings({
              ...DEFAULT_MAP_STYLE_SETTINGS,
              ...(theme.mapStyleSettings || {}),
              baseType:
                theme.mapStyleSettings?.baseType ??
                (loadedMapTypeId === "satellite" ||
                loadedMapTypeId === "hybrid" ||
                loadedMapTypeId === "terrain"
                  ? loadedMapTypeId
                  : "roadmap"),
            });
            setMapTypeId(loadedMapTypeId);
            setMapStyleSettings(normalizedMapStyleSettings);
            setSelectedMapStylePreset(defaultPresetIdFromMapTypeId(loadedMapTypeId));
          } catch (_) {
            setClusterColor("#4A9BAA");
            setClusterOpacity(100);
            setPinBorderColor("#ffffff");
            setPinBorderSize(0);
            setPinDropShadow(0);
            setPinSize("medium");
            setMapTypeId("roadmap");
            setMapStyleSettings(DEFAULT_MAP_STYLE_SETTINGS);
            setSelectedMapStylePreset("roadmap");
          }
        try {
          let snapshot = null;
          let pubAt = m.published_at ?? null;
          if (m.current_publication_id) {
            const { data: pub, error: pubErr } = await supabase
              .from("map_publications")
              .select("config,published_at")
              .eq("id", m.current_publication_id)
              .single();
            if (!pubErr && pub?.config) {
              snapshot = normalizePublicationConfig(pub.config);
              pubAt = pub.published_at;
            }
          }
          if (!snapshot && m.published_config) {
            const raw = m.published_config;
            let parsed = null;
            if (typeof raw === "string") {
              try {
                parsed = JSON.parse(raw);
              } catch {
                parsed = null;
              }
            } else if (typeof raw === "object") {
              parsed = raw;
            }
            snapshot = normalizePublicationConfig(parsed);
          }
          setPublishedSnapshot(snapshot);
          setPublishedAt(pubAt);
          const { data: hist, error: histErr } = await supabase.rpc("list_map_publications", {
            p_map_id: mapId,
          });
          if (!histErr) setPublicationHistory(hist ?? []);
          else setPublicationHistory([]);
        } catch {
          setPublishedSnapshot(null);
          setPublicationHistory([]);
        }
        }
      } catch (e) {
        if (!cancelled) setErr(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapId]);

  useEffect(() => {
    if (!mapOptionsOpen) return;
    function handleClickOutside(e) {
      if (mapOptionsRef.current && !mapOptionsRef.current.contains(e.target)) setMapOptionsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mapOptionsOpen]);

  // Mark as loaded one tick after loading finishes so initial state-setting doesn't trigger auto-save
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => { isLoadedRef.current = true; }, 0);
      return () => clearTimeout(t);
    }
  }, [loading]);

  // Auto-save design/theme fields to draft whenever they change
  useEffect(() => {
    if (!isLoadedRef.current || !mapId) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraftThemeRef.current?.(), 800);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerStyle, pinSize, markerColor, customPinUrl, clusterColor, clusterOpacity, pinBorderColor, pinBorderSize, pinDropShadow, pinShadowDistance, pinShadowOpacity, pinFaviconUrl, buttonColor, panelBackgroundColor, panelBackgroundOpacity, panelBorderRadius, pinDetailLayout, panelLinkColor, mapTypeId, mapStyleSettings, logoUrl, searchPanelBgColor, searchPanelBgOpacity, searchPanelTextColor, listingBgColor, listingBorderColor, listingOpacity, showContinentFilter, showKey, showLogo, showTitle, showListings]);

  // Auto-save general fields whenever they change
  useEffect(() => {
    if (!isLoadedRef.current || !mapId) return;
    if (draftGeneralTimerRef.current) clearTimeout(draftGeneralTimerRef.current);
    draftGeneralTimerRef.current = setTimeout(() => saveDraftGeneralRef.current?.(), 800);
    return () => { if (draftGeneralTimerRef.current) clearTimeout(draftGeneralTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, slug, description, showListPanel, enableClustering, clusterRadius, centerLabel, defaultLat, defaultLng, defaultZoom]);

  function closePublishPanel() {
    setPublishPanelOpen(false);
  }

  function openPublishPanel() {
    setOverlayTab(null);
    setPublishPanelOpen(true);
  }

  function openOverlay(tab) {
    if (isPublishOpen) closePublishPanel();
    setOverlayTab((current) => (current === tab ? null : tab));
  }

  function closeOverlay() {
    setOverlayTab(null);
  }

  async function copyEmbed() {
    await navigator.clipboard.writeText(embedIframe);
    setMsg("Embed code copied.");
    window.setTimeout(() => setMsg(""), 2000);
  }

  async function copyThumbnailEmbed() {
    await navigator.clipboard.writeText(embedThumbnail);
    setMsg("Thumbnail embed code copied.");
    window.setTimeout(() => setMsg(""), 1600);
  }

  function openEmbed() {
    window.open(embedSrc, "_blank");
  }

  function handleGroupDragStart(e, index) {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  }
  function handleGroupDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function handleGroupDrop(e, dropIndex) {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isNaN(fromIndex) || fromIndex === dropIndex) return;
    const ids = reorderedGroupIds ?? (groups || []).map((g) => g.id);
    const next = [...ids];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, removed);
    setReorderedGroupIds(next);
  }

  async function saveGroupsOrder() {
    const order = reorderedGroupIds ?? (groups || []).map((g) => g.id);
    if (!order.length) return;
    try {
      setSavingGroups(true);
      setErr("");
      for (let i = 0; i < order.length; i++) {
        const { error } = await supabase.from("groups").update({ sort_order: i }).eq("id", order[i]).eq("map_id", mapId);
        if (error) throw error;
      }
      setReorderedGroupIds(null);
      const { data } = await supabase
        .from("groups")
        .select("id,name,sort_order,color,theme_json")
        .eq("map_id", mapId)
        .order("sort_order", { ascending: true });
      if (data) setGroups(data);
      setMsg("Category order saved.");
      window.setTimeout(() => setMsg(""), 2000);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSavingGroups(false);
    }
  }

  function openGroupEdit(gr) {
    groupDraftPrimedRef.current = false;
    setEditingGroupId(gr.id);
    const raw = gr.theme_json;
    if (!raw) {
      setGroupEditDesign(null);
      return;
    }
    const theme =
      typeof raw === "string"
        ? (() => {
            try {
              return JSON.parse(raw || "{}");
            } catch {
              return {};
            }
          })()
        : raw || {};
    setGroupEditDesign({
      marker_style: theme.marker_style ?? theme.markerStyle ?? null,
      marker_color: theme.marker_color ?? theme.markerColor ?? null,
      pinBorderColor: theme.pinBorderColor ?? null,
      pinBorderSize: theme.pinBorderSize != null ? theme.pinBorderSize : null,
      pinDropShadow: theme.pinDropShadow != null ? theme.pinDropShadow : null,
      clusterColor: theme.clusterColor ?? null,
      custom_pin_url: theme.custom_pin_url ?? null,
      pin_favicon_url: theme.pin_favicon_url ?? null,
      pin_favicon_mode: theme.pin_favicon_mode ?? "inherit",
      pinSize: theme.pinSize != null && theme.pinSize !== "" ? normalizePinSize(theme.pinSize) : null,
    });
  }
  function closeGroupEdit() {
    if (groupDraftTimerRef.current) clearTimeout(groupDraftTimerRef.current);
    groupDraftTimerRef.current = null;
    groupDraftPrimedRef.current = false;
    setEditingGroupId(null);
    setGroupEditDesign(null);
  }
  function resetGroupDesign() {
    setGroupEditDesign(null);
  }
  async function saveGroupDesign({ silent = false } = {}) {
    if (!editingGroupId) return;
    try {
      setSavingGroups(true);
      setErr("");
      const raw = groupEditDesign
        ? {
            marker_style: groupEditDesign.marker_style ?? undefined,
            marker_color: groupEditDesign.marker_color ?? undefined,
            pinBorderColor: groupEditDesign.pinBorderColor ?? undefined,
            pinBorderSize: groupEditDesign.pinBorderSize ?? undefined,
            pinDropShadow: groupEditDesign.pinDropShadow ?? undefined,
            clusterColor: groupEditDesign.clusterColor ?? undefined,
            custom_pin_url: groupEditDesign.custom_pin_url ?? undefined,
            pin_favicon_url: groupEditDesign.pin_favicon_url ?? undefined,
            pin_favicon_mode: groupEditDesign.pin_favicon_mode ?? undefined,
            pinSize: groupEditDesign.pinSize != null ? normalizePinSize(groupEditDesign.pinSize) : undefined,
          }
        : null;
      const theme_json = raw ? Object.fromEntries(Object.entries(raw).filter(([, v]) => v != null)) : null;
      const final = theme_json && Object.keys(theme_json).length ? theme_json : null;
      const markerColorOverride = groupEditDesign?.marker_color ?? null;
      const { error } = await supabase
        .from("groups")
        .update({
          theme_json: final,
          ...(markerColorOverride ? { color: markerColorOverride } : {}),
        })
        .eq("id", editingGroupId)
        .eq("map_id", mapId);
      if (error) {
        if (String(error.message || "").includes("theme_json")) {
          setErr("Category design overrides need the theme_json column on groups. Run migration 20260314100000_add_groups_theme_json.sql");
          setSavingGroups(false);
          return;
        }
        throw error;
      }
      setGroups((prev) =>
        (prev || []).map((g) =>
          g.id === editingGroupId
            ? {
                ...g,
                theme_json: final,
                ...(markerColorOverride ? { color: markerColorOverride } : {}),
              }
            : g,
        ),
      );
      if (!silent) {
        setMsg("Category design saved.");
        window.setTimeout(() => setMsg(""), 2000);
      }
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSavingGroups(false);
    }
  }

  useEffect(() => {
    if (!editingGroupId) return;
    if (!groupDraftPrimedRef.current) {
      groupDraftPrimedRef.current = true;
      return;
    }
    if (groupDraftTimerRef.current) clearTimeout(groupDraftTimerRef.current);
    groupDraftTimerRef.current = setTimeout(() => {
      saveGroupDesign({ silent: true });
    }, 700);
    return () => {
      if (groupDraftTimerRef.current) clearTimeout(groupDraftTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingGroupId, groupEditDesign]);

  async function saveMap(e) {
    e?.preventDefault?.();
    setErr("");
    setMsg("");

    const cleanName = name.trim();
    if (!cleanName) return setErr("Map name is required.");
    if (!slug.trim()) return setErr("Map slug is required.");

    const lat = Number(defaultLat);
    const lng = Number(defaultLng);
    const zoom = Number(defaultZoom);

    if (Number.isNaN(lat) || Number.isNaN(lng)) return setErr("Default lat/lng must be numbers.");
    if (!Number.isInteger(zoom) || zoom < 1 || zoom > 20) return setErr("Zoom must be an integer between 1 and 20.");

    try {
      setSaving(true);

      const existingTheme =
        !map?.theme_json
          ? {}
          : typeof map.theme_json === "string"
          ? (() => {
              try {
                return JSON.parse(map.theme_json);
              } catch (_) {
                return {};
              }
            })()
          : map.theme_json;
      const themeJson = {
        ...existingTheme,
        clusterColor: clusterColor || "#4A9BAA",
        clusterOpacity: Math.max(0, Math.min(1, clusterOpacity / 100)),
        pinBorderColor: pinBorderColor || "#ffffff",
        pinBorderSize: Math.max(0, Math.min(15, Number(pinBorderSize) || 0)),
        pinDropShadow: Math.max(0, Math.min(30, Number(pinDropShadow) || 0)),
        pinShadowDistance: Math.max(0, Math.min(30, Number(pinShadowDistance) || 0)),
        pinShadowOpacity: Math.max(0, Math.min(100, Number(pinShadowOpacity) || 0)),
        pin_favicon_url: (pinFaviconUrl || "").trim() || null,
        pinSize: normalizePinSize(pinSize),
        buttonColor: (buttonColor || "").trim() || "#4A9BAA",
        panelBackgroundColor: (panelBackgroundColor || "").trim() || "#ffffff",
        panelBackgroundOpacity: Math.max(0, Math.min(1, Number(panelBackgroundOpacity) ?? 0.88)),
        panelBorderRadius: Math.max(0, Math.min(28, Number(panelBorderRadius) || 12)),
        pinDetailLayout: pinDetailLayout === "drawer" ? "drawer" : "map",
        panelLinkColor: (panelLinkColor || "").trim() || "#4A9BAA",
        showSearch,
        showGroupDropdowns,
        logoUrl: (logoUrl || "").trim() || null,
        description: typeof description === "string" ? description : null,
        searchPanelBgColor: (searchPanelBgColor || "").trim() || "#ffffff",
        searchPanelBgOpacity: Math.max(0, Math.min(1, Number(searchPanelBgOpacity) ?? 0.92)),
        searchPanelTextColor: (searchPanelTextColor || "").trim() || "#111827",
        listingBgColor: (listingBgColor || "").trim() || "#ffffff",
        listingBorderColor: (listingBorderColor || "").trim() || "#e5e7eb",
        listingOpacity: Math.max(0, Math.min(1, Number(listingOpacity) ?? 1)),
        showContinentFilter: !!showContinentFilter,
        showKey: !!showKey,
        showMapTitle: !!showMapTitle,
        showLogo: !!showLogo,
        showTitle: !!showTitle,
        showListings: !!showListings,
        centerLabel: centerLabel || undefined,
        mapTypeId,
        mapStyleSettings: normalizeMapStyleSettings(mapStyleSettings),
      };
      delete themeJson.pinFaviconUrl;
      const payloadBase = {
        name: cleanName,
        slug: slug.trim(),
        default_lat: lat,
        default_lng: lng,
        default_zoom: zoom,
        show_list_panel: showListPanel,
        enable_clustering: enableClustering,
        marker_style: markerStyle,
        marker_color: markerColor,
        theme_json: themeJson,
      };
      const payloadWithExtras = {
        ...payloadBase,
        cluster_radius: Math.max(20, Math.min(200, Number(clusterRadius) || 80)),
        custom_pin_url: customPinUrl || null,
      };
      let { error } = await supabase.from("maps").update(payloadWithExtras).eq("id", mapId);
      const msg = String(error?.message || "");
      if (error && (msg.includes("cluster_radius") || msg.includes("custom_pin_url"))) {
        ({ error } = await supabase.from("maps").update(payloadBase).eq("id", mapId));
      }
      if (error) throw error;

      setMap((prev) =>
        prev ? { ...prev, theme_json: themeJson, custom_pin_url: customPinUrl || null } : prev,
      );

      setMsg("Saved.");
      window.setTimeout(() => setMsg(""), 1600);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function saveDraftTheme() {
    if (!mapId) return;
    setDraftStatus("saving");
    try {
      const existingTheme = !map?.theme_json ? {} : typeof map.theme_json === "string" ? (() => { try { return JSON.parse(map.theme_json); } catch (_) { return {}; } })() : map.theme_json;
      const themeJson = {
        ...existingTheme,
        clusterColor: clusterColor || "#4A9BAA",
        clusterOpacity: Math.max(0, Math.min(1, clusterOpacity / 100)),
        pinBorderColor: pinBorderColor || "#ffffff",
        pinBorderSize: Math.max(0, Math.min(15, Number(pinBorderSize) || 0)),
        pinDropShadow: Math.max(0, Math.min(30, Number(pinDropShadow) || 0)),
        pinShadowDistance: Math.max(0, Math.min(30, Number(pinShadowDistance) || 0)),
        pinShadowOpacity: Math.max(0, Math.min(100, Number(pinShadowOpacity) || 0)),
        pin_favicon_url: (pinFaviconUrl || "").trim() || null,
        pinSize: normalizePinSize(pinSize),
        buttonColor: (buttonColor || "").trim() || "#4A9BAA",
        panelBackgroundColor: (panelBackgroundColor || "").trim() || "#ffffff",
        panelBackgroundOpacity: Math.max(0, Math.min(1, Number(panelBackgroundOpacity) ?? 0.88)),
        panelBorderRadius: Math.max(0, Math.min(28, Number(panelBorderRadius) || 12)),
        pinDetailLayout: pinDetailLayout === "drawer" ? "drawer" : "map",
        panelLinkColor: (panelLinkColor || "").trim() || "#4A9BAA",
        showSearch,
        showGroupDropdowns,
        logoUrl: (logoUrl || "").trim() || null,
        searchPanelBgColor: (searchPanelBgColor || "").trim() || "#ffffff",
        searchPanelBgOpacity: Math.max(0, Math.min(1, Number(searchPanelBgOpacity) ?? 0.92)),
        searchPanelTextColor: (searchPanelTextColor || "").trim() || "#111827",
        listingBgColor: (listingBgColor || "").trim() || "#ffffff",
        listingBorderColor: (listingBorderColor || "").trim() || "#e5e7eb",
        listingOpacity: Math.max(0, Math.min(1, Number(listingOpacity) ?? 1)),
        showContinentFilter: !!showContinentFilter,
        showKey: !!showKey,
        showLogo: !!showLogo,
        showTitle: !!showTitle,
        showListings: !!showListings,
        mapTypeId,
        mapStyleSettings: normalizeMapStyleSettings(mapStyleSettings),
      };
      delete themeJson.pinFaviconUrl;
      const payload = { marker_style: markerStyle, marker_color: markerColor, theme_json: themeJson };
      let { error } = await supabase.from("maps").update({ ...payload, custom_pin_url: customPinUrl || null }).eq("id", mapId);
      if (error && String(error.message || "").includes("custom_pin_url")) {
        ({ error } = await supabase.from("maps").update(payload).eq("id", mapId));
      }
      if (error) throw error;
      setMap((prev) => prev ? { ...prev, theme_json: themeJson } : prev);
      setDraftStatus("saved");
      setTimeout(() => setDraftStatus(""), 2500);
    } catch (_) {
      setDraftStatus("");
    }
  }
  saveDraftThemeRef.current = saveDraftTheme;
  openPublishRef.current = openPublishPanel;
  closePublishRef.current = closePublishPanel;

  const prevMapIdRef = useRef(null);
  useEffect(() => {
    if (prevMapIdRef.current != null && prevMapIdRef.current !== mapId) {
      closePublishPanel();
    }
    prevMapIdRef.current = mapId;
  }, [mapId, setPublishPanelOpen]);

  async function saveDraftGeneral() {
    if (!mapId) return;
    setDraftGeneralStatus("saving");
    try {
      const existingTheme = !map?.theme_json ? {} : typeof map.theme_json === "string" ? (() => { try { return JSON.parse(map.theme_json); } catch (_) { return {}; } })() : map.theme_json;
      const themeJson = {
        ...existingTheme,
        centerLabel: centerLabel || undefined,
        description: typeof description === "string" ? description : (existingTheme.description ?? null),
      };
      const payload = {
        name: name.trim() || (map?.name ?? ""),
        slug: slug.trim() || (map?.slug ?? ""),
        default_lat: Number(defaultLat) || null,
        default_lng: Number(defaultLng) || null,
        default_zoom: Number(defaultZoom) || null,
        show_list_panel: showListPanel,
        enable_clustering: enableClustering,
        theme_json: themeJson,
      };
      let { error } = await supabase.from("maps").update({ ...payload, cluster_radius: Math.max(20, Math.min(200, Number(clusterRadius) || 80)) }).eq("id", mapId);
      if (error && String(error.message || "").includes("cluster_radius")) {
        ({ error } = await supabase.from("maps").update(payload).eq("id", mapId));
      }
      if (error) throw error;
      setMap((prev) => prev ? { ...prev, ...payload, theme_json: themeJson } : prev);
      setDraftGeneralStatus("saved");
      setTimeout(() => setDraftGeneralStatus(""), 2500);
    } catch (_) {
      setDraftGeneralStatus("");
    }
  }
  saveDraftGeneralRef.current = saveDraftGeneral;

  const editTheme = useMemo(
    () => buildEditTheme({ panelBackgroundColor, panelBackgroundOpacity, panelLinkColor, buttonColor, pinDetailLayout, panelBorderRadius, pinSize, logoUrl, description, searchPanelBgColor, searchPanelBgOpacity, searchPanelTextColor, listingBgColor, listingBorderColor, listingOpacity, showContinentFilter, showKey, showLogo, showTitle, showListings }),
    [panelBackgroundColor, panelBackgroundOpacity, panelLinkColor, buttonColor, pinDetailLayout, panelBorderRadius, pinSize, logoUrl, description, searchPanelBgColor, searchPanelBgOpacity, searchPanelTextColor, listingBgColor, listingBorderColor, listingOpacity, showContinentFilter, showKey, showLogo, showTitle, showListings],
  );

  async function publishMap() {
    if (!map) return;
    try {
      setPublishing(true);
      setErr("");
      const draftConfig = draftPublicationConfig;
      const { data, error } = await supabase.rpc("publish_map", {
        p_map_id: mapId,
        p_config: draftConfig,
        p_note: publishNote.trim() || null,
      });
      if (error) throw error;
      setPublishedSnapshot(normalizePublicationConfig(data.config));
      setPublishedAt(data.published_at);
      setPublishNote("");
      setMap((prev) =>
        prev
          ? {
              ...prev,
              current_publication_id: data.id,
              published_config: data.config?.map ?? draftConfig.map,
              published_at: data.published_at,
            }
          : prev,
      );
      const { data: hist } = await supabase.rpc("list_map_publications", { p_map_id: mapId });
      setPublicationHistory(hist ?? []);
      setMsg("Published.");
      window.setTimeout(() => setMsg(""), 2000);
      // Fire-and-forget: generate static snapshot in the background.
      // Does not block the publish UX; failures are silent to the user.
      triggerSnapshotRegeneration(mapId);
      // Fire-and-forget: regenerate Epic 3's crawlable directory pages (no-ops for non-entitled clients).
      triggerDirectoryPagesRegeneration(mapId);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setPublishing(false);
    }
  }

  async function rollbackToPublication(pubRowId) {
    try {
      setRollingBack(true);
      setErr("");
      const { data, error } = await supabase.rpc("rollback_map_to", {
        p_map_id: mapId,
        p_publication_id: pubRowId,
      });
      if (error) throw error;
      setPublishedSnapshot(normalizePublicationConfig(data.config));
      setPublishedAt(data.published_at);
      setMap((prev) =>
        prev
          ? {
              ...prev,
              current_publication_id: data.id,
              published_config: data.config?.map,
              published_at: data.published_at,
            }
          : prev,
      );
      const { data: hist } = await supabase.rpc("list_map_publications", { p_map_id: mapId });
      setPublicationHistory(hist ?? []);
      setMsg("Restored that version as current. Use “Discard draft” to reset the editor.");
      window.setTimeout(() => setMsg(""), 3200);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setRollingBack(false);
    }
  }

  async function discardDraft() {
    const cfg = publishedSnapshot;
    if (!cfg?.map) return;
    try {
      setDiscarding(true);
      setErr("");
      const m = cfg.map;
      const themeJson =
        typeof m.theme_json === "string"
          ? (() => {
              try {
                return JSON.parse(m.theme_json || "{}");
              } catch {
                return {};
              }
            })()
          : m.theme_json || {};

      const payloadBase = {
        default_lat: m.default_lat,
        default_lng: m.default_lng,
        default_zoom: m.default_zoom,
        show_list_panel: m.show_list_panel,
        enable_clustering: m.enable_clustering,
        marker_style: m.marker_style,
        marker_color: m.marker_color,
        theme_json: themeJson,
      };
      const payloadWithExtras = {
        ...payloadBase,
        cluster_radius: Math.max(20, Math.min(200, Number(m.cluster_radius) || 80)),
        custom_pin_url: m.custom_pin_url ?? null,
      };
      let { error } = await supabase.from("maps").update(payloadWithExtras).eq("id", mapId);
      const msg = String(error?.message || "");
      if (error && (msg.includes("cluster_radius") || msg.includes("custom_pin_url"))) {
        ({ error } = await supabase.from("maps").update(payloadBase).eq("id", mapId));
      }
      if (error) throw error;

      for (const gr of groups || []) {
        const snap = cfg.groups?.byId?.[gr.id] ?? cfg.groups?.byName?.[gr.name];
        const { error: gErr } = await supabase
          .from("groups")
          .update({
            color: snap?.color ?? null,
            theme_json: snap?.theme_json ?? null,
          })
          .eq("id", gr.id)
          .eq("map_id", mapId);
        if (gErr) throw gErr;
      }

      setDefaultLat(String(m.default_lat ?? ""));
      setDefaultLng(String(m.default_lng ?? ""));
      setDefaultZoom(String(m.default_zoom ?? ""));
      setShowListPanel(m.show_list_panel !== false);
      setEnableClustering(!!m.enable_clustering);
      setClusterRadius(m.cluster_radius ?? 80);
      setMarkerStyle(m.marker_style ?? "pin");
      setMarkerColor(m.marker_color ?? "#4A9BAA");
      setCustomPinUrl(m.custom_pin_url ?? "");
      setClusterColor(themeJson.clusterColor ?? "#4A9BAA");
      setClusterOpacity(Math.round((themeJson.clusterOpacity ?? 1) * 100));
      setPinBorderColor(themeJson.pinBorderColor ?? "#ffffff");
      setPinBorderSize(Math.max(0, Math.min(15, Number(themeJson.pinBorderSize) ?? 0)));
      setPinDropShadow(Math.max(0, Math.min(30, Number(themeJson.pinDropShadow ?? themeJson.pinDropShadowPx ?? 0) ?? 0)));
      setPinShadowDistance(Math.max(0, Math.min(30, Number(themeJson.pinShadowDistance ?? 20))));
      setPinShadowOpacity(Math.max(0, Math.min(100, Number(themeJson.pinShadowOpacity ?? 100))));
      setPinFaviconUrl(String(themeJson.pin_favicon_url ?? themeJson.pinFaviconUrl ?? "").trim());
      setButtonColor(themeJson.buttonColor ?? "#4A9BAA");
      setPanelBackgroundColor(themeJson.panelBackgroundColor ?? "#ffffff");
      setPanelBackgroundOpacity(themeJson.panelBackgroundOpacity ?? 0.88);
      setPanelBorderRadius(Math.max(0, Math.min(28, Number(themeJson.panelBorderRadius) ?? 12)));
      setPinDetailLayout(themeJson.pinDetailLayout === "drawer" ? "drawer" : "map");
      setPanelLinkColor(themeJson.panelLinkColor ?? "#4A9BAA");
      setDescription(themeJson.description ?? "");
      setLogoUrl(themeJson.logoUrl ?? "");
      setSearchPanelBgColor(themeJson.searchPanelBgColor ?? "#ffffff");
      setSearchPanelBgOpacity(themeJson.searchPanelBgOpacity ?? 0.92);
      setSearchPanelTextColor(themeJson.searchPanelTextColor ?? "#111827");
      setListingBgColor(themeJson.listingBgColor ?? "#ffffff");
      setListingBorderColor(themeJson.listingBorderColor ?? "#e5e7eb");
      setListingOpacity(themeJson.listingOpacity ?? 1);
      setShowContinentFilter(themeJson.showContinentFilter === true);
      setShowKey(themeJson.showKey !== false);
      setPinSize(normalizePinSize(themeJson.pinSize));
      setShowSearch(themeJson.showSearch !== false);
      setShowGroupDropdowns(themeJson.showGroupDropdowns !== false);
      setShowMapTitle(!!themeJson.showMapTitle);
      setShowLogo(themeJson.showLogo !== false);
      setShowTitle(themeJson.showTitle !== false);
      setShowListings(themeJson.showListings !== false);
      const restoredMapTypeId = themeJson.mapTypeId ?? "roadmap";
      setMapTypeId(restoredMapTypeId);
      setMapStyleSettings(
        normalizeMapStyleSettings({
          ...DEFAULT_MAP_STYLE_SETTINGS,
          ...(themeJson.mapStyleSettings || {}),
          baseType:
            themeJson.mapStyleSettings?.baseType ??
            (restoredMapTypeId === "satellite" ||
            restoredMapTypeId === "hybrid" ||
            restoredMapTypeId === "terrain"
              ? restoredMapTypeId
              : "roadmap"),
        })
      );
      setSelectedMapStylePreset(defaultPresetIdFromMapTypeId(restoredMapTypeId));

      const { data: gReload } = await supabase
        .from("groups")
        .select("id,name,sort_order,color,theme_json")
        .eq("map_id", mapId)
        .order("sort_order", { ascending: true });
      setGroups(gReload ?? []);

      setMap((prev) =>
        prev
          ? {
              ...prev,
              ...payloadWithExtras,
              theme_json: themeJson,
            }
          : prev,
      );
      setMsg("Draft discarded — editor matches the published version.");
      window.setTimeout(() => setMsg(""), 2200);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setDiscarding(false);
    }
  }

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
        "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(q) + "&key=" + encodeURIComponent(apiKey);
      const res = await fetch(url);
      const json = await res.json();
      if (json.status !== "OK" || !json.results?.length) {
        throw new Error(`No results for "${q}" (status: ${json.status || "ERROR"})`);
      }
      const result = json.results[0];
      const loc = result.geometry.location;
      setDefaultLat(String(loc.lat));
      setDefaultLng(String(loc.lng));
      const approxType = result.types?.[0] || "";
      const zoomGuess =
        approxType.includes("country") || approxType.includes("continent")
          ? 5
          : approxType.includes("administrative_area_level_1") || approxType.includes("administrative_area_level_2")
          ? 7
          : 10;
      setDefaultZoom(String(zoomGuess));
      const label = result.formatted_address || q;
      setCenterLabel(label);
      setLocationQuery("");
      setMsg(`Map centred on ${label}.`);
      window.setTimeout(() => setMsg(""), 3000);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setGeocoding(false);
    }
  }

  async function deleteMap() {
    const ok = await confirm({
      title: "Delete this map?",
      body: "This will also delete its groups and listings if FK cascade is set.",
      confirmLabel: "Delete map",
      tone: "danger",
    });
    if (!ok) return;

    try {
      setSaving(true);
      setErr("");
      setMsg("");
      const clientId = await getClientIdForCurrentUser();
      if (!clientId) throw new Error("No client account linked.");
      const { error } = await supabase.from("maps").delete().eq("id", mapId).eq("client_id", clientId);
      if (error) throw error;
      navigate("/client");
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoFile(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const name = (file.name || "").toLowerCase();
    const extMatch = name.match(/\.(svg|png|jpe?g|webp)$/);
    if (!extMatch) {
      setErr("Use SVG, PNG, JPG or WebP for the logo.");
      e.target.value = "";
      return;
    }
    if (file.size > 500 * 1024) {
      setErr("Logo too large (max 500 KB).");
      e.target.value = "";
      return;
    }
    setErr("");
    setLogoUploading(true);
    try {
      const ext = extMatch[1] === "jpeg" ? "jpg" : extMatch[1];
      const path = `${mapId}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage.from("map-pins").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("map-pins").getPublicUrl(path);
      // Cache-bust so a re-upload of the same path shows immediately.
      setLogoUrl(`${urlData.publicUrl}?v=${Date.now()}`);
      setMsg("Logo uploaded.");
      window.setTimeout(() => setMsg(""), 2000);
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  }

  async function handleCustomPinFile(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const name = (file.name || "").toLowerCase();
    const isSvg = name.endsWith(".svg");
    const isPng = name.endsWith(".png");
    if (!isSvg && !isPng) {
      setErr("Use SVG or PNG only.");
      return;
    }
    if (file.size > 200 * 1024) {
      setErr("File too large (max 200 KB).");
      return;
    }
    setErr("");
    setCustomPinUploading(true);
    try {
      const ext = isSvg ? "svg" : "png";
      const uploadFile = isSvg ? await sanitizeSvgFile(file) : file;
      const path = `${mapId}/pin.${ext}`;
      const { error: uploadError } = await supabase.storage.from("map-pins").upload(path, uploadFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("map-pins").getPublicUrl(path);
      setCustomPinUrl(`${urlData.publicUrl}?v=${Date.now()}`);
      setMarkerStyle("custom");
      setMsg("Custom pin uploaded.");
      window.setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setCustomPinUploading(false);
      e.target.value = "";
    }
  }

  async function handleGroupCustomPinFile(e) {
    const file = e?.target?.files?.[0];
    if (!file || !editingGroupId) return;
    const name = (file.name || "").toLowerCase();
    const isSvg = name.endsWith(".svg");
    const isPng = name.endsWith(".png");
    if (!isSvg && !isPng) {
      setErr("Use SVG or PNG only.");
      return;
    }
    if (file.size > 200 * 1024) {
      setErr("File too large (max 200 KB).");
      return;
    }
    setErr("");
    setGroupCustomPinUploading(true);
    try {
      const ext = isSvg ? "svg" : "png";
      const uploadFile = isSvg ? await sanitizeSvgFile(file) : file;
      const path = `${mapId}/group-${editingGroupId}-pin.${ext}`;
      const { error: uploadError } = await supabase.storage.from("map-pins").upload(path, uploadFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("map-pins").getPublicUrl(path);
      setGroupEditDesign((p) => ({ ...(p || {}), marker_style: "custom", custom_pin_url: `${urlData.publicUrl}?v=${Date.now()}` }));
      setMsg("Custom pin uploaded.");
      window.setTimeout(() => setMsg(""), 2000);
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setGroupCustomPinUploading(false);
      e.target.value = "";
    }
  }

  async function handleContactSubmit(e) {
    e.preventDefault();
    if (!selectedListing?.email) return;
    if (messagingTestMode && !contactForm.testToEmail.trim()) {
      setContactFormError("Enter a test recipient email to send in test mode.");
      return;
    }
    setContactFormError("");
    setContactFormSubmitting(true);
    try {
      await submitContactMessage(supabase, {
        mapId,
        listingId: selectedListing.id,
        listingName: selectedListing.name || "",
        toEmail: messagingTestMode ? contactForm.testToEmail.trim() : selectedListing.email,
        senderName: (contactForm.name || "").trim(),
        senderEmail: (contactForm.email || "").trim(),
        senderPhone: (contactForm.phone || "").trim(),
        message: (contactForm.message || "").trim(),
        surface: "client_preview",
      });
      setContactFormSent(true);
      setContactForm({ name: "", email: "", phone: "", message: "", testToEmail: contactForm.testToEmail });
    } catch (err) {
      setContactFormError(formatContactMessageError(err));
    } finally {
      setContactFormSubmitting(false);
    }
  }

  if (loading && !map) {
    return (
      <main className="admin-main">
        <div className="md-load"><Skeleton variant="form" rows={4} label="Loading map" /></div>
      </main>
    );
  }

  if (!loading && !map && err) {
    return (
      <main className="admin-main">
        <div className="md-load"><ErrorState title="We couldn't load this map" body={err} /></div>
      </main>
    );
  }

  const messageDrawer = (
    <MapMessageDrawer
      open={messageDrawerOpen}
      onClose={() => setMessageDrawerOpen(false)}
      onSentClose={() => {
        setMessageDrawerOpen(false);
        setContactFormSent(false);
      }}
      listing={selectedListing}
      sent={contactFormSent}
      form={contactForm}
      onFormChange={setContactForm}
      testMode={messagingTestMode}
      testRecipient={messagingTestRecipient}
      submitting={contactFormSubmitting}
      error={contactFormError}
      onSubmit={handleContactSubmit}
    />
  );

  return (
    <main className="admin-main admin-main--map-page">
      <div className="admin-map-page">
        <div className="admin-map-page__map-wrap">
          {overlayTab && !isPublishOpen ? (
            <div className="admin-map-overlay__backdrop" aria-hidden="true" />
          ) : null}
          {!isPublishOpen && (apiKey ? (
            <PublishedMapView
              apiKey={apiKey}
              center={mapCenter}
              zoom={Number(defaultZoom) || 10}
              mapTypeId={mapTypeId}
              listings={listings}
              groups={groups}
              filterFields={publishedFilterFields}
              showListPanel={showListPanel}
              showMapTitle={showMapTitle}
              mapName={name}
              showSearch={showSearch}
              showGroupDropdowns={showGroupDropdowns}
              enableClustering={enableClustering}
              clusterRadius={clusterRadius}
              markerStyle={markerStyle}
              markerColor={markerColor}
              customPinUrl={markerStyle === "custom" && customPinUrl ? customPinUrl : null}
              clusterColor={clusterColor}
              clusterOpacity={clusterOpacity / 100}
              pinBorderColor={pinBorderColor}
              pinBorderSize={pinBorderSize}
              pinDropShadow={pinDropShadow}
              pinShadowDistance={pinShadowDistance}
              pinShadowOpacity={pinShadowOpacity}
              pinFaviconUrl={(pinFaviconUrl || "").trim() || null}
              mapStyles={liveMapStyles}
              showTrafficLayer={mapStyleSettings.overlays.traffic}
              showTransitLayer={mapStyleSettings.overlays.transit}
              showBikeLayer={mapStyleSettings.overlays.bikeLanes}
              showZoomIndicator
              showZoomSlider={false}
              theme={editTheme}
              selectedListing={selectedListing}
              selectedMarkerPoint={selectedMarkerPoint}
              clampedPanelPosition={clampedPanelPosition}
              setClampedPanelPosition={setClampedPanelPosition}
              pinOverlayRef={pinOverlayRef}
              onMarkerScreenPosition={setSelectedMarkerPoint}
              onSelectMarker={(listing, point) => {
                setSelectedListing(listing);
                setSelectedMarkerPoint(point ?? null);
                setClampedPanelPosition(null);
              }}
              onClosePin={() => { setSelectedListing(null); setSelectedMarkerPoint(null); setClampedPanelPosition(null); }}
              centerOnListingId={centerOnListingId}
              setCenterOnListingId={setCenterOnListingId}
              showSendMessage={true}
              onOpenSendMessage={() => {
                if (!selectedListing?.email) return;
                setMessageDrawerOpen(true);
                setContactFormSent(false);
                setContactFormError("");
                // Re-fetch test mode settings so they reflect any changes
                // made in the Messaging tab since this page loaded.
                if (client?.id) {
                  supabase
                    .from("map_messaging_settings")
            .select("email_test_mode,email_test_recipient")
            .eq("map_id", mapId)
                    .single()
                    .then(({ data: ms }) => {
                      if (ms) {
                        setMessagingTestMode(ms.email_test_mode !== false);
                        setMessagingTestRecipient(ms.email_test_recipient ?? "");
                        setContactForm((f) => ({
                          ...f,
                          testToEmail: f.testToEmail || ms.email_test_recipient || "",
                        }));
                      }
                    });
                }
              }}
              height="100%"
              listingsWithColor={previewListings}
              mapOverlay={messageDrawer}
            />
          ) : (
            <div className="md-map-empty">Set VITE_GOOGLE_MAPS_API_KEY to show the map.</div>
          ))}
        </div>

        {isPublishOpen && (
          <MapPublishPage
            onBack={closePublishPanel}
            hasActiveSubscription={hasActiveSubscription}
            pricingOrigin="Client publish tab"
            err={err}
            map={map}
            lat={defaultLat}
            lng={defaultLng}
            zoom={defaultZoom}
            publishedAt={publishedAt}
            publishNote={publishNote}
            onPublishNoteChange={setPublishNote}
            hasUnpublishedChanges={hasUnpublishedChanges}
            canDiscard={!!publishedSnapshot && hasUnpublishedChanges}
            discarding={discarding}
            onDiscard={discardDraft}
            publishing={publishing}
            onPublish={publishMap}
            embedWidth={embedWidth}
            onEmbedWidthChange={setEmbedWidth}
            embedWidthUnit={embedWidthUnit}
            onEmbedWidthUnitChange={setEmbedWidthUnit}
            embedHeight={embedHeight}
            onEmbedHeightChange={setEmbedHeight}
            embedIframe={embedIframe}
            onCopyEmbed={copyEmbed}
            onOpenEmbed={openEmbed}
            thumbSize={thumbSize}
            onThumbSizeChange={setThumbSize}
            embedThumbnail={embedThumbnail}
            onCopyThumbnail={copyThumbnailEmbed}
            publicationHistory={publicationHistory}
            rollingBack={rollingBack}
            onRestore={rollbackToPublication}
          />
        )}

        <div className="admin-map-page__right">
          <MapSettingsStrip
            primaryTabs={["detail", "search", "filters", "messaging"]}
            secondaryTabs={["design", "groups", "panels", "mapstyle"]}
            openTab={overlayTab}
            onOpenTab={openOverlay}
            onPreview={openEmbed}
            message={msg}
          />

          <MapOverlayPanel
            tab={overlayTab}
            open={!!overlayTab && !isPublishOpen}
            onClose={closeOverlay}
            error={err}
            notice={isDirectorySourced ? "This map's pins come from its linked directory — shown here for preview, but add or edit entries there rather than in this dashboard." : null}
          >
            {overlayTab === "detail" && (
              <MapGeneralPanel
                draftStatus={draftGeneralStatus}
                name={name}
                onNameChange={setName}
                slug={slug}
                onSlugChange={setSlug}
                description={description}
                onDescriptionChange={setDescription}
                locationQuery={locationQuery}
                onLocationQueryChange={setLocationQuery}
                onLookupLocation={lookupLocation}
                geocoding={geocoding}
                centerLabel={centerLabel}
                zoom={defaultZoom}
                onZoomChange={setDefaultZoom}
                enableClustering={enableClustering}
                onEnableClusteringChange={setEnableClustering}
                clusterRadius={clusterRadius}
                onClusterRadiusChange={setClusterRadius}
              />
            )}

            {overlayTab === "design" && (
              <MapDesignPanel
                draftStatus={draftStatus}
                markerStyle={markerStyle}
                onMarkerStyleChange={setMarkerStyle}
                pinSize={pinSize}
                onPinSizeChange={setPinSize}
                enableClustering={enableClustering}
                markerColor={markerColor}
                onMarkerColorChange={setMarkerColor}
                pinBorderColor={pinBorderColor}
                onPinBorderColorChange={setPinBorderColor}
                pinBorderSize={pinBorderSize}
                onPinBorderSizeChange={setPinBorderSize}
                clusterColor={clusterColor}
                onClusterColorChange={setClusterColor}
                clusterOpacity={clusterOpacity}
                onClusterOpacityChange={setClusterOpacity}
                pinDropShadow={pinDropShadow}
                onPinDropShadowChange={setPinDropShadow}
                pinShadowDistance={pinShadowDistance}
                onPinShadowDistanceChange={setPinShadowDistance}
                pinShadowOpacity={pinShadowOpacity}
                onPinShadowOpacityChange={setPinShadowOpacity}
                customPinUrl={customPinUrl}
                onCustomPinUrlChange={setCustomPinUrl}
                customPinUploading={customPinUploading}
                onCustomPinFile={handleCustomPinFile}
                customPinInputRef={customPinTileInputRef}
                pinFaviconUrl={pinFaviconUrl}
                onPinFaviconUrlChange={setPinFaviconUrl}
                onError={setErr}
              />
            )}

            {overlayTab === "panels" && (
              <MapPanelsPanel
                draftStatus={draftStatus}
                pinDetailLayout={pinDetailLayout}
                onPinDetailLayoutChange={setPinDetailLayout}
                panelBackgroundColor={panelBackgroundColor}
                onPanelBackgroundColorChange={setPanelBackgroundColor}
                panelBackgroundOpacity={panelBackgroundOpacity}
                onPanelBackgroundOpacityChange={setPanelBackgroundOpacity}
                panelBorderRadius={panelBorderRadius}
                onPanelBorderRadiusChange={setPanelBorderRadius}
                panelLinkColor={panelLinkColor}
                onPanelLinkColorChange={setPanelLinkColor}
                buttonColor={buttonColor}
                onButtonColorChange={setButtonColor}
              />
            )}

            {overlayTab === "groups" && (
              <MapGroupsPanel
                orderedGroups={orderedGroupsList}
                onDragStart={handleGroupDragStart}
                onDragOver={handleGroupDragOver}
                onDrop={handleGroupDrop}
                onEditGroup={openGroupEdit}
                onSaveOrder={saveGroupsOrder}
                savingGroups={savingGroups}
                editor={
                  editingGroupId ? (
                    <MapGroupDesignEditor
                      group={groups.find((g) => g.id === editingGroupId)}
                      design={groupEditDesign}
                      globalDesign={globalDesignForGroup}
                      onChange={setGroupEditDesign}
                      fileInputRef={groupCustomPinTileInputRef}
                      onCustomFile={handleGroupCustomPinFile}
                      customPinUploading={groupCustomPinUploading}
                      saving={savingGroups}
                      onReset={resetGroupDesign}
                      onClose={closeGroupEdit}
                      onError={setErr}
                    />
                  ) : null
                }
              />
            )}

            {overlayTab === "mapstyle" && (
              <MapStylePanel
                draftStatus={draftStatus}
                selectedPreset={selectedMapStylePreset}
                onApplyPreset={applyMapStylePreset}
                settings={mapStyleSettings}
                onBaseTypeChange={(id) => {
                  setMapTypeId(id);
                  updateMapStyleSettings((prev) => ({ ...prev, baseType: id }));
                }}
                onSettingsChange={updateMapStyleSettings}
              />
            )}

            {overlayTab === "search" && (
              <MapSearchPanel
                draftStatus={draftStatus}
                display={[
                  { key: "panel", label: "Show search panel", checked: showListPanel, onChange: setShowListPanel },
                  { key: "logo", label: "Show logo", checked: showLogo, onChange: setShowLogo },
                  { key: "title", label: "Show title", checked: showTitle, onChange: setShowTitle },
                  { key: "key", label: "Show groups key", checked: showKey, onChange: setShowKey },
                  { key: "listings", label: "Show listings", checked: showListings, onChange: setShowListings },
                ]}
                logoUrl={logoUrl}
                logoUploading={logoUploading}
                onLogoFile={handleLogoFile}
                onLogoRemove={() => setLogoUrl("")}
                searchPanelBgColor={searchPanelBgColor}
                onSearchPanelBgColorChange={setSearchPanelBgColor}
                searchPanelTextColor={searchPanelTextColor}
                onSearchPanelTextColorChange={setSearchPanelTextColor}
                searchPanelBgOpacity={searchPanelBgOpacity}
                onSearchPanelBgOpacityChange={setSearchPanelBgOpacity}
                listingBgColor={listingBgColor}
                onListingBgColorChange={setListingBgColor}
                listingBorderColor={listingBorderColor}
                onListingBorderColorChange={setListingBorderColor}
                listingOpacity={listingOpacity}
                onListingOpacityChange={setListingOpacity}
                filterFields={filterFields}
                onManageFilters={() => openOverlay("filters")}
              />
            )}

            {overlayTab === "filters" && (
              <FilterFieldsPanel
                mapId={mapId}
                clientId={client?.id ?? null}
                recordEvent={recordFilterEvent}
                onChange={refreshFilterFields}
                colorFieldId={colorFilterFieldId}
                onColorFieldChange={updateColorFilterField}
              />
            )}

            {overlayTab === "messaging" && (
              <EntityMessagingSettings
                entity="map"
                entityId={mapId}
                clientId={client?.id}
                eventSource="client_portal"
              />
            )}

            {overlayTab === "data" && (
              <MapListingLogoPanel
                search={dataSearch}
                onSearchChange={(value) => {
                  setDataSearch(value);
                  setDataPage(0);
                }}
                listings={pageListings}
                groupNameById={groupNameById}
                onChangeLogoBg={updateListingLogoBg}
                page={dataPage + 1}
                pageSize={PAGE_SIZE}
                total={totalFilteredListings}
                onPage={(p) => setDataPage(p - 1)}
              />
            )}
          </MapOverlayPanel>
        </div>
      </div>
    </main>
  );
}
