// ---------- OpenAI image generation helper ----------
// Uses the Responses API's built-in image_generation tool so we can pass
// Pinterest pin images in as visual references, grounding the generated
// mockup in the couple's actual pinned style rather than a generic result.
// Docs: https://developers.openai.com/api/docs/guides/image-generation

import type { DownloadedImage } from "./pinterest";

const RESPONSES_URL = "https://api.openai.com/v1/responses";

const MOCKUP_PROMPT = `Using the attached reference images as style inspiration (colors, materials, florals, tableware), generate a single photorealistic image of ONE fully styled wedding reception table — centerpiece, place settings, glassware, and linens.

Frame it as a close-up, product-style shot of just the table itself, from a slightly elevated angle. Do not show the room, walls, floor, ceiling, other tables, or any people — only the table and what's on it, isolated against a softly blurred neutral background.`;

interface ResponsesOutputItem {
  type: string;
  result?: string;
}

export async function generateTableMockup(images: DownloadedImage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Image generation isn't configured yet (missing OPENAI_API_KEY).");
  }
  if (images.length === 0) {
    throw new Error("No reference images to generate from.");
  }

  const content = [
    { type: "input_text", text: MOCKUP_PROMPT },
    ...images.map((img) => ({
      type: "input_image",
      image_url: `data:${img.mediaType};base64,${img.base64}`,
      detail: "auto",
    })),
  ];

  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.6",
      input: [{ role: "user", content }],
      tools: [{ type: "image_generation" }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Image generation failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const output: ResponsesOutputItem[] = data.output || [];
  const imageCall = output.find((o) => o.type === "image_generation_call" && o.result);
  if (!imageCall?.result) {
    throw new Error("The image model didn't return an image. Try again.");
  }
  return imageCall.result; // base64-encoded PNG
}
