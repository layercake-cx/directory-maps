// AI drafting for directory content pages — Feature 6 of the Directory
// Searchability & AI Metadata plan. The editor supplies an outline
// (headings, bullet points, or a short brief); Claude writes a full draft.
// Reuses entryContentGeneration.ts's sanitizeGeneratedHtml (same allowed-tag
// allowlist, same defense-in-depth posture) rather than a second
// implementation, since the output constraints are identical — clean HTML
// safe to drop into the same RichTextEditor.jsx entries already use.
//
// Platform: ANTHROPIC_API_KEY.

import { sanitizeGeneratedHtml } from "./entryContentGeneration.ts";

const ANTHROPIC_MODEL = "claude-haiku-4-5";
const TOOL_NAME = "write_page_content";

async function callClaude(apiKey: string, directoryName: string, pageTitle: string, outline: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system:
        "You write a full page of content for one page on an online directory's website, from the editor's outline. " +
        "Follow the outline's structure and intent, but write complete, well-formed prose and lists, not just an expansion of each bullet in isolation. " +
        "Only use facts given to you in the outline or the directory's name — never invent statistics, dates, or claims the outline doesn't support. " +
        "Write clean HTML using only these tags: p, br, strong, b, em, i, u, ul, ol, li, h2, h3, h4, blockquote, a, img, span, div. " +
        "Use h2/h3 for section headings that reflect the outline's own structure. " +
        "No <script>, <style>, inline event handlers, or javascript:/data: URIs. " +
        `Respond only by calling the ${TOOL_NAME} tool.`,
      tools: [
        {
          name: TOOL_NAME,
          description: "Record the generated HTML content for this page.",
          input_schema: {
            type: "object",
            properties: {
              html: { type: "string", description: "The page's content, as HTML using only the allowed tags." },
            },
            required: ["html"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content:
            `This page, titled "${pageTitle}", belongs to the directory "${directoryName}".\n\n` +
            `Editor's outline:\n${outline}\n\n` +
            "Call the tool now with the generated HTML.",
        },
      ],
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
  const html = toolUse.input.html;
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Anthropic returned empty content — check the outline isn't too large for the model to complete");
  }
  return html;
}

export async function generatePageContentDraft(apiKey: string, directoryName: string, pageTitle: string, outline: string): Promise<string> {
  const html = await callClaude(apiKey, directoryName, pageTitle, outline);
  return sanitizeGeneratedHtml(html);
}
