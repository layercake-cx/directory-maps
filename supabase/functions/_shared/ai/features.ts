// Registry of Directory Maps AI features: the single place that maps a
// feature to the capability profile it requests. Call sites reference the
// feature key only; the capability (and so the recommended model) lives here
// and in ai_capability_profiles, never in product code.

import type { AiCapability } from "./types.ts";

export type AiFeatureDef = {
  label: string;
  description: string;
  capability: AiCapability;
  /** Shown beside the recommendation in the model configuration UI. */
  recommendation: string;
};

export const AI_FEATURES = {
  seo_metadata: {
    label: "SEO & social metadata",
    description: "Drafts and backfills meta titles, descriptions, keywords and AI summaries.",
    capability: "ECONOMY_MODEL",
    recommendation:
      "A fast, low-cost model is sufficient for this task. Using a premium reasoning model is unlikely to materially improve the result.",
  },
  alt_text: {
    label: "Image alt text",
    description: "Describes uploaded images for accessibility and SEO.",
    capability: "ECONOMY_MODEL",
    recommendation: "Short factual descriptions don't need a premium model. The model must support image input.",
  },
  intent_search: {
    label: "Help me choose (search)",
    description: "Interprets a visitor's needs and picks matching entries.",
    capability: "FAST_MODEL",
    recommendation: "Visitors are waiting, so a fast, low-cost model gives the best experience for search interpretation.",
  },
  content_generation: {
    label: "Listing content",
    description: "Writes entry page content from your content prompt, one entry or in bulk.",
    capability: "STANDARD_MODEL",
    recommendation: "A capable, low-cost model writes good listing copy from structured data. Stronger models cost more for little visible gain.",
  },
  content_page_draft: {
    label: "Content page drafts",
    description: "Drafts directory pages (About, How to join, guides) from your outline.",
    capability: "STANDARD_MODEL",
    recommendation: "Drafts are reviewed and edited before publishing, so a standard low-cost model is usually enough.",
  },
} as const satisfies Record<string, AiFeatureDef>;

export type AiFeatureKey = keyof typeof AI_FEATURES;

export const AI_FEATURE_KEYS = Object.keys(AI_FEATURES) as AiFeatureKey[];

export function isAiFeatureKey(value: string): value is AiFeatureKey {
  return Object.prototype.hasOwnProperty.call(AI_FEATURES, value);
}
