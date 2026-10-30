import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";
import { updateDirectory } from "../../lib/directories.js";
import {
  DIRECTORY_THEME_PRESETS,
  FONT_CATALOG,
  getThemePreset,
  listOrgPresets,
  saveThemePreset,
  renameThemePreset,
  deleteThemePreset,
} from "../../lib/directoryThemePresets.js";
import { uploadDirectoryLogo, uploadDirectoryFavicon, uploadDirectoryHeroBanner } from "../../lib/directoryBranding.js";
import {
  FOOTER_BG_DEFAULT,
  HEADER_BG_DEFAULT,
  LOGO_HEIGHT_DEFAULT,
  LOGO_HEIGHT_MAX,
  LOGO_HEIGHT_MIN,
  applyPresetValues,
  backgroundToCss,
  countChangedFields,
  headerShowsOf,
  headerShowsPatch,
  lengthAmount,
  serializeTheme,
  themeFromDirectory,
  withoutRetiredColours,
} from "../../lib/directoryThemeDraft.js";
import {
  ColourField,
  ConfirmDialog,
  NameDialog,
  OverflowMenu,
  SaveBar,
  SegmentedControl,
  contrastOf,
  useTabKeys,
  useUnsavedGuard,
} from "./ui.jsx";
import GradientBackgroundField from "./GradientBackgroundField.jsx";
import SitePreview from "./SitePreview.jsx";
import "./experience.css";

const FONT_OPTIONS = Object.keys(FONT_CATALOG);

const TAB_GROUPS = [
  { label: "Whole site", tabs: [["theme", "Theme"], ["identity", "Logo & identity"], ["colours", "Colours"], ["typography", "Typography"]] },
  { label: "Page areas", tabs: [["header", "Header"], ["hero", "Hero banner"], ["footer", "Footer"]] },
];
const TAB_IDS = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t[0]));
const HIGHLIGHT = { theme: null, identity: "header", colours: "body", typography: "body", header: "header", hero: "hero", footer: "footer" };

/** Keys a theme "matches" on for the "In use" badge — palette, fonts and header/footer styling. */
const MATCH_KEYS = [
  "primaryColor", "primaryDarkColor", "accentColor", "backgroundColor", "surfaceColor", "surfaceAltColor", "inkColor", "mutedColor",
  "lineColor", "sageColor", "sageInkColor", "fontHeading", "fontBody",
];
function themeInUse(theme, values) {
  return MATCH_KEYS.every((k) => values?.[k] === undefined || values[k] === theme[k]);
}

function Swatches({ values }) {
  const headerBg = backgroundToCss(values.headerBackground, HEADER_BG_DEFAULT.color);
  const footerBg = backgroundToCss(values.footerBackground, FOOTER_BG_DEFAULT.color);
  return (
    <div className="xp-swatchbar" aria-hidden="true">
      <span style={{ background: headerBg }} />
      <span style={{ background: values.backgroundColor }} />
      <span style={{ background: values.primaryColor }} />
      <span style={{ background: values.accentColor }} />
      <span style={{ background: footerBg }} />
    </div>
  );
}

function FontSizeRow({ label, value, onChange, unit, min, max, step, fallback, sampleFont, sampleText }) {
  const amount = lengthAmount(value, unit, fallback);
  return (
    <tr>
      <th scope="row" style={{ textAlign: "left", fontWeight: 600, fontSize: 13, padding: "8px 8px 8px 0", whiteSpace: "nowrap" }}>{label}</th>
      <td style={{ padding: 8 }}>
        <span className="xp-row" style={{ flexWrap: "nowrap" }}>
          <input
            className="xp-input"
            style={{ width: 80 }}
            type="number"
            aria-label={`${label} (${unit})`}
            min={min}
            max={max}
            step={step}
            value={amount}
            onChange={(e) => onChange(`${Math.min(max, Math.max(min, Number(e.target.value)))}${unit}`)}
          />
          <span className="xp-help">{unit}</span>
        </span>
      </td>
      <td style={{ padding: 8, overflow: "hidden", fontFamily: sampleFont }}>
        <span style={{ fontSize: unit === "px" ? `${amount}px` : `${Math.min(amount, 2.2)}rem`, whiteSpace: "nowrap" }}>{sampleText}</span>
      </td>
    </tr>
  );
}

export default function LookAndFeelPage() {
  const { directory, client, directoryId, clientId, basePath, canManage, recordEvent, refetch } = useDirectory();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab = TAB_IDS.includes(tabParam) ? tabParam : "theme";
  const setTab = useCallback((id) => setParams({ tab: id }, { replace: true }), [setParams]);
  const onTabKey = useTabKeys(TAB_IDS, tab, setTab);

  const [base, setBase] = useState(() => themeFromDirectory(directory));
  const [theme, setTheme] = useState(base);
  const dirtyCount = useMemo(() => countChangedFields(theme, base), [theme, base]);
  const dirty = dirtyCount > 0;
  useUnsavedGuard(dirty);

  // Adopt a refreshed directory only when there are no unsaved edits to lose.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (dirtyRef.current) return;
    const next = themeFromDirectory(directory);
    setBase(next);
    setTheme(next);
  }, [directory]);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState("");
  const [orgPresets, setOrgPresets] = useState([]);
  const [presetBusy, setPresetBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // {kind, ...}

  const logoInput = useRef(null);
  const faviconInput = useRef(null);
  const heroInput = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (clientId) {
      listOrgPresets(clientId)
        .then((rows) => !cancelled && setOrgPresets(rows))
        .catch((e) => !cancelled && setErr(e?.message ?? String(e)));
    }
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const set = useCallback((key, value) => {
    setErr("");
    setTheme((t) => {
      const next = { ...t, [key]: value };
      if (key === "headerBackground" && t.footerLinkedToHeader) next.footerBackground = value;
      return next;
    });
  }, []);
  const patch = useCallback((p) => {
    setErr("");
    setTheme((t) => ({ ...t, ...p }));
  }, []);

  function requestApply(values, name, presetId) {
    const run = () => {
      setTheme((t) => applyPresetValues(t, values));
      if (presetId) recordEvent?.("directory_theme_preset_applied", { client_id: clientId, preset_id: presetId, directory_id: directoryId });
      setDialog(null);
    };
    if (dirty) setDialog({ kind: "apply", name, run });
    else run();
  }

  async function saveAsTheme(name) {
    setErr("");
    try {
      setPresetBusy(true);
      const saved = await saveThemePreset(clientId, name, withoutRetiredColours(theme));
      setOrgPresets((rows) => [saved, ...rows]);
      recordEvent?.("directory_theme_preset_saved", { client_id: clientId, preset_id: saved.id });
      setDialog(null);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setPresetBusy(false);
    }
  }
  async function renameTheme(preset, name) {
    setErr("");
    try {
      setPresetBusy(true);
      await renameThemePreset(preset.id, name);
      setOrgPresets((rows) => rows.map((r) => (r.id === preset.id ? { ...r, name } : r)));
      setDialog(null);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setPresetBusy(false);
    }
  }
  async function deleteTheme(preset) {
    setErr("");
    try {
      setPresetBusy(true);
      await deleteThemePreset(preset.id);
      setOrgPresets((rows) => rows.filter((r) => r.id !== preset.id));
      recordEvent?.("directory_theme_preset_deleted", { client_id: clientId, preset_id: preset.id });
      setDialog(null);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setPresetBusy(false);
    }
  }

  const upload = (kind, fn, key) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    try {
      setUploading(kind);
      set(key, await fn(directoryId, file));
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setUploading("");
    }
  };

  async function save() {
    setErr("");
    try {
      setSaving(true);
      const next = serializeTheme(theme);
      await updateDirectory(directoryId, { theme_json: next });
      recordEvent?.("directory_branding_updated", {
        directory_id: directoryId,
        has_logo: !!next.logoUrl,
        has_favicon: !!next.faviconUrl,
        has_hero_banner: !!next.heroBannerUrl,
      });
      const saved = themeFromDirectory({ theme_json: next });
      setBase(saved);
      setTheme(saved);
      setSavedAt(new Date());
      refetch?.();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) return <p className="xp-help">Only an Owner or Manager can change the look and feel.</p>;

  const bgHex = theme.backgroundColor;
  const liveUrl = directory?.published_at && client?.slug && directory?.slug ? `https://maps.layercake-cx.biz/directories/${client.slug}/${directory.slug}` : null;

  return (
    <div className="xp-page">
      <div className="xp-head">
        <div>
          <p className="xp-crumb">Experience / Look &amp; feel</p>
          <h1 className="page-title" style={{ margin: "4px 0 0" }}>Look &amp; feel</h1>
          <p className="xp-sub">How the published directory looks to visitors. Edits stay unsaved until you save, and go live when you publish.</p>
        </div>
        {liveUrl ? (
          <a className="xp-btn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={liveUrl} target="_blank" rel="noopener noreferrer">
            Open live site ↗
          </a>
        ) : (
          <Link className="xp-btn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} to={`${basePath}/publishing`}>
            Publishing →
          </Link>
        )}
      </div>

      <div role="tablist" aria-label="Look and feel sections" className="xp-tabs" onKeyDown={onTabKey}>
        {TAB_GROUPS.map((g) => (
          <div key={g.label} className="xp-tabgroup" role="presentation">
            <span className="xp-tabgroup-label" aria-hidden="true">{g.label}</span>
            <div className="xp-tabgroup-row" role="presentation">
              {g.tabs.map(([id, label]) => (
                <button
                  key={id}
                  id={`xp-tab-${id}`}
                  type="button"
                  role="tab"
                  className="xp-tab"
                  aria-selected={tab === id}
                  aria-controls={`xp-panel-${id}`}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="xp-body">
        <div className="xp-editor" role="tabpanel" id={`xp-panel-${tab}`} aria-labelledby={`xp-tab-${tab}`} tabIndex={0}>
          {tab === "theme" && (
            <>
              <div className="xp-card">
                <h2>Theme</h2>
                <p className="xp-help">Start from a ready-made look, or reuse one your organisation saved. Applying a theme replaces colours, fonts, header and footer styling. Built-in themes keep your logo, favicon, banner, site name and text sizes; themes you saved also bring the logo, favicon and banner they were saved with.</p>
              </div>
              {clientId && (
                <div className="xp-card">
                  <div className="xp-row" style={{ justifyContent: "space-between" }}>
                    <h3>Your themes</h3>
                    <button type="button" className="xp-btn" onClick={() => setDialog({ kind: "save" })}>Save current as theme</button>
                  </div>
                  {orgPresets.length === 0 && <p className="xp-help">No saved themes yet. Save the current look to reuse it later.</p>}
                  <div className="xp-themegrid">
                    {orgPresets.map((p) => (
                      <div key={p.id} className="xp-themecard">
                        <Swatches values={p.theme_json || {}} />
                        <div className="xp-row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                            {themeInUse(theme, p.theme_json) && <span className="xp-tag">In use</span>}
                          </div>
                          <OverflowMenu
                            label={`Actions for ${p.name}`}
                            items={[
                              { label: "Apply", onSelect: () => requestApply(p.theme_json, p.name, p.id) },
                              { label: "Rename", onSelect: () => setDialog({ kind: "rename", preset: p }) },
                              { label: "Delete", danger: true, onSelect: () => setDialog({ kind: "delete", preset: p }) },
                            ]}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="xp-card">
                <h3>Built-in themes</h3>
                <div className="xp-themegrid">
                  {DIRECTORY_THEME_PRESETS.map((p) => (
                    <div key={p.key} className="xp-themecard">
                      <Swatches values={p.values} />
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
                      <p className="xp-help">{p.description}</p>
                      <div className="xp-row" style={{ justifyContent: "space-between" }}>
                        {themeInUse(theme, p.values) ? <span className="xp-tag">In use</span> : <span />}
                        <button type="button" className="xp-btn" onClick={() => requestApply(getThemePreset(p.key), p.label, null)}>Apply</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "identity" && (
            <>
              <div className="xp-card">
                <h2>Logo &amp; identity</h2>
                <p className="xp-help">Your logo, site name and favicon, used across the whole published site.</p>
                <div className="xp-row" style={{ justifyContent: "space-between" }}>
                  <h3>Logo</h3>
                  <span className="xp-tag">Shown in: site header</span>
                </div>
                <div className="xp-row">
                  {theme.logoUrl ? (
                    <img src={theme.logoUrl} alt="Current logo" style={{ height: 44, maxWidth: 140, objectFit: "contain", background: "#fff", border: "1px solid var(--lc-border)", borderRadius: 6 }} />
                  ) : (
                    <div aria-hidden="true" style={{ height: 44, width: 44, borderRadius: 6, background: theme.primaryColor }} />
                  )}
                  <button type="button" className="xp-btn" disabled={!!uploading} onClick={() => logoInput.current?.click()}>
                    {uploading === "logo" ? "Uploading…" : theme.logoUrl ? "Replace" : "Upload logo"}
                  </button>
                  {theme.logoUrl && <button type="button" className="xp-btn" onClick={() => set("logoUrl", "")}>Remove</button>}
                  <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload("logo", uploadDirectoryLogo, "logoUrl")} />
                </div>
                <p className="xp-help">PNG, JPG or WebP, up to 2 MB.</p>
                <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
                  Logo height
                  <span className="xp-row">
                    <input type="range" min={LOGO_HEIGHT_MIN} max={LOGO_HEIGHT_MAX} value={theme.logoMaxHeight} onChange={(e) => set("logoMaxHeight", Number(e.target.value))} style={{ flex: 1, minWidth: 140 }} />
                    <input
                      className="xp-input"
                      style={{ width: 80 }}
                      type="number"
                      aria-label="Logo height in pixels"
                      min={LOGO_HEIGHT_MIN}
                      max={LOGO_HEIGHT_MAX}
                      value={theme.logoMaxHeight}
                      onChange={(e) => set("logoMaxHeight", Math.min(LOGO_HEIGHT_MAX, Math.max(LOGO_HEIGHT_MIN, Number(e.target.value) || LOGO_HEIGHT_DEFAULT)))}
                    />
                    <span className="xp-help">px</span>
                  </span>
                  <span className="xp-help" style={{ fontWeight: 400 }}>{LOGO_HEIGHT_MIN}–{LOGO_HEIGHT_MAX} px. Width follows automatically.</span>
                </label>
              </div>

              <div className="xp-card">
                <h3>Header shows</h3>
                <SegmentedControl
                  label="Header shows"
                  name="header-shows"
                  value={headerShowsOf(theme)}
                  onChange={(v) => patch(headerShowsPatch(v))}
                  options={[{ value: "logo", label: "Logo only" }, { value: "logoText", label: "Logo + site name" }, { value: "text", label: "Site name only" }]}
                />
                <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
                  Site name
                  <input className="xp-input" value={theme.siteTitle} placeholder={directory?.name || ""} onChange={(e) => set("siteTitle", e.target.value)} />
                  <span className="xp-help" style={{ fontWeight: 400 }}>
                    Leave blank to use the directory name. It also labels the logo link for screen readers, so it applies even when the header shows the logo only.
                  </span>
                </label>
              </div>

              <div className="xp-card">
                <div className="xp-row" style={{ justifyContent: "space-between" }}>
                  <h3>Favicon</h3>
                  <span className="xp-tag">Shown in: browser tab and bookmarks</span>
                </div>
                <div className="xp-row">
                  {theme.faviconUrl ? (
                    <img src={theme.faviconUrl} alt="Current favicon" style={{ height: 32, width: 32, objectFit: "contain", background: "#fff", border: "1px solid var(--lc-border)", borderRadius: 6 }} />
                  ) : (
                    <div aria-hidden="true" style={{ height: 32, width: 32, borderRadius: 6, background: "#e5e7eb" }} />
                  )}
                  <button type="button" className="xp-btn" disabled={!!uploading} onClick={() => faviconInput.current?.click()}>
                    {uploading === "favicon" ? "Uploading…" : theme.faviconUrl ? "Replace" : "Upload favicon"}
                  </button>
                  {theme.faviconUrl && <button type="button" className="xp-btn" onClick={() => set("faviconUrl", "")}>Remove</button>}
                  <input ref={faviconInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload("favicon", uploadDirectoryFavicon, "faviconUrl")} />
                </div>
                <p className="xp-help">Square PNG, JPG or WebP, up to 2 MB. Save, then publish for it to appear.</p>
              </div>
            </>
          )}

          {tab === "colours" && (
            <div className="xp-card">
              <h2>Colours</h2>
              <p className="xp-help">The palette used for links, buttons, highlights and page backgrounds. Badges show how readable each colour is on the page background.</p>
              <div>
                <ColourField label="Primary" hint="Links and buttons" value={theme.primaryColor} onChange={(v) => set("primaryColor", v)} contrast={contrastOf(theme.primaryColor, bgHex)} />
                <ColourField label="Accent" hint="Highlights and the AI search icon" value={theme.accentColor} onChange={(v) => set("accentColor", v)} contrast={contrastOf(theme.accentColor, bgHex)} />
                <ColourField label="Page background" hint="Behind all page content" value={theme.backgroundColor} onChange={(v) => set("backgroundColor", v)} base />
              </div>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, minHeight: 36 }}>More colours</summary>
                <div style={{ marginTop: 8 }}>
                  <ColourField label="Link hover" value={theme.primaryDarkColor} onChange={(v) => set("primaryDarkColor", v)} />
                  <ColourField label="Cards and panels" hint="Listing cards, the filters sidebar, menus, and the search box." value={theme.surfaceColor} onChange={(v) => set("surfaceColor", v)} />
                  <ColourField label="Logo areas, tags, and hover" hint="Tinted fill behind logos, tags, chips, and when you hover a row. Also the default panel colour if an entry has none of its own." value={theme.surfaceAltColor} onChange={(v) => set("surfaceAltColor", v)} />
                  <ColourField label="Main text" value={theme.inkColor} onChange={(v) => set("inkColor", v)} contrast={contrastOf(theme.inkColor, bgHex)} />
                  <ColourField label="Secondary text" hint="Descriptions, addresses, breadcrumbs, and empty-state notes." value={theme.mutedColor} onChange={(v) => set("mutedColor", v)} contrast={contrastOf(theme.mutedColor, bgHex)} />
                  <ColourField label="Borders and dividers" value={theme.lineColor} onChange={(v) => set("lineColor", v)} />
                  <ColourField label="Badge background" hint="Also the homepage search band." value={theme.sageColor} onChange={(v) => set("sageColor", v)} />
                  <ColourField label="Badge text" value={theme.sageInkColor} onChange={(v) => set("sageInkColor", v)} contrast={contrastOf(theme.sageInkColor, theme.sageColor)} />
                </div>
              </details>
            </div>
          )}

          {tab === "typography" && (
            <div className="xp-card">
              <h2>Typography</h2>
              <p className="xp-help">Fonts and text sizes for headings and body copy.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                {[["fontHeading", "Heading font"], ["fontBody", "Body font"]].map(([key, label]) => (
                  <label key={key} style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                    {label}
                    <select className="xp-input" value={theme[key]} onChange={(e) => set(key, e.target.value)}>
                      {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <span style={{ fontFamily: `"${theme[key]}", ${key === "fontHeading" ? "serif" : "sans-serif"}`, fontSize: 18, fontWeight: 400 }}>
                      The quick brown fox
                    </span>
                  </label>
                ))}
              </div>
              <h3>Text sizes</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <tbody>
                    <FontSizeRow label="Body" value={theme.fontSizeBase} onChange={(v) => set("fontSizeBase", v)} unit="px" min={12} max={22} step={1} fallback={16} sampleFont={`"${theme.fontBody}", sans-serif`} sampleText="Body text sample" />
                    <FontSizeRow label="Heading 1" value={theme.fontSizeH1} onChange={(v) => set("fontSizeH1", v)} unit="rem" min={1.5} max={4} step={0.1} fallback={2.5} sampleFont={`"${theme.fontHeading}", serif`} sampleText="Heading one" />
                    <FontSizeRow label="Heading 2" value={theme.fontSizeH2} onChange={(v) => set("fontSizeH2", v)} unit="rem" min={1.25} max={3} step={0.1} fallback={2} sampleFont={`"${theme.fontHeading}", serif`} sampleText="Heading two" />
                    <FontSizeRow label="Heading 3" value={theme.fontSizeH3} onChange={(v) => set("fontSizeH3", v)} unit="rem" min={1} max={2.5} step={0.1} fallback={1.5} sampleFont={`"${theme.fontHeading}", serif`} sampleText="Heading three" />
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "header" && (
            <div className="xp-card">
              <h2>Header</h2>
              <p className="xp-help">The bar across the top of every page. Logo and site name are set in <button type="button" className="xp-btn" style={{ minHeight: 0, padding: "0 4px", border: 0, background: "none", color: "#0b6b70", textDecoration: "underline" }} onClick={() => setTab("identity")}>Logo &amp; identity</button>.</p>
              <GradientBackgroundField name="header-bg" label="Background" value={theme.headerBackground} onChange={(v) => set("headerBackground", v)} fallbackColor={HEADER_BG_DEFAULT.color} />
              <ColourField label="Text colour" hint="Site name and navigation links" value={theme.headerText} onChange={(v) => set("headerText", v)} contrast={contrastOf(theme.headerText, theme.headerBackground)} />
            </div>
          )}

          {tab === "hero" && (
            <div className="xp-card">
              <h2>Hero banner</h2>
              <p className="xp-help">A full-width image behind the header and the top of every published page.</p>
              {theme.heroBannerUrl ? (
                <div className="xp-row">
                  <img src={theme.heroBannerUrl} alt="Current hero banner" style={{ height: 56, width: 112, objectFit: "cover", borderRadius: 6, border: "1px solid var(--lc-border)" }} />
                  <button type="button" className="xp-btn" disabled={!!uploading} onClick={() => heroInput.current?.click()}>{uploading === "heroBanner" ? "Uploading…" : "Replace"}</button>
                  <button type="button" className="xp-btn" onClick={() => set("heroBannerUrl", "")}>Remove</button>
                </div>
              ) : (
                <div className="xp-drop">
                  <button type="button" className="xp-btn xp-btn-primary" disabled={!!uploading} onClick={() => heroInput.current?.click()}>{uploading === "heroBanner" ? "Uploading…" : "Upload banner"}</button>
                  <span className="xp-help">Wide PNG, JPG or WebP, up to 5 MB.</span>
                </div>
              )}
              <input ref={heroInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload("heroBanner", uploadDirectoryHeroBanner, "heroBannerUrl")} />
              {theme.heroBannerUrl && (
                <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
                  Banner height ({theme.heroBannerHeight}px)
                  <input type="range" min={160} max={800} value={theme.heroBannerHeight} onChange={(e) => set("heroBannerHeight", Number(e.target.value))} />
                </label>
              )}
              <p className="xp-help" style={{ background: "#eef6f6", borderRadius: 8, padding: 10 }}>
                While a banner is set, the header goes 40% transparent so the image shows through, and the image runs 100px past this height. It fades into the page background colour so cards and body text sit on a solid colour.
              </p>
            </div>
          )}

          {tab === "footer" && (
            <div className="xp-card">
              <h2>Footer</h2>
              <p className="xp-help">The bar at the bottom of every page.</p>
              <label className="xp-row" style={{ fontSize: 14, minHeight: 44 }}>
                <input
                  type="checkbox"
                  style={{ width: 20, height: 20, accentColor: "#12828a" }}
                  checked={theme.footerLinkedToHeader === true}
                  onChange={(e) => patch(e.target.checked ? { footerLinkedToHeader: true, footerBackground: theme.headerBackground } : { footerLinkedToHeader: false })}
                />
                Match header
              </label>
              <GradientBackgroundField name="footer-bg" label="Background" value={theme.footerBackground} onChange={(v) => set("footerBackground", v)} fallbackColor={FOOTER_BG_DEFAULT.color} disabled={theme.footerLinkedToHeader === true} collapseStops />
              <div>
                <ColourField label="Text" value={theme.footerText} onChange={(v) => set("footerText", v)} contrast={contrastOf(theme.footerText, theme.footerBackground)} />
                <ColourField label="Links" value={theme.footerLink} onChange={(v) => set("footerLink", v)} contrast={contrastOf(theme.footerLink, theme.footerBackground)} />
                <ColourField label="Links on hover" value={theme.footerLinkHover} onChange={(v) => set("footerLinkHover", v)} contrast={contrastOf(theme.footerLinkHover, theme.footerBackground)} />
              </div>
            </div>
          )}
        </div>

        <div className="xp-previewcol">
          <SitePreview theme={theme} directoryName={directory?.name} highlight={HIGHLIGHT[tab]} />
        </div>
      </div>

      <SaveBar
        dirtyCount={dirtyCount}
        saving={saving}
        error={err}
        savedAt={savedAt}
        publishHref={`${basePath}/publishing`}
        PublishLink={Link}
        onDiscard={() => setDialog({ kind: "discard" })}
        onSave={save}
      />

      {dialog?.kind === "save" && <NameDialog title="Save current as theme" label="Theme name" confirmLabel="Save theme" busy={presetBusy} onSubmit={saveAsTheme} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "rename" && <NameDialog title="Rename theme" label="Theme name" initial={dialog.preset.name} confirmLabel="Rename" busy={presetBusy} onSubmit={(n) => renameTheme(dialog.preset, n)} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "delete" && <ConfirmDialog title="Delete theme?" message={`Delete "${dialog.preset.name}"? This can't be undone. Directories already using these colours keep them.`} confirmLabel="Delete" danger onConfirm={() => deleteTheme(dialog.preset)} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "apply" && <ConfirmDialog title={`Apply ${dialog.name}?`} message="You have unsaved changes. Applying a theme will overwrite the colours, fonts, header and footer you've edited." confirmLabel="Apply theme" onConfirm={dialog.run} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "discard" && <ConfirmDialog title="Discard changes?" message={`Revert ${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"} to the last saved look?`} confirmLabel="Discard" danger onConfirm={() => { setTheme(base); setErr(""); setDialog(null); }} onCancel={() => setDialog(null)} />}
    </div>
  );
}
