import React from "react";
import {
  FOOTER_BG_DEFAULT,
  HEADER_BG_DEFAULT,
  HERO_BANNER_HEIGHT_DEFAULT,
  LOGO_HEIGHT_DEFAULT,
  applyAlphaToCssColors,
  backgroundToCss,
  lengthAmount,
} from "../../lib/directoryThemeDraft.js";

const REGION_LABELS = { header: "header", hero: "hero banner", body: "body", footer: "footer" };

/**
 * Miniature published-site mock (browser bar, header, hero strip, body, footer) driven by the
 * UNSAVED draft theme. A simplified React stand-in mirroring the CSS values generate_directory_site
 * computes — builders.ts is Deno code and can't be imported here, so defaults are hand-synced in
 * directoryThemeDraft.js. `highlight` outlines the region the active tab edits.
 */
export default function SitePreview({ theme, directoryName, highlight = null }) {
  const headerBgRaw = backgroundToCss(theme.headerBackground, HEADER_BG_DEFAULT.color);
  const hasBanner = !!theme.heroBannerUrl;
  const headerBg = hasBanner ? applyAlphaToCssColors(headerBgRaw, 0.6) : headerBgRaw;
  const footerBg = backgroundToCss(theme.footerBackground, FOOTER_BG_DEFAULT.color);
  const name = theme.siteTitle?.trim() || directoryName || "Your Directory";
  const showLogo = theme.headerMode !== "text";
  const showName = theme.showHeaderTitle !== false && theme.headerMode !== "logo";
  const logoH = Math.round(Math.min(40, Math.max(16, (theme.logoMaxHeight || LOGO_HEIGHT_DEFAULT) * 0.3)));
  const bannerH = Math.min(90, Math.max(36, Math.round(((theme.heroBannerHeight || HERO_BANNER_HEIGHT_DEFAULT) + 100) * 0.15)));
  const baseSize = lengthAmount(theme.fontSizeBase, "px", 16) * 0.75;
  const h1 = lengthAmount(theme.fontSizeH1, "rem", 2.5) * 7;
  const hl = (r) => (highlight === r ? "true" : "false");
  const headingFont = `"${theme.fontHeading}", serif`;
  const bodyFont = `"${theme.fontBody}", sans-serif`;

  return (
    <div>
      <p className="xp-help" style={{ marginBottom: 6 }} aria-live="polite">
        {highlight ? <>Editing: <strong>{REGION_LABELS[highlight]}</strong></> : "Preview of your published site"}
      </p>
      <div className="xp-sitepreview" aria-label="Site preview">
        <style>{`.xp-pv-flink:hover { color: ${theme.footerLinkHover || theme.footerLink} !important; }`}</style>
        <div className="xp-browserbar" aria-hidden="true"><i /><i /><i /><span style={{ marginLeft: 8, color: "#5b6470", fontSize: 11 }}>{(directoryName || "directory").toLowerCase().replace(/\s+/g, "-")}.com</span></div>
        <div style={{ background: theme.backgroundColor, position: "relative" }}>
          <div className="xp-region" data-hl={hl("hero")} style={{ position: "absolute", inset: "0 0 auto 0", height: hasBanner ? bannerH + 40 : 0, pointerEvents: "none", backgroundImage: hasBanner ? `linear-gradient(to bottom, transparent 20%, ${theme.backgroundColor} 92%), url(${JSON.stringify(theme.heroBannerUrl)})` : undefined, backgroundSize: "cover", backgroundPosition: "center top" }} />
          <div className="xp-region" data-hl={hl("header")} style={{ position: "relative", background: headerBg, color: theme.headerText, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            {showLogo && (theme.logoUrl ? <img src={theme.logoUrl} alt="" style={{ height: logoH, width: "auto", objectFit: "contain" }} /> : <div style={{ width: logoH, height: logoH, borderRadius: 6, background: theme.primaryColor }} />)}
            {showName && <strong style={{ fontFamily: headingFont }}>{name}</strong>}
          </div>
          {highlight === "hero" && !hasBanner && (
            <div className="xp-region" data-hl="true" style={{ position: "relative", height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#5b6470" }}>No banner yet</div>
          )}
          <div className="xp-region" data-hl={hl("body")} style={{ position: "relative", padding: 14, color: theme.inkColor, fontFamily: bodyFont, fontSize: baseSize, display: "grid", gap: 8 }}>
            <div style={{ fontFamily: headingFont, fontSize: Math.min(26, h1), fontWeight: 700 }}>Find an organisation</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: theme.surfaceColor, border: `1px solid ${theme.lineColor}`, borderRadius: 8, padding: "6px 10px" }}>
              <span aria-hidden="true" style={{ color: theme.accentColor, fontWeight: 700 }}>✦</span>
              <span style={{ color: theme.mutedColor }}>Search the directory…</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {["Academy of Medical Educators", "Royal Society Example"].map((n) => (
                <div key={n} style={{ background: theme.surfaceColor, border: `1px solid ${theme.lineColor}`, borderRadius: 8, padding: 8 }}>
                  <div style={{ fontWeight: 600 }}>{n}</div>
                  <div style={{ color: theme.mutedColor, fontSize: baseSize * 0.9 }}>Cardiff</div>
                </div>
              ))}
            </div>
            <div><span style={{ display: "inline-block", background: theme.primaryColor, color: "#fff", borderRadius: 6, padding: "5px 10px", fontWeight: 600 }}>View all</span> <a href="#" onClick={(e) => e.preventDefault()} style={{ color: theme.primaryColor }}>link</a></div>
          </div>
          <div className="xp-region" data-hl={hl("footer")} style={{ position: "relative", background: footerBg, color: theme.footerText, padding: "10px 14px", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: headingFont }}>{name}</span>
            <a href="#" className="xp-pv-flink" onClick={(e) => e.preventDefault()} style={{ color: theme.footerLink }}>Browse all entries</a>
          </div>
        </div>
      </div>
    </div>
  );
}
