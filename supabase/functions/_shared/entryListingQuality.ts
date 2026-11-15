// Stage 3 of AI listing generation: validate. Deterministic checks that reject a draft before it can replace
// an existing listing: database-style wording, research limitations or metadata leaking into the public text,
// and copy that doesn't use the supplier-specific facts the research found.

import type { EntryResearch } from "./entryResearch.ts";

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Wording that belongs in internal notes or database documentation, never in a public listing. */
const BANNED: { re: RegExp; why: string }[] = [
  { re: /\brecorded (range|categor|products?|information|details?)/i, why: "database wording (\"recorded range\")" },
  { re: /\blisted (categor|products?|ranges?)/i, why: "database wording (\"listed categories\")" },
  { re: /\b(isn'?t|aren'?t|is not|are not|not) (yet )?(described|detailed|listed|specified|stated) (here|on this page)/i, why: "says information is missing" },
  { re: /\b(unverified|couldn'?t (find|verify|confirm)|could not (find|verify|confirm)|no (public |further )?information|verification|to be verified|requires? verifying)\b/i, why: "research limitations in public text" },
  { re: /\b(supplied|provided|available) (record|data|details|information)\b|\b(directory|database) (record|data|entry|field)s?\b|\bour (research|records|data)\b|\baccording to (our|the) (records|data|research)\b/i, why: "refers to records or research" },
  { re: /\b(browse|see|check out|visit)\b[^.]{0,40}\b(current|full) range\b[^.]{0,30}\b(directly|yourself)\b|\bbest way to see what suits\b/i, why: "tells readers to go and look instead of giving a reason" },
  { re: /\b(meta (title|description)|seo\b|keywords?:|og:title|slug:|canonical)/i, why: "SEO or metadata text in the listing" },
  { re: /\bas an ai\b|\bi (could|was|am) (not|unable)\b|\bTODO\b|lorem ipsum|\[\s*(insert|source|citation)/i, why: "assistant or placeholder language" },
];

const STOP = new Set(["about", "their", "which", "where", "while", "these", "those", "other", "being", "through", "within", "across", "around", "before", "after", "farms", "boxes", "organic"]);

function anchorTokens(detail: string, nameTokens: Set<string>): { strong: string[]; weak: string[] } {
  const strong: string[] = [];
  const weak: string[] = [];
  const words = detail.match(/[A-Za-z0-9][A-Za-z0-9’'-]{3,}/g) ?? [];
  words.forEach((w, i) => {
    const lower = w.toLowerCase();
    if (nameTokens.has(lower)) return;
    if (/\d/.test(w) || (i > 0 && /^[A-Z]/.test(w))) strong.push(lower);
    else if (w.length >= 6 && !STOP.has(lower)) weak.push(lower);
  });
  return { strong, weak };
}

/**
 * Returns the reasons a draft should be rejected (empty = acceptable).
 * `entryName` is excluded from the supplier-specific check so that simply repeating the name doesn't count as detail.
 */
export function validateListing(html: string, research: EntryResearch, entryName: string): string[] {
  const problems: string[] = [];
  const text = plainText(html);

  if (text.length < 350) problems.push("too short to be a useful listing (under 350 characters)");
  if (text.length > 4500) problems.push("too long (over 4,500 characters): cut anything that doesn't earn its place");
  if ((html.match(/<p[\s>]/gi) ?? []).length < 2) problems.push("needs at least two paragraphs");

  for (const { re, why } of BANNED) {
    const hit = re.exec(text);
    if (hit) problems.push(`${why}: "${hit[0].slice(0, 60)}"`);
  }

  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()).filter((s) => s.length > 25);
  if (new Set(sentences).size < sentences.length) problems.push("repeats a sentence");

  const nameTokens = new Set((entryName.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []));
  const lowerText = text.toLowerCase();
  const matched = research.distinctive_details.filter((d) => {
    const { strong, weak } = anchorTokens(d, nameTokens);
    return strong.some((t) => lowerText.includes(t)) || weak.filter((t) => lowerText.includes(t)).length >= 2;
  }).length;
  const needed = Math.min(2, research.distinctive_details.length);
  if (matched < needed) problems.push(`uses only ${matched} of the researched supplier-specific details (needs ${needed}): it reads generically`);

  return problems;
}
