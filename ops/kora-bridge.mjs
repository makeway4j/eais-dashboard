#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const host = process.env.KORA_BRIDGE_HOST || "0.0.0.0";
const port = Number(process.env.KORA_BRIDGE_PORT || 8791);
const ollamaBase = (process.env.KORA_BRIDGE_OLLAMA_BASE || "http://127.0.0.1:11434").replace(/\/+$/, "");
const model = process.env.KORA_BRIDGE_MODEL || "llama3.1:8b";
const soulPath = process.env.KORA_BRIDGE_SOUL_PATH || "/root/.hermes/SOUL.md";
const timeoutMs = Number(process.env.KORA_BRIDGE_TIMEOUT_MS || 60000);
const token = process.env.KORA_BRIDGE_TOKEN || "";
const maxBodyBytes = 64 * 1024;

let soulCache = "";

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function isAuthorized(request) {
  if (!token) {
    return true;
  }

  const header = request.headers.authorization || "";
  return header === `Bearer ${token}`;
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }

  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function getSoul() {
  if (soulCache) {
    return soulCache;
  }

  try {
    soulCache = await readFile(soulPath, "utf8");
  } catch {
    soulCache = "You are Kora, James's warm, direct, concise EAIS assistant on the Kora GPU node.";
  }

  return soulCache;
}

function buildPrompt(soul, message) {
  return [
    soul.trim(),
    "",
    "EAIS dashboard bridge instructions:",
    "- Reply as Kora.",
    "- Be concise, direct, and useful.",
    "- Help James with EAIS, homelab operations, AI intelligence, schedules, revenue projects, and next actions.",
    "- Do not claim you performed actions unless the system explicitly did them.",
    "",
    `James says: ${message}`,
    "",
    "Reply in 2-5 short sentences."
  ].join("\n");
}

async function askKora(message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ollamaBase}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: buildPrompt(await getSoul(), message),
        stream: false,
        options: {
          num_predict: 220,
          temperature: 0.35
        }
      })
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}: ${body.slice(0, 180)}`);
    }

    const data = JSON.parse(body);
    return String(data.response || "").trim() || "Kora returned an empty response.";
  } finally {
    clearTimeout(timeout);
  }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

    if (url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        service: "kora-bridge",
        model,
        ollamaBase,
        soulPath
      });
      return;
    }

    if (url.pathname !== "/chat") {
      sendJson(response, 404, { ok: false, error: "Not found." });
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { ok: false, error: "Method not allowed." });
      return;
    }

    if (!isAuthorized(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized." });
      return;
    }

    const payload = await readJsonBody(request);
    const message = String(payload.message || "").trim().slice(0, 2000);
    if (!message) {
      sendJson(response, 400, { ok: false, error: "Message is required." });
      return;
    }

    sendJson(response, 200, {
      ok: true,
      provider: "kora-bridge",
      model,
      reply: await askKora(message)
    });
  } catch (error) {
    sendJson(response, 502, {
      ok: false,
      error: error.name === "AbortError" ? "Kora bridge timed out." : error.message
    });
  }
}).listen(port, host, () => {
  console.log(`Kora bridge listening at http://${host}:${port}`);
});
