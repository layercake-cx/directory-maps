// Shared core for AI-drafted SEO/social metadata — Feature 2 of the
// Directory Searchability & AI Metadata plan (docs/DEPLOYMENTS.md,
// 2026-09-18). Distinct from entryContentGeneration.ts (which writes the
// entry's page body, notes_html): this drafts the short text fields already
// exposed on EntrySeoTab.jsx / DirectoryGeneralSettingsPanel.jsx. Callers
// never persist the result themselves — the Edge Function returns a draft,
// and the editor's own "Save" action (already wired to those fields) is
// what makes it stick, per the product doc's "generated copy always lands
// in the editable field for review before publish" rule.
//
// Platform: ANTHROPIC_API_KEY.

const ANTHROPIC_MODEL = "claude-haiku-4-5";

const AVOID_PLACEHOLDER_RULE =
  "Never use placeholder or demo-sounding language (e.g. \"Sample\", \"Example\", \"Test\", \"Lorem ipsum\") — write as if this is a real, live resource, because it is. " +
  "Only use the facts given to you; do not invent or assume anything not present in the data.";

async function callClaudeTool<T>(
  apiKey: string,
  system: string,
  userContent: string,
  toolName: string,
  toolDescription: string,
  inputSchema: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system,
      tools: [{ name: toolName, description: toolDescription, input_schema: inputSchema }],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const body = await res.json();
  if (body.stop_reason === "max_tokens") {
    throw new Error("Anthropic response was truncated (max_tokens reached) before completing the tool call");
  }
  const toolUse = (body.content ?? []).find((block: { type?: string }) => block.type === "tool_use");
  if (!toolUse || typeof toolUse.input !== "object") {
    throw new Error("Anthropic response did not include a valid tool_use block");
  }
  return toolUse.input as T;
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export type EntrySeoMetadataDraft = {
  meta_title: string;
  meta_description: string;
  keywords: string;
  og_title: string;
  og_description: string;
  ai_summary: string;
};

export type EntryForSeoGeneration = {
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  website_url: string | null;
  notes_html: string | null;
};

export async function generateEntrySeoMetadataDraft(
  apiKey: string,
  entry: EntryForSeoGeneration,
  directoryName: string,
): Promise<EntrySeoMetadataDraft> {
  const entryText = [
    `Name: ${entry.name}`,
    entry.address ? `Address: ${entry.address}` : null,
    entry.city ? `City: ${entry.city}` : null,
    entry.postcode ? `Postcode: ${entry.postcode}` : null,
    entry.country ? `Country: ${entry.country}` : null,
    entry.website_url ? `Website: ${entry.website_url}` : null,
    entry.notes_html ? `Page content: ${stripHtml(entry.notes_html)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return callClaudeTool<EntrySeoMetadataDraft>(
    apiKey,
    "You write concise, accurate SEO and social-sharing metadata for one organisation's page within an online directory. " +
      `${AVOID_PLACEHOLDER_RULE} ` +
      "meta_title: under 60 characters, the organisation's name plus a few words of context. " +
      "meta_description: under 160 characters, a genuine one-sentence description a search engine would show. " +
      "keywords: 3-8 comma-separated terms relevant to the organisation. " +
      "og_title/og_description: for social sharing, can be slightly more conversational than the meta versions. " +
      "ai_summary: 1-2 plain sentences an AI assistant could read aloud to describe this organisation.",
    `This entry belongs to the directory "${directoryName}".\n\nEntry data:\n${entryText}\n\nCall the tool now with all six fields filled in.`,
    "write_entry_seo_metadata",
    "Record drafted SEO/social metadata for one directory entry.",
    {
      type: "object",
      properties: {
        meta_title: { type: "string" },
        meta_description: { type: "string" },
        keywords: { type: "string" },
        og_title: { type: "string" },
        og_description: { type: "string" },
        ai_summary: { type: "string" },
      },
      required: ["meta_title", "meta_description", "keywords", "og_title", "og_description", "ai_summary"],
    },
  );
}

export type DirectorySeoMetadataDraft = {
  meta_title_template: string;
  meta_description: string;
};

export async function generateDirectorySeoMetadataDraft(
  apiKey: string,
  directoryName: string,
  directoryDescription: string | null,
  entryCount: number,
  categorisationLabels: string[],
): Promise<DirectorySeoMetadataDraft> {
  const contextLines = [
    `Directory name: ${directoryName}`,
    directoryDescription ? `Directory description: ${directoryDescription}` : null,
    `Number of entries: ${entryCount}`,
    categorisationLabels.length ? `Categorised by: ${categorisationLabels.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return callClaudeTool<DirectorySeoMetadataDraft>(
    apiKey,
    "You write the homepage SEO title and description for a published online directory. " +
      `${AVOID_PLACEHOLDER_RULE} ` +
      "meta_title_template: under 60 characters. " +
      "meta_description: under 160 characters, in the style of \"A directory of 329 UK professional associations, trade bodies and regulators, categorised by industry sector and organisation type.\" — real entry count, real categorisation, no filler.",
    `${contextLines}\n\nCall the tool now with both fields filled in.`,
    "write_directory_seo_metadata",
    "Record drafted SEO metadata for a directory's homepage.",
    {
      type: "object",
      properties: {
        meta_title_template: { type: "string" },
        meta_description: { type: "string" },
      },
      required: ["meta_title_template", "meta_description"],
    },
  );
}
