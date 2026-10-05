// AI-generated image alt text — Feature 5 of the Directory Searchability &
// AI Metadata plan. Distinct from every other AI feature in this codebase:
// this is the only one that sends Claude an actual image (vision), not just
// text, since a genuinely descriptive caption needs to describe what's
// actually in the photo, not just guess from the entry's name.
//
// LLM calls go through the AI Gateway (./ai/gateway.ts); requires a
// vision-capable model.

import { AiScope, directoryMapsContext, generate, requireToolInput } from "./ai/gateway.ts";

const TOOL_NAME = "write_alt_text";

const SUPPORTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSupportedImageMediaType(mediaType: string): boolean {
  return SUPPORTED_MEDIA_TYPES.has(mediaType);
}

/**
 * Describes one image for accessibility/SEO alt text, grounded in what the
 * image actually shows plus the entry it belongs to for context (so "a
 * modern glass office building" can become "Association for Project
 * Management's office building" when that context helps).
 */
export async function generateImageAltText(
  scope: AiScope,
  imageBase64: string,
  mediaType: string,
  entryName: string,
  imageKind: "hero" | "gallery",
): Promise<string> {
  const result = await generate(directoryMapsContext(scope, "alt_text", "ECONOMY_MODEL"), {
    maxTokens: 256,
    system:
      "You write concise, descriptive alt text for images on an organisation's directory listing page. " +
      "Describe what the image actually shows — never start with \"Image of\" or \"Photo of\", and never use placeholder language. " +
      "Keep it under 125 characters where possible. Weave in the organisation's name only where it reads naturally, not as a forced prefix. " +
      `Respond only by calling the ${TOOL_NAME} tool.`,
    tools: [
      {
        name: TOOL_NAME,
        description: "Record the generated alt text for this image.",
        inputSchema: {
          type: "object",
          properties: {
            alt_text: { type: "string", description: "Descriptive alt text for the image, under 125 characters." },
          },
          required: ["alt_text"],
        },
      },
    ],
    toolChoice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", mediaType, base64: imageBase64 },
          {
            type: "text",
            text: `This is a ${imageKind} image on the directory listing page for "${entryName}". Call the tool now with descriptive alt text for it.`,
          },
        ],
      },
    ],
  });

  const altText = requireToolInput(result, TOOL_NAME).alt_text;
  if (typeof altText !== "string" || !altText.trim()) {
    throw new Error("The AI model returned empty alt text");
  }
  return altText.trim();
}
