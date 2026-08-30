import React from "react";

/**
 * Renders one entry-page layout block for a live preview pane — a
 * simplified visual approximation of generate_directory_site's real HTML,
 * not a byte-for-byte match (this runs client-side against live Supabase
 * data, not the static generator). Shared by EntryLayoutDesigner.jsx (the
 * layout designer's own preview) and the entry editor's Preview & Publish
 * tab, per DIR-E6-S2's "renders using a real entry ... or a placeholder if
 * the directory has none yet".
 */
export default function PreviewBlock({ block, entry, extras }) {
  if (!entry) {
    const placeholders = {
      logo: "Logo image",
      heading: "Entry name",
      address_map: "123 Example Street, City, Postcode",
      contact_details: "Phone · Email · Website",
      hero: "Hero image",
      gallery: "Photo gallery",
      accreditations: "Accreditation badges",
      notes_html: "Notes go here.",
      evidence: "Evidence",
      product_tiles: "Product tiles",
      links: "Links",
    };
    const label = block.type === "categorisation" ? `${block.key} tags` : placeholders[block.type] ?? block.type;
    return <div style={{ padding: "10px 12px", background: "#f9fafb", borderRadius: 6, fontSize: 12, opacity: 0.6, marginBottom: 6 }}>{label}</div>;
  }

  const wrap = (content) => (content ? <div style={{ marginBottom: 8 }}>{content}</div> : null);

  switch (block.type) {
    case "logo":
      return entry.logo_url ? wrap(<img src={entry.logo_url} alt="" style={{ height: 40 }} />) : null;
    case "heading":
      return wrap(<h3 style={{ margin: 0 }}>{entry.name}</h3>);
    case "address_map": {
      const loc = entry.show_address ? [entry.address, entry.city, entry.postcode, entry.country].filter(Boolean).join(", ") : "";
      return loc ? wrap(<p style={{ margin: 0, fontSize: 13 }}>{loc}</p>) : null;
    }
    case "contact_details": {
      const parts = [
        entry.show_phone && entry.phone ? `Phone: ${entry.phone}` : null,
        entry.show_email && entry.email ? `Email: ${entry.email}` : null,
        entry.show_website && entry.website_url ? "Website" : null,
      ].filter(Boolean);
      return parts.length ? wrap(<p style={{ margin: 0, fontSize: 13 }}>{parts.join(" · ")}</p>) : null;
    }
    case "hero": {
      const hero = extras.media?.find((m) => m.is_hero);
      return hero ? wrap(<img src={hero.url} alt={hero.alt_text || ""} style={{ maxWidth: "100%", borderRadius: 6 }} />) : null;
    }
    case "gallery": {
      const rest = (extras.media ?? []).filter((m) => !m.is_hero);
      return rest.length ? wrap(<div style={{ fontSize: 12, opacity: 0.7 }}>{rest.length} more photo{rest.length === 1 ? "" : "s"}</div>) : null;
    }
    case "accreditations": {
      const held = extras.accreditations ?? [];
      return held.length
        ? wrap(<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{held.map((a) => <span key={a.id} style={{ fontSize: 11, background: "#f3f4f6", borderRadius: 999, padding: "2px 8px" }}>{a.name}</span>)}</div>)
        : null;
    }
    case "notes_html":
      return entry.notes_html ? wrap(<div style={{ fontSize: 13 }} dangerouslySetInnerHTML={entry.allow_html ? { __html: entry.notes_html } : undefined}>{entry.allow_html ? undefined : entry.notes_html}</div>) : null;
    case "evidence": {
      const items = extras.evidence ?? [];
      return items.length ? wrap(<div style={{ fontSize: 12, opacity: 0.7 }}>{items.length} evidence item{items.length === 1 ? "" : "s"}</div>) : null;
    }
    case "product_tiles": {
      const tiles = extras.tiles ?? [];
      return tiles.length ? wrap(<div style={{ fontSize: 12, opacity: 0.7 }}>{tiles.length} product tile{tiles.length === 1 ? "" : "s"}</div>) : null;
    }
    case "links": {
      const links = extras.links ?? [];
      return links.length
        ? wrap(<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{links.map((l) => <span key={l.id} style={{ fontSize: 12, background: l.style === "primary" ? "#2563eb" : "#f3f4f6", color: l.style === "primary" ? "#fff" : "#111827", borderRadius: 6, padding: "4px 10px" }}>{l.label}</span>)}</div>)
        : null;
    }
    case "categorisation": {
      const terms = (extras.termsByKey ?? {})[block.key] ?? [];
      return terms.length
        ? wrap(<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{terms.map((t) => <span key={t.id} style={{ fontSize: 11, background: "#f3f4f6", borderRadius: 999, padding: "2px 8px" }}>{t.label}</span>)}</div>)
        : null;
    }
    default:
      return null;
  }
}
