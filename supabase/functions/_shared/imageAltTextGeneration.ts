// AI-generated image alt text — Feature 5 of the Directory Searchability &
// AI Metadata plan. Distinct from every other AI feature in this codebase:
// this is the only one that sends Claude an actual image (vision), not just
// text, since a genuinely descriptive caption needs to describe what's
// actually in the photo, not just guess from the entry's name.
//
// Platform: ANTHROPIC_API_KEY.

const ANTHROPIC_MODEL = "claude-haiku-4-5";
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
  apiKey: string,
  imageBase64: string,
  mediaType: string,
  entryName: string,
  imageKind: "hero" | "gallery",
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 256,
      system:
        "You write concise, descriptive alt text for images on an organisation's directory listing page. " +
        "Describe what the image actually shows — never start with \"Image of\" or \"Photo of\", and never use placeholder language. " +
        "Keep it under 125 characters where possible. Weave in the organisation's name only where it reads naturally, not as a forced prefix. " +
        `Respond only by calling the ${TOOL_NAME} tool.`,
      tools: [
        {
          name: TOOL_NAME,
          description: "Record the generated alt text for this image.",
          input_schema: {
            type: "object",
            properties: {
              alt_text: { type: "string", description: "Descriptive alt text for the image, under 125 characters." },
            },
            required: ["alt_text"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            {
              type: "text",
              text: `This is a ${imageKind} image on the directory listing page for "${entryName}". Call the tool now with descriptive alt text for it.`,
            },
          ],
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
  const altText = toolUse.input.alt_text;
  if (typeof altText !== "string" || !altText.trim()) {
    throw new Error("Anthropic returned empty alt text");
  }
  return altText.trim();
}
