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
import { AI_COLOUR_KEYS, resolveAiTokens, withoutAiColours } from "../../lib/askAiTheme.js";
import {
  Button,
  Callout,
  Checkbox,
  ColourField,
  ConfirmDialog,
  Field,
  NameDialog,
  OptionalColourField,
  OverflowMenu,
  Pill,
  RecordLayout,
  Section,
  SegmentedControl,
  Select,
  TextInput,
  contrastOf,
  useTabKeys,
  useUnsavedGuard,
} from "../ui/index.js";
import GradientBackgroundField, { RangeField } from "./GradientBackgroundField.jsx";
import SitePreview from "./SitePreview.jsx";
import "../../styles/wave-a/batch-4.css";
// SitePreview (out of scope, previews the client's site) still depends on the xp-* rules in experience.css.
import "./experience.css";

const FONT_OPTIONS = Object.keys(FONT_CATALOG);

const TAB_GROUPS = [
  { label: "Whole site", tabs: [["theme", "Theme"], ["identity", "Logo & identity"], ["colours", "Colours"], ["askai", "Ask AI"], ["typography", "Typography"]] },
  { label: "Page areas", tabs: [["header", "Header"], ["hero", "Hero banner"], ["footer", "Footer"]] },
];
const TAB_IDS = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t[0]));
const HIGHLIGHT = { theme: null, identity: "header", colours: "body", askai: "askai", typography: "body", header: "header", hero: "hero", footer: "footer" };

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
  // dynamic: the colours of the theme being previewed
  return (
    <div className="b4-swatchbar" aria-hidden="true">
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
      <th scope="row">{label}</th>
      <td>
        <span className="b4-row b4-row--nowrap">
          <TextInput
            className="b4-input-xs"
            type="number"
            aria-label={`${label} (${unit})`}
            min={min}
            max={max}
            step={step}
            value={amount}
            onChange={(e) => onChange(`${Math.min(max, Math.max(min, Number(e.target.value)))}${unit}`)}
          />
          <span className="field-hint">{unit}</span>
        </span>
      </td>
      {/* dynamic: sample text shown in the chosen font and size */}
      <td className="b4-sample-cell" style={{ fontFamily: sampleFont }}>
        <span className="b4-sample" style={{ fontSize: unit === "px" ? `${amount}px` : `${Math.min(amount, 2.2)}rem` }}>{sampleText}</span>
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
  const [aiToken, setAiToken] = useState(null); // token whose field is hovered/focused, outlined in the preview

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
      const saved = await saveThemePreset(clientId, name, withoutAiColours(withoutRetiredColours(theme)));
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


  if (!canManage) return <Callout tone="info">Only an Owner or Manager can change the look and feel.</Callout>;

  const bgHex = theme.backgroundColor;
  const aiResolved = resolveAiTokens(theme);
  const aiPromptSet = !!directory?.ai_search_prompt?.trim();
  const aiAnySet = AI_COLOUR_KEYS.some((k) => theme[k]);
  const aiField = (key, label, hint, contrast) => (
    <div key={key} onMouseEnter={() => setAiToken(key)} onMouseLeave={() => setAiToken(null)} onFocus={() => setAiToken(key)} onBlur={() => setAiToken(null)}>
      <OptionalColourField label={label} hint={hint} value={theme[key]} fallback={aiResolved[key]} onChange={(v) => set(key, v)} contrast={contrast} />
    </div>
  );
  const liveUrl = directory?.published_at && client?.slug && directory?.slug ? `https://maps.layercake-cx.biz/directories/${client.slug}/${directory.slug}` : null;

  const headActions = liveUrl ? (
    <Button as="a" href={liveUrl} target="_blank" rel="noopener noreferrer">Open live site ↗</Button>
  ) : (
    <Button as={Link} to={`${basePath}/publishing`}>Publishing →</Button>
  );

  return (
    <RecordLayout
      head={{
        breadcrumb: [{ label: "Experience" }, { label: "Look & feel" }],
        title: "Look & feel",
        subtitle: "How the published directory looks to visitors. Edits stay unsaved until you save, and go live when you publish.",
        actions: headActions,
      }}
      preview={<SitePreview theme={theme} directoryName={directory?.name} highlight={HIGHLIGHT[tab]} aiToken={aiToken} />}
      saveBar={{
        dirtyCount,
        saving,
        error: err,
        savedAt,
        publishHref: `${basePath}/publishing`,
        PublishLink: Link,
        onDiscard: () => setDialog({ kind: "discard" }),
        onSave: save,
      }}
    >
      <div role="tablist" aria-label="Look and feel sections" className="b4-tabs" onKeyDown={onTabKey}>
        {TAB_GROUPS.map((g) => (
          <div key={g.label} className="b4-tabgroup" role="presentation">
            <span className="b4-tabgroup-label" aria-hidden="true">{g.label}</span>
            <div className="b4-tabgroup-row" role="presentation">
              {g.tabs.map(([id, label]) => (
                <button
                  key={id}
                  id={`xp-tab-${id}`}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={tab === id}
                  aria-current={tab === id ? "page" : undefined}
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

      <div className="b4-panel" role="tabpanel" id={`xp-panel-${tab}`} aria-labelledby={`xp-tab-${tab}`} tabIndex={0}>
        {tab === "theme" && (
          <>
            <Section
              title="Theme"
              description="Start from a ready-made look, or reuse one your organisation saved. Applying a theme replaces colours, fonts, header and footer styling. Built-in themes keep your logo, favicon, banner, site name and text sizes; themes you saved also bring the logo, favicon and banner they were saved with."
            />
            {clientId && (
              <Section
                title="Your themes"
                as="h3"
                actions={<Button onClick={() => setDialog({ kind: "save" })}>Save current as theme</Button>}
              >
                {orgPresets.length === 0 && <p className="field-hint">No saved themes yet. Save the current look to reuse it later.</p>}
                <div className="b4-themegrid">
                  {orgPresets.map((p) => (
                    <div key={p.id} className="b4-themecard">
                      <Swatches values={p.theme_json || {}} />
                      <div className="b4-row b4-row--between b4-row--nowrap">
                        <div className="b4-stack b4-stack--tight">
                          <div className="b4-themename">{p.name}</div>
                          {themeInUse(theme, p.theme_json) && <Pill tone="ok">In use</Pill>}
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
              </Section>
            )}
            <Section title="Built-in themes" as="h3">
              <div className="b4-themegrid">
                {DIRECTORY_THEME_PRESETS.map((p) => (
                  <div key={p.key} className="b4-themecard">
                    <Swatches values={p.values} />
                    <div className="b4-themename">{p.label}</div>
                    <p className="field-hint">{p.description}</p>
                    <div className="b4-row b4-row--between">
                      {themeInUse(theme, p.values) ? <Pill tone="ok">In use</Pill> : <span />}
                      <Button size="sm" onClick={() => requestApply(getThemePreset(p.key), p.label, null)}>Apply</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {tab === "identity" && (
          <>
            <Section title="Logo & identity" description="Your logo, site name and favicon, used across the whole published site.">
              <div className="b4-row b4-row--between">
                <h3 className="b4-subhead">Logo</h3>
                <Pill tone="neutral">Shown in: site header</Pill>
              </div>
              <div className="b4-row">
                {theme.logoUrl ? (
                  <img src={theme.logoUrl} alt="Current logo" className="b4-logo-preview" />
                ) : (
                  // dynamic: the directory's primary colour
                  <div aria-hidden="true" className="b4-logo-placeholder" style={{ background: theme.primaryColor }} />
                )}
                <Button disabled={!!uploading} onClick={() => logoInput.current?.click()}>
                  {uploading === "logo" ? "Uploading…" : theme.logoUrl ? "Replace" : "Upload logo"}
                </Button>
                {theme.logoUrl && <Button onClick={() => set("logoUrl", "")}>Remove</Button>}
                <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload("logo", uploadDirectoryLogo, "logoUrl")} />
              </div>
              <p className="field-hint">PNG, JPG or WebP, up to 2 MB.</p>
              <RangeField
                label="Logo height"
                hint={`${LOGO_HEIGHT_MIN}–${LOGO_HEIGHT_MAX} px. Width follows automatically.`}
                min={LOGO_HEIGHT_MIN}
                max={LOGO_HEIGHT_MAX}
                value={theme.logoMaxHeight}
                onChange={(v) => set("logoMaxHeight", v)}
                number={{
                  label: "Logo height in pixels",
                  unit: "px",
                  onChange: (e) => set("logoMaxHeight", Math.min(LOGO_HEIGHT_MAX, Math.max(LOGO_HEIGHT_MIN, Number(e.target.value) || LOGO_HEIGHT_DEFAULT))),
                }}
              />
            </Section>

            <Section title="Header shows" as="h3">
              <SegmentedControl
                label="Header shows"
                value={headerShowsOf(theme)}
                onChange={(v) => patch(headerShowsPatch(v))}
                options={[{ value: "logo", label: "Logo only" }, { value: "logoText", label: "Logo + site name" }, { value: "text", label: "Site name only" }]}
              />
              <Field
                label="Site name"
                hint="Leave blank to use the directory name. It also labels the logo link for screen readers, so it applies even when the header shows the logo only."
              >
                <TextInput value={theme.siteTitle} placeholder={directory?.name || ""} onChange={(e) => set("siteTitle", e.target.value)} />
              </Field>
            </Section>

            <Section title="Favicon" as="h3" actions={<Pill tone="neutral">Shown in: browser tab and bookmarks</Pill>}>
              <div className="b4-row">
                {theme.faviconUrl ? (
                  <img src={theme.faviconUrl} alt="Current favicon" className="b4-favicon-preview" />
                ) : (
                  <div aria-hidden="true" className="b4-favicon-placeholder" />
                )}
                <Button disabled={!!uploading} onClick={() => faviconInput.current?.click()}>
                  {uploading === "favicon" ? "Uploading…" : theme.faviconUrl ? "Replace" : "Upload favicon"}
                </Button>
                {theme.faviconUrl && <Button onClick={() => set("faviconUrl", "")}>Remove</Button>}
                <input ref={faviconInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload("favicon", uploadDirectoryFavicon, "faviconUrl")} />
              </div>
              <p className="field-hint">Square PNG, JPG or WebP, up to 2 MB. Save, then publish for it to appear.</p>
            </Section>
          </>
        )}

        {tab === "colours" && (
          <Section title="Colours" description="The palette used for links, buttons, highlights and page backgrounds. Badges show how readable each colour is on the page background.">
            <div className="b4-colour-list">
              <ColourField label="Primary" hint="Links and buttons" value={theme.primaryColor} onChange={(v) => set("primaryColor", v)} contrast={contrastOf(theme.primaryColor, bgHex)} />
              <ColourField label="Accent" hint="Highlights and the AI search icon" value={theme.accentColor} onChange={(v) => set("accentColor", v)} contrast={contrastOf(theme.accentColor, bgHex)} />
              <ColourField label="Page background" hint="Behind all page content" value={theme.backgroundColor} onChange={(v) => set("backgroundColor", v)} base />
            </div>
            <details className="b4-details">
              <summary>More colours</summary>
              <div className="b4-colour-list b4-details-body">
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
          </Section>
        )}

        {tab === "askai" && (
          <Section
            title="Ask AI"
            description={aiPromptSet ? "Colours for the Ask AI sidebar and its buttons on the published site. Anything left blank follows your Primary colour, so changing theme restyles Ask AI too. Hover a colour to see where it is used." : undefined}
          >
            {!aiPromptSet ? (
              <p className="field-hint">Turn on Ask AI in the <Link to={`${basePath}/search`}>AI tab</Link> to style it.</p>
            ) : (
              <>
                <div className="b4-colour-list">
                  {aiField("aiAccent", "Accent", "Panel avatar, Send button, pressed Ask AI button, “Picked by Ask AI” pill, picked map pins, View entry button")}
                  {aiField("aiOnAccent", "Text on accent", "Text and icons on accent surfaces", contrastOf(aiResolved.aiOnAccent, aiResolved.aiAccent))}
                  {aiField("aiTint", "Tint", "Ask AI button, “Narrow with AI” chip, assistant avatar, reason strips, context bar")}
                  {aiField("aiTintText", "Text on tint", "Text and icons on tint surfaces, chip text", contrastOf(aiResolved.aiTintText, aiResolved.aiTint))}
                  {aiField("aiBorder", "Border", "Chip borders, composer border, outline buttons")}
                  {aiField("aiPanelBg", "Panel background", "Behind the conversation")}
                  {aiField("aiUserBubble", "Your message bubble", "Visitor messages")}
                  {aiField("aiUserBubbleText", "Your message text", "Text in visitor messages", contrastOf(aiResolved.aiUserBubbleText, aiResolved.aiUserBubble))}
                  {aiField("aiLauncherBg", "Launcher", "The floating “Ask AI” button")}
                  {aiField("aiLauncherText", "Launcher text", "Text and icon on the launcher", contrastOf(aiResolved.aiLauncherText, aiResolved.aiLauncherBg))}
                </div>
                <Checkbox
                  label="Show the floating Ask AI button"
                  hint="When off, the button only appears while the panel is minimised."
                  checked={theme.aiShowLauncher !== false}
                  onChange={(e) => set("aiShowLauncher", e.target.checked ? undefined : false)}
                />
                <div className="b4-row">
                  <Button disabled={!aiAnySet} onClick={() => patch(Object.fromEntries(AI_COLOUR_KEYS.map((k) => [k, undefined])))}>Reset Ask AI colours</Button>
                </div>
              </>
            )}
          </Section>
        )}

        {tab === "typography" && (
          <Section title="Typography" description="Fonts and text sizes for headings and body copy.">
            <div className="b4-font-grid">
              {[["fontHeading", "Heading font"], ["fontBody", "Body font"]].map(([key, label]) => (
                <div key={key} className="b4-stack b4-stack--tight">
                  <Field label={label}>
                    <Select value={theme[key]} onChange={(e) => set(key, e.target.value)} options={FONT_OPTIONS.map((f) => ({ value: f, label: f }))} />
                  </Field>
                  {/* dynamic: sample in the chosen font */}
                  <span className="b4-font-sample" style={{ fontFamily: `"${theme[key]}", ${key === "fontHeading" ? "serif" : "sans-serif"}` }}>
                    The quick brown fox
                  </span>
                </div>
              ))}
            </div>
            <h3 className="b4-subhead">Text sizes</h3>
            <div className="b4-scroll-x">
              <table className="b4-sizes">
                <tbody>
                  <FontSizeRow label="Body" value={theme.fontSizeBase} onChange={(v) => set("fontSizeBase", v)} unit="px" min={12} max={22} step={1} fallback={16} sampleFont={`"${theme.fontBody}", sans-serif`} sampleText="Body text sample" />
                  <FontSizeRow label="Heading 1" value={theme.fontSizeH1} onChange={(v) => set("fontSizeH1", v)} unit="rem" min={1.5} max={4} step={0.1} fallback={2.5} sampleFont={`"${theme.fontHeading}", serif`} sampleText="Heading one" />
                  <FontSizeRow label="Heading 2" value={theme.fontSizeH2} onChange={(v) => set("fontSizeH2", v)} unit="rem" min={1.25} max={3} step={0.1} fallback={2} sampleFont={`"${theme.fontHeading}", serif`} sampleText="Heading two" />
                  <FontSizeRow label="Heading 3" value={theme.fontSizeH3} onChange={(v) => set("fontSizeH3", v)} unit="rem" min={1} max={2.5} step={0.1} fallback={1.5} sampleFont={`"${theme.fontHeading}", serif`} sampleText="Heading three" />
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {tab === "header" && (
          <Section
            title="Header"
            description={<>The bar across the top of every page. Logo and site name are set in <Button variant="ghost" size="sm" className="b4-link-btn" onClick={() => setTab("identity")}>Logo &amp; identity</Button>.</>}
          >
            <GradientBackgroundField name="header-bg" label="Background" value={theme.headerBackground} onChange={(v) => set("headerBackground", v)} fallbackColor={HEADER_BG_DEFAULT.color} />
            <ColourField label="Text colour" hint="Site name and navigation links" value={theme.headerText} onChange={(v) => set("headerText", v)} contrast={contrastOf(theme.headerText, theme.headerBackground)} />
          </Section>
        )}

        {tab === "hero" && (
          <Section title="Hero banner" description="A full-width image behind the header and the top of every published page.">
            {theme.heroBannerUrl ? (
              <div className="b4-row">
                <img src={theme.heroBannerUrl} alt="Current hero banner" className="b4-banner-preview" />
                <Button disabled={!!uploading} onClick={() => heroInput.current?.click()}>{uploading === "heroBanner" ? "Uploading…" : "Replace"}</Button>
                <Button onClick={() => set("heroBannerUrl", "")}>Remove</Button>
              </div>
            ) : (
              <div className="b4-drop">
                <Button variant="primary" disabled={!!uploading} onClick={() => heroInput.current?.click()}>{uploading === "heroBanner" ? "Uploading…" : "Upload banner"}</Button>
                <span className="field-hint">Wide PNG, JPG or WebP, up to 5 MB.</span>
              </div>
            )}
            <input ref={heroInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload("heroBanner", uploadDirectoryHeroBanner, "heroBannerUrl")} />
            {theme.heroBannerUrl && (
              <RangeField label={`Banner height (${theme.heroBannerHeight}px)`} min={160} max={800} value={theme.heroBannerHeight} onChange={(v) => set("heroBannerHeight", v)} />
            )}
            <Callout tone="info">
              While a banner is set, the header goes 40% transparent so the image shows through, and the image runs 100px past this height. It fades into the page background colour so cards and body text sit on a solid colour.
            </Callout>
          </Section>
        )}

        {tab === "footer" && (
          <Section title="Footer" description="The bar at the bottom of every page.">
            <Checkbox
              label="Match header"
              checked={theme.footerLinkedToHeader === true}
              onChange={(e) => patch(e.target.checked ? { footerLinkedToHeader: true, footerBackground: theme.headerBackground } : { footerLinkedToHeader: false })}
            />
            <GradientBackgroundField name="footer-bg" label="Background" value={theme.footerBackground} onChange={(v) => set("footerBackground", v)} fallbackColor={FOOTER_BG_DEFAULT.color} disabled={theme.footerLinkedToHeader === true} collapseStops />
            <div className="b4-colour-list">
              <ColourField label="Text" value={theme.footerText} onChange={(v) => set("footerText", v)} contrast={contrastOf(theme.footerText, theme.footerBackground)} />
              <ColourField label="Links" value={theme.footerLink} onChange={(v) => set("footerLink", v)} contrast={contrastOf(theme.footerLink, theme.footerBackground)} />
              <ColourField label="Links on hover" value={theme.footerLinkHover} onChange={(v) => set("footerLinkHover", v)} contrast={contrastOf(theme.footerLinkHover, theme.footerBackground)} />
            </div>
          </Section>
        )}
      </div>

      {dialog?.kind === "save" && <NameDialog title="Save current as theme" label="Theme name" confirmLabel="Save theme" busy={presetBusy} onSubmit={saveAsTheme} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "rename" && <NameDialog title="Rename theme" label="Theme name" initial={dialog.preset.name} confirmLabel="Rename" busy={presetBusy} onSubmit={(n) => renameTheme(dialog.preset, n)} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "delete" && <ConfirmDialog title="Delete theme?" message={`Delete "${dialog.preset.name}"? This can't be undone. Directories already using these colours keep them.`} confirmLabel="Delete" danger onConfirm={() => deleteTheme(dialog.preset)} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "apply" && <ConfirmDialog title={`Apply ${dialog.name}?`} message="You have unsaved changes. Applying a theme will overwrite the colours, fonts, header and footer you've edited." confirmLabel="Apply theme" onConfirm={dialog.run} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "discard" && <ConfirmDialog title="Discard changes?" message={`Revert ${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"} to the last saved look?`} confirmLabel="Discard" danger onConfirm={() => { setTheme(base); setErr(""); setDialog(null); }} onCancel={() => setDialog(null)} />}
    </RecordLayout>
  );
}
