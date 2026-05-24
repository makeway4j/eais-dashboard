import { envBool, envString } from "../config/env.mjs";
import { log, logError } from "../utils/logger.mjs";

function extractOutputText(response) {
  if (response.output_text) return response.output_text;
  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function parseJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("OpenAI response did not contain parseable JSON.");
  }
}

export async function enhanceWithOpenAI(items) {
  if (!envBool("ENABLE_OPENAI_SUMMARY", false)) {
    await log("openai summary skipped", { reason: "ENABLE_OPENAI_SUMMARY is false" });
    return items;
  }

  const apiKey = envString("OPENAI_API_KEY");
  if (!apiKey) {
    await log("openai summary skipped", { reason: "OPENAI_API_KEY is missing" });
    return items;
  }

  const model = envString("OPENAI_MODEL", "gpt-4.1-mini");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        instructions: "You rewrite a personal morning AI briefing. Use only the provided source items. Do not invent facts. Return strict JSON only.",
        input: `Improve these digest items. Keep every original URL and source. Return JSON: {"items":[{"title":"","source":"","sourceId":"","url":"","publishedAt":"","topic":"governance|vendors|infrastructure|tech","importance":"high|medium|watch","summary":"","whyItMatters":""}]}.\n\n${JSON.stringify({ items }, null, 2)}`,
        max_output_tokens: 2500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
    }

    const json = await response.json();
    const parsed = parseJson(extractOutputText(json));
    if (!Array.isArray(parsed.items)) {
      throw new Error("OpenAI JSON did not contain an items array.");
    }

    await log("openai summary completed", { count: parsed.items.length, model });
    return parsed.items;
  } catch (error) {
    await logError("openai summary failed; using local summaries", error, { model });
    return items;
  }
}
