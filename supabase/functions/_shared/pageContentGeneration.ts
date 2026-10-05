// AI drafting for directory content pages — Feature 6 of the Directory
// Searchability & AI Metadata plan. The editor supplies an outline
// (headings, bullet points, or a short brief); Claude writes a full draft.
// Reuses entryContentGeneration.ts's sanitizeGeneratedHtml (same allowed-tag
// allowlist, same defense-in-depth posture) rather than a second
// implementation, since the output constraints are identical — clean HTML
// safe to drop into the same RichTextEditor.jsx entries already use.
//
// LLM calls go through the AI Gateway (./ai/gateway.ts).

import { sanitizeGeneratedHtml } from "./entryContentGeneration.ts";
import { AiScope, directoryMapsContext, generate, requireToolInput } from "./ai/gateway.ts";
const TOOL_NAME = "write_page_content";

async function callModel(scope: AiScope, directoryName: string, pageTitle: string, outline: string): Promise<string> {
  const result = await generate(directoryMapsContext(scope, "content_page_draft", "STANDARD_MODEL"), {
    maxTokens: 4096,
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
        inputSchema: {
          type: "object",
          properties: {
            html: { type: "string", description: "The page's content, as HTML using only the allowed tags." },
          },
          required: ["html"],
        },
      },
    ],
    toolChoice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content:
          `This page, titled "${pageTitle}", belongs to the directory "${directoryName}".\n\n` +
          `Editor's outline:\n${outline}\n\n` +
          "Call the tool now with the generated HTML.",
      },
    ],
  });

  const html = requireToolInput(result, TOOL_NAME).html;
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("The AI model returned empty content — check the outline isn't too large for the model to complete");
  }
  return html;
}

export async function generatePageContentDraft(scope: AiScope, directoryName: string, pageTitle: string, outline: string): Promise<string> {
  const html = await callModel(scope, directoryName, pageTitle, outline);
  return sanitizeGeneratedHtml(html);
}
