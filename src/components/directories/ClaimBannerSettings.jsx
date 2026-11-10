import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { themeFromDirectory } from "../../lib/directoryThemeDraft.js";
import {
  CLAIM_BANNER_LIMITS,
  CLAIM_BANNER_VARIABLES,
  SAMPLE_ORG_NAME,
  claimBannerContrastWarnings,
  resolveClaimVars,
  validateClaimBanner,
} from "../../lib/claimBanner.js";

const inputStyle = { width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13, boxSizing: "border-box" };
const labelStyle = { fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 };
const hintStyle = { margin: "4px 0 0", fontSize: 12, opacity: 0.65 };
const errStyle = { margin: "4px 0 0", fontSize: 12, color: "#b91c1c" };
const warnStyle = { margin: "4px 0 0", fontSize: 12, color: "#b45309" };

function TextField({ id, label, value, onChange, disabled, max, multiline, withVariables, error, warnings, hint }) {
  const ref = useRef(null);
  function insertVariable(name) {
    const token = `{{${name}}}`;
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }
  const Tag = multiline ? "textarea" : "input";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor={id}>{label}</label>
        {withVariables && !disabled && (
          <select
            aria-label={`Insert variable into ${label.toLowerCase()}`}
            value=""
            onChange={(e) => e.target.value && insertVariable(e.target.value)}
            style={{ fontSize: 12, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--lc-border)" }}
          >
            <option value="">Insert variable…</option>
            {CLAIM_BANNER_VARIABLES.map((v) => (
              <option key={v.name} value={v.name}>{`{{${v.name}}}`} · {v.label}</option>
            ))}
          </select>
        )}
      </div>
      <Tag
        id={id}
        ref={ref}
        type={multiline ? undefined : "text"}
        rows={multiline ? 3 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={max}
        style={{ ...inputStyle, resize: multiline ? "vertical" : undefined }}
      />
      <p style={hintStyle}>{hint ? `${hint} ` : ""}{value.length}/{max}</p>
      {error && <p style={errStyle}>{error}</p>}
      {(warnings ?? []).map((w) => <p key={w} style={warnStyle}>{w}</p>)}
    </div>
  );
}

function ColourField({ id, label, value, onChange, disabled, error }) {
  const valid = /^#[0-9A-Fa-f]{6}$/.test(value);
  return (
    <div>
      <label style={labelStyle} htmlFor={id}>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          style={{ width: 36, height: 32, padding: 0, border: "1px solid var(--lc-border)", borderRadius: 6, background: "none" }}
        />
        <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={7} style={{ ...inputStyle, width: 110 }} />
      </div>
      {error && <p style={errStyle}>{error}</p>}
    </div>
  );
}

/** Live preview of the banner using the directory's fonts and the unsaved form values. */
function BannerPreview({ banner, orgName, theme, mobile }) {
  const vars = { org_name: orgName };
  const heading = resolveClaimVars(banner.heading, vars);
  const body = resolveClaimVars(banner.body, vars);
  const button = resolveClaimVars(banner.buttonLabel, vars);
  const showSecondary = banner.secondaryLabel && banner.secondaryUrl;
  const btn = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 8,
    padding: "13px 20px", fontSize: 14, fontWeight: 700, background: banner.accentColour, color: banner.buttonTextColour,
    fontFamily: "inherit", minHeight: mobile ? 44 : undefined, width: mobile ? "100%" : undefined,
  };
  const icon = (
    <div aria-hidden="true" style={{ flex: "none", width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: `1px solid ${banner.borderColour}`, borderRadius: 12, color: banner.accentColour }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" /></svg>
    </div>
  );
  const h2 = <h2 style={{ margin: mobile ? 0 : "0 0 4px", fontSize: 20, fontWeight: 600, lineHeight: 1.25, fontFamily: theme.fontHeading }}>{heading}</h2>;
  const p = <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: theme.mutedColor }}>{body}</p>;
  const secondary = showSecondary && (
    <span style={{ fontSize: 13, fontWeight: 600, color: theme.primaryColor, minHeight: mobile ? 44 : undefined, display: "flex", alignItems: "center", justifyContent: "center", order: 2 }}>{banner.secondaryLabel}</span>
  );
  const arrow = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  const shell = { background: banner.backgroundColour, border: `1px solid ${banner.borderColour}`, borderRadius: 12, padding: "20px 24px", fontFamily: theme.fontBody, color: theme.inkColor, textAlign: "left" };
  if (mobile) {
    return (
      <section aria-label="Claim banner preview" style={{ ...shell, display: "grid", gap: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>{icon}{h2}</div>
        {p}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...btn, order: 1 }}>{button}{arrow}</span>
          {secondary}
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Claim banner preview" style={{ ...shell, display: "flex", alignItems: "center", gap: 20 }}>
      {icon}
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>{h2}{p}</div>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 20 }}>
        {showSecondary && <span style={{ fontSize: 13, fontWeight: 600, color: theme.primaryColor }}>{banner.secondaryLabel}</span>}
        <span style={btn}>{button}{arrow}</span>
      </div>
    </section>
  );
}

/**
 * Claim banner fields + live preview for Claims → Settings. Controlled: `banner`
 * holds the unsaved form values (see lib/claimBanner.js), `enabled` is the
 * directory's existing "Claims enabled" flag (text is only required while on).
 */
export default function ClaimBannerSettings({ directoryId, banner, onChange, disabled, enabled, showErrors }) {
  const [theme, setTheme] = useState(() => themeFromDirectory(null));
  const [orgName, setOrgName] = useState(SAMPLE_ORG_NAME);
  const [mobile, setMobile] = useState(false);
  const set = (key) => (value) => onChange({ ...banner, [key]: value });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: dir }, { data: entry }] = await Promise.all([
        supabase.from("directories").select("theme_json").eq("id", directoryId).maybeSingle(),
        supabase.from("directory_entries").select("name").eq("directory_id", directoryId).eq("is_active", true).is("current_claim_id", null).order("name", { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      if (dir) setTheme(themeFromDirectory(dir));
      if (entry?.name) setOrgName(entry.name);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [directoryId]);

  // The preview should use the directory's real fonts. Same Google Fonts provider the app already loads in index.html.
  useEffect(() => {
    const names = [...new Set([theme.fontHeading, theme.fontBody].filter(Boolean))];
    if (!names.length) return undefined;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${names.map((n) => `family=${encodeURIComponent(n).replace(/%20/g, "+")}:wght@400;600;700`).join("&")}&display=swap`;
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [theme.fontHeading, theme.fontBody]);

  const { errors, warnings } = useMemo(() => validateClaimBanner(banner, { enabled }), [banner, enabled]);
  const contrast = useMemo(() => claimBannerContrastWarnings(banner, theme.mutedColor), [banner, theme.mutedColor]);
  const err = (key) => (showErrors ? errors[key] : undefined);

  return (
    <fieldset style={{ border: "1px solid var(--lc-border)", borderRadius: 10, padding: 16, margin: 0, display: "grid", gap: 14 }}>
      <legend style={{ fontSize: 14, fontWeight: 600, padding: "0 6px" }}>Claim banner</legend>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.65 }}>
        Shown between the heading and the details of every unclaimed listing while claims are enabled. Changes reach the public site the next time the directory is published.
        Variables you can use in the heading, body and button label: {CLAIM_BANNER_VARIABLES.map((v) => `{{${v.name}}} (${v.label.toLowerCase()})`).join(", ")}.
      </p>

      <TextField id="claim-banner-heading" label="Heading" value={banner.heading} onChange={set("heading")} disabled={disabled} max={CLAIM_BANNER_LIMITS.heading} withVariables error={err("heading")} warnings={warnings.heading} />
      <TextField id="claim-banner-body" label="Body text" value={banner.body} onChange={set("body")} disabled={disabled} max={CLAIM_BANNER_LIMITS.body} multiline withVariables error={err("body")} warnings={warnings.body} />
      <TextField id="claim-banner-button" label="Button label" value={banner.buttonLabel} onChange={set("buttonLabel")} disabled={disabled} max={CLAIM_BANNER_LIMITS.buttonLabel} withVariables error={err("buttonLabel")} warnings={warnings.buttonLabel} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <TextField id="claim-banner-secondary-label" label="Secondary link label" value={banner.secondaryLabel} onChange={set("secondaryLabel")} disabled={disabled} max={CLAIM_BANNER_LIMITS.secondaryLabel} error={err("secondaryLabel")} />
        <TextField id="claim-banner-secondary-url" label="Secondary link URL" value={banner.secondaryUrl} onChange={set("secondaryUrl")} disabled={disabled} max={CLAIM_BANNER_LIMITS.secondaryUrl} error={err("secondaryUrl")} hint="https:// or a path starting with /. The link is hidden unless both label and URL are set." />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <ColourField id="claim-banner-accent" label="Button & icon colour" value={banner.accentColour} onChange={set("accentColour")} disabled={disabled} error={err("accentColour")} />
        <ColourField id="claim-banner-btn-text" label="Button text colour" value={banner.buttonTextColour} onChange={set("buttonTextColour")} disabled={disabled} error={err("buttonTextColour")} />
        <ColourField id="claim-banner-bg" label="Banner background" value={banner.backgroundColour} onChange={set("backgroundColour")} disabled={disabled} error={err("backgroundColour")} />
        <ColourField id="claim-banner-border" label="Banner border" value={banner.borderColour} onChange={set("borderColour")} disabled={disabled} error={err("borderColour")} />
      </div>

      {contrast.length > 0 && (
        <div role="status">
          {contrast.map((c) => <p key={c.field + c.label} style={warnStyle}>{c.message}</p>)}
        </div>
      )}

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Preview <span style={{ opacity: 0.6, fontWeight: 400 }}>· sample listing: {orgName}</span></span>
          <div role="group" aria-label="Preview width" style={{ display: "flex", gap: 4 }}>
            {[["Desktop", false], ["Mobile", true]].map(([label, isMobile]) => (
              <button key={label} type="button" className="btn" aria-pressed={mobile === isMobile} onClick={() => setMobile(isMobile)} style={{ fontSize: 12, padding: "3px 10px", fontWeight: mobile === isMobile ? 700 : 400 }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ background: "#fff", padding: 16, border: "1px dashed var(--lc-border)", borderRadius: 8, overflowX: "auto" }}>
          <div style={{ width: mobile ? 343 : "100%", maxWidth: "100%", margin: "0 auto" }}>
            <BannerPreview banner={banner} orgName={orgName} theme={theme} mobile={mobile} />
          </div>
        </div>
      </div>
    </fieldset>
  );
}
