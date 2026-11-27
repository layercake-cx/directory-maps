import React from "react";
import { Field, FieldGrid, SegmentedControl, Select, Switch, Textarea, TextInput } from "../ui/index.js";
import { DESC_MAX, TITLE_MAX, cut, seoChecks } from "../../lib/seoChecks.js";

const STRUCTURED_DATA_TYPES = ["LocalBusiness", "Organization", "Person"];
const ICON = { ok: "✓", warn: "!", bad: "×" };
const WORD = { ok: "OK", warn: "Check", bad: "Fix" };

/**
 * The SEO surface: the form on the left, previews and checks on the right (sticky). Values are part of the draft and
 * saved by Save draft. `fields` says which inputs this person may edit (a listing owner edits only title and
 * description; a site page has no social or structured-data columns).
 */
export default function SeoSurface({ kind, values, onChange, fields, urlPrefix, siteName, pageName, heroImageUrl, placeholderBlocks, disabled }) {
  const set = (k) => (v) => onChange({ [k]: v });
  const can = (k) => fields.has(k) && !disabled;
  const title = values.meta_title;
  const desc = values.meta_description;
  const checks = seoChecks({ title, description: desc, noindex: values.noindex, placeholderBlocks });
  const host = (urlPrefix ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const shareTitle = values.og_title || title || pageName;
  const shareDesc = values.og_description || desc;
  const shareImage = values.og_image_url || heroImageUrl;
  const customImage = !!values.og_image_url || values._customImage;
  const count = (n, max) => <span className={`fe-count${n > max ? " is-over" : ""}`}>{n} / {max}</span>;

  return (
    <div className="fe-seo">
      <div className="fe-seo__form">
        <fieldset className="fe-seo__group" disabled={disabled}>
          <legend>Search appearance</legend>
          <Field label="Meta title" hint="Shown as the link in search results and in the browser tab." count={{ value: (title ?? "").length, max: TITLE_MAX }}>
            <TextInput value={title ?? ""} onChange={(e) => set("meta_title")(e.target.value)} disabled={!can("meta_title")} />
          </Field>
          <Field label="Meta description" count={{ value: (desc ?? "").length, max: DESC_MAX }}>
            <Textarea rows={3} value={desc ?? ""} onChange={(e) => set("meta_description")(e.target.value)} disabled={!can("meta_description")} />
          </Field>
          <Field label="URL" hint={can("slug") ? "Changing a published URL adds a redirect from the old one." : "The address of this page."}>
            <div className="fe-slug"><span className="fe-slug__prefix">{urlPrefix ?? "/"}</span>
              <TextInput value={values.slug ?? ""} onChange={(e) => set("slug")(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} disabled={!can("slug")} />
            </div>
          </Field>
        </fieldset>

        {fields.has("og_title") ? (
          <fieldset className="fe-seo__group" disabled={disabled}>
            <legend>Social sharing</legend>
            <Field label="Share title"><TextInput value={values.og_title ?? ""} placeholder="Uses the meta title" onChange={(e) => set("og_title")(e.target.value)} /></Field>
            <Field label="Share description"><Textarea rows={2} value={values.og_description ?? ""} placeholder="Uses the meta description" onChange={(e) => set("og_description")(e.target.value)} /></Field>
            <SegmentedControl
              label="Share image"
              value={customImage ? "custom" : "hero"}
              options={[{ value: "hero", label: "Hero image" }, { value: "custom", label: "Web address" }]}
              onChange={(v) => onChange(v === "hero" ? { og_image_url: "", _customImage: false } : { _customImage: true })}
            />
            {customImage ? (
              <Field label="Image web address" hint="A public https:// address."><TextInput type="url" value={values.og_image_url ?? ""} onChange={(e) => set("og_image_url")(e.target.value)} /></Field>
            ) : <p className="field-hint">Uses this listing's hero image when it has one.</p>}
          </fieldset>
        ) : null}

        {fields.has("noindex") ? (
          <fieldset className="fe-seo__group" disabled={disabled}>
            <legend>Indexing</legend>
            <div className="fe-switchrow">
              <Switch aria-label="Allow search engines to index this page" checked={!values.noindex} onChange={(on) => set("noindex")(!on)} disabled={!can("noindex")} />
              <span><strong>Allow search engines to index this page</strong><span className="field-hint">Off adds a noindex tag. A page that is not indexed is also left out of the sitemap.</span></span>
            </div>
            {fields.has("canonical_url") ? (
              <Field label="Canonical URL (optional)"><TextInput type="url" value={values.canonical_url ?? ""} placeholder="Defaults to this page's own address" onChange={(e) => set("canonical_url")(e.target.value)} /></Field>
            ) : null}
            {fields.has("structured_data_type") ? (
              <FieldGrid>
                <Field label="Structured data" hint="FAQ blocks add their own FAQ data.">
                  <Select value={values.structured_data_type ?? ""} onChange={(e) => set("structured_data_type")(e.target.value)} options={[{ value: "", label: "Default" }, ...STRUCTURED_DATA_TYPES.map((x) => ({ value: x, label: x }))]} />
                </Field>
              </FieldGrid>
            ) : null}
          </fieldset>
        ) : null}
      </div>

      <aside className="fe-seo__side" aria-label="Previews and checks">
        <section className="fe-card" aria-label="Search result preview">
          <h2 className="fe-card__title">Search result preview</h2>
          <div className="fe-serp">
            <span className="fe-serp__site">{siteName}</span>
            <span className="fe-serp__url">{host} › {values.slug || "…"}</span>
            <span className="fe-serp__title">{cut(title || pageName, TITLE_MAX) || "Untitled"}</span>
            <span className="fe-serp__desc">{cut(desc, DESC_MAX) || "No description yet. Search engines will pick text from the page."}</span>
          </div>
        </section>
        <section className="fe-card" aria-label="Social share preview">
          <h2 className="fe-card__title">Social share preview</h2>
          <div className="fe-share">
            <div className="fe-share__img">{shareImage ? <img src={shareImage} alt="" /> : <span>No image</span>}</div>
            <div className="fe-share__text"><span className="fe-share__host">{host}</span><strong>{shareTitle}</strong><span>{cut(shareDesc, DESC_MAX)}</span></div>
          </div>
        </section>
        <section className="fe-card" aria-label="Checks">
          <h2 className="fe-card__title">Checks</h2>
          <ul className="fe-checks">
            {checks.map((c) => (
              <li key={c.id} className={`fe-check is-${c.status}`}>
                <span className="fe-check__icon" aria-hidden="true">{ICON[c.status]}</span>
                <span><strong>{c.label}:</strong> <span className="fe-check__word">{WORD[c.status]}.</span> {c.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
