#!/usr/bin/env node
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  eaisDbPath,
  ensureEaisDatabase,
  getEaisHistory,
  getEaisSummary,
  getEaisTopicMix,
  listBacklogItems,
  listEaisItems,
  listRecentBriefings,
  listRunHistory,
  listEaisSources
} from "../eais/db.mjs";
import { getIntegrationStatus } from "../integrations/status.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const currentFile = fileURLToPath(import.meta.url);
const dashboardRoot = resolve(projectRoot, "mockups", "eais-dashboard");
const visionBoardRoot = resolve(process.env.EAIS_VISION_BOARD_DIR || "data/vision-board");
const visionUploadsRoot = resolve(visionBoardRoot, "uploads");
const visionItemsPath = resolve(visionBoardRoot, "items.json");
const host = process.env.EAIS_HOST || "127.0.0.1";
const port = Number(process.env.EAIS_PORT || 8788);
const dailyTimerUnit = process.env.EAIS_DAILY_TIMER_UNIT || "eais-daily-brief.timer";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};
const imageExtensions = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};
const maxVisionImageBytes = 5 * 1024 * 1024;
const maxJsonBodyBytes = 8 * 1024 * 1024;
const koraTimeoutMs = Number(process.env.EAIS_KORA_TIMEOUT_MS || process.env.EAIS_JARVIS_TIMEOUT_MS || 45000);
const aiHealthCacheMs = Number(process.env.EAIS_AI_HEALTH_CACHE_MS || 60 * 1000);
const aiHealthTimeoutMs = Number(process.env.EAIS_AI_HEALTH_TIMEOUT_MS || 7000);
const sessionCookieName = "eais_session";
const sessionMaxAgeSeconds = Number(process.env.EAIS_SESSION_MAX_AGE_SECONDS || 60 * 60 * 12);
let aiHealthCache = { expiresAt: 0, data: null };

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function sendError(response, status, message) {
  sendJson(response, status, { ok: false, error: message });
}

function sendAuthRequired(response) {
  response.writeHead(401, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify({ ok: false, error: "Authentication required." }, null, 2));
}

function sendRedirect(response, location) {
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store"
  });
  response.end();
}

function sendBinary(response, status, body, contentType) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=3600"
  });
  response.end(body);
}

function getAuthConfig() {
  return {
    user: process.env.EAIS_AUTH_USER || "",
    pass: process.env.EAIS_AUTH_PASS || "",
    secret: process.env.EAIS_AUTH_SECRET || process.env.EAIS_AUTH_PASS || "local-eais-session-secret"
  };
}

function isAuthEnabled() {
  const { user, pass } = getAuthConfig();
  return Boolean(user && pass);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator === -1) {
        return [part, ""];
      }
      return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    }));
}

function signSession(payload) {
  const { secret } = getAuthConfig();
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionCookie(username) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + sessionMaxAgeSeconds;
  const nonce = randomBytes(16).toString("hex");
  const payload = Buffer.from(JSON.stringify({ username, issuedAt, expiresAt, nonce })).toString("base64url");
  const signature = signSession(payload);

  return [
    `${sessionCookieName}=${payload}.${signature}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${sessionMaxAgeSeconds}`
  ].join("; ");
}

function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function hasValidSession(request) {
  const cookie = parseCookies(request)[sessionCookieName];
  if (!cookie || !cookie.includes(".")) {
    return false;
  }

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature || !safeEqual(signature, signSession(payload))) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    const { user } = getAuthConfig();
    return session.username === user && Number(session.expiresAt) > now;
  } catch {
    return false;
  }
}

function hasValidBasicAuth(request) {
  const { user, pass } = getAuthConfig();
  if (!user || !pass) {
    return true;
  }

  const header = request.headers.authorization || "";
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) {
    return false;
  }

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) {
      return false;
    }

    return safeEqual(decoded.slice(0, separator), user) && safeEqual(decoded.slice(separator + 1), pass);
  } catch {
    return false;
  }
}

function isAuthorized(request, options = {}) {
  const allowBasic = options.allowBasic !== false;

  if (!isAuthEnabled()) {
    return true;
  }

  return hasValidSession(request) || (allowBasic && hasValidBasicAuth(request));
}

function validateLogin(username, password) {
  const { user, pass } = getAuthConfig();
  return Boolean(user && pass && safeEqual(username, user) && safeEqual(password, pass));
}

function safeStaticPath(pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalizedPath = normalize(relativePath);

  if (normalizedPath.startsWith("..") || normalizedPath.includes("..\\")) {
    return null;
  }

  return join(dashboardRoot, normalizedPath);
}

async function getTimerStatus(unit = dailyTimerUnit) {
  if (process.platform === "win32") {
    return {
      unit,
      available: false,
      activeState: "unavailable",
      nextElapse: null,
      lastTrigger: null
    };
  }

  try {
    const { stdout } = await execFileAsync("systemctl", [
      "show",
      unit,
      "-p",
      "ActiveState",
      "-p",
      "NextElapseUSecRealtime",
      "-p",
      "LastTriggerUSec"
    ], { timeout: 2000 });
    const values = Object.fromEntries(stdout.trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));

    return {
      unit,
      available: true,
      activeState: values.ActiveState || "unknown",
      nextElapse: values.NextElapseUSecRealtime || null,
      lastTrigger: values.LastTriggerUSec || null
    };
  } catch (error) {
    return {
      unit,
      available: false,
      activeState: "unknown",
      nextElapse: null,
      lastTrigger: null,
      error: error.message
    };
  }
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxJsonBodyBytes) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readVisionItems() {
  try {
    const body = await readFile(visionItemsPath, "utf8");
    const parsed = JSON.parse(body);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeVisionItems(items) {
  await mkdir(visionBoardRoot, { recursive: true });
  await writeFile(visionItemsPath, JSON.stringify({ items }, null, 2), "utf8");
}

function normalizeVisionTitle(value, fallback = "Vision Board Image") {
  return String(value || fallback).trim().slice(0, 80) || fallback;
}

function isAllowedImageBytes(mimeType, bytes) {
  if (mimeType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/gif") {
    return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function decodeVisionImage(imageData) {
  const match = String(imageData || "").match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Upload must be a PNG, JPG, WebP, or GIF image.");
  }

  const mimeType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > maxVisionImageBytes) {
    throw new Error("Image must be between 1 byte and 5 MB.");
  }
  if (!isAllowedImageBytes(mimeType, bytes)) {
    throw new Error("Uploaded file data does not match a supported image format.");
  }

  return {
    bytes,
    mimeType,
    extension: imageExtensions[mimeType]
  };
}

function normalizeKoraMessage(value) {
  return String(value || "").trim().slice(0, 2000);
}

function getKoraPrompt(message) {
  return [
    "You are Kora inside James's EAIS dashboard.",
    "Be direct, useful, and concise.",
    "Focus on AI intelligence, home lab operations, daily briefings, revenue projects, schedules, Joplin, and next actions.",
    "Do not claim you performed external actions unless the user explicitly asks and the tool is available.",
    "",
    `James says: ${message}`,
    "",
    "Reply in 2-5 short sentences."
  ].join("\n");
}

async function getKoraBridgeReply(message) {
  const bridgeUrl = (process.env.EAIS_KORA_BRIDGE_URL || "").replace(/\/+$/, "");
  if (!bridgeUrl) {
    return null;
  }

  const headers = { "Content-Type": "application/json" };
  if (process.env.EAIS_KORA_BRIDGE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EAIS_KORA_BRIDGE_TOKEN}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), koraTimeoutMs);

  try {
    const response = await fetch(`${bridgeUrl}/chat`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({ message, source: "eais-dashboard" })
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Kora bridge returned ${response.status}: ${body.slice(0, 160)}`);
    }

    const data = JSON.parse(body);
    return {
      provider: data.provider || "kora-bridge",
      model: data.model || "kora",
      reply: String(data.reply || "").trim() || "Kora bridge returned an empty reply."
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Kora bridge timed out before Kora could answer.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getKoraChatReply(message) {
  const bridgeReply = await getKoraBridgeReply(message);
  if (bridgeReply) {
    return bridgeReply;
  }

  const baseUrl = (
    process.env.EAIS_KORA_OLLAMA_BASE ||
    process.env.EAIS_KORA_BASE ||
    process.env.EAIS_JARVIS_BASE ||
    process.env.EAIS_OLLAMA_BASE ||
    ""
  ).replace(/\/+$/, "");
  const model = process.env.EAIS_KORA_MODEL || process.env.EAIS_JARVIS_MODEL || "llama3.1:8b";

  if (!baseUrl) {
    const error = new Error("Kora bridge is not configured.");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), koraTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: getKoraPrompt(message),
        stream: false,
        options: {
          num_predict: 180,
          temperature: 0.4
        }
      })
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Kora returned ${response.status}: ${body.slice(0, 160)}`);
    }

    const data = JSON.parse(body);
    return {
      provider: "kora-ollama",
      model: data.model || model,
      reply: String(data.response || "").trim() || "Kora returned an empty reply."
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Kora timed out before answering.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAiProviderStatus(status) {
  if (status === "operational") {
    return "operational";
  }
  if (status === "degraded" || status === "watch") {
    return "watch";
  }
  if (status === "down") {
    return "down";
  }
  return "unknown";
}

function summarizeAiProviders(providers) {
  return providers.reduce((summary, provider) => {
    const status = normalizeAiProviderStatus(provider.status);
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, {
    operational: 0,
    watch: 0,
    down: 0,
    unknown: 0
  });
}

function statusPageStatus(indicator) {
  if (indicator === "none") {
    return "operational";
  }
  if (indicator === "critical") {
    return "down";
  }
  if (indicator === "minor" || indicator === "major" || indicator === "maintenance") {
    return "watch";
  }
  return "unknown";
}

function providerStatusText(status) {
  if (status === "operational") {
    return "Operational";
  }
  if (status === "watch") {
    return "Issue watch";
  }
  if (status === "down") {
    return "Down";
  }
  return "Unknown";
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aiHealthTimeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
    }

    return {
      data: text ? JSON.parse(text) : {},
      latencyMs
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aiHealthTimeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
    }

    return { text, latencyMs };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function skippedProvider(name, type, url, detail = "Live status check disabled in this environment.") {
  return {
    name,
    type,
    status: "unknown",
    statusText: "Skipped",
    detail,
    lastUpdated: null,
    url,
    latencyMs: null
  };
}

async function checkStatusPageProvider(name, url) {
  if (process.env.EAIS_AI_HEALTH_SKIP_EXTERNAL === "1") {
    return skippedProvider(name, "vendor", url);
  }

  try {
    const { data, latencyMs } = await fetchJsonWithTimeout(url);
    const indicator = data.status?.indicator || "unknown";
    const status = statusPageStatus(indicator);
    const impacted = (data.components || [])
      .filter((component) => component.status && component.status !== "operational")
      .slice(0, 4)
      .map((component) => component.name);

    return {
      name,
      type: "vendor",
      status,
      statusText: providerStatusText(status),
      detail: impacted.length ? impacted.join(", ") : data.status?.description || "No active incidents reported.",
      lastUpdated: data.page?.updated_at || null,
      url: data.page?.url || url.replace("/api/v2/summary.json", ""),
      latencyMs
    };
  } catch (error) {
    return {
      name,
      type: "vendor",
      status: "unknown",
      statusText: "Status check failed",
      detail: error.message,
      lastUpdated: null,
      url,
      latencyMs: null
    };
  }
}

function instatusProviderStatus(pageStatus, activeIncidents = []) {
  const hasMajorIncident = activeIncidents.some((incident) => /major|outage|critical/i.test(incident.impact || incident.status || incident.name || ""));
  if (hasMajorIncident) {
    return "down";
  }
  if (activeIncidents.length || pageStatus !== "UP") {
    return "watch";
  }
  return "operational";
}

async function checkInstatusProvider(name, url) {
  if (process.env.EAIS_AI_HEALTH_SKIP_EXTERNAL === "1") {
    return skippedProvider(name, "vendor", url);
  }

  try {
    const { data, latencyMs } = await fetchJsonWithTimeout(url);
    const activeIncidents = data.activeIncidents || [];
    const status = instatusProviderStatus(data.page?.status, activeIncidents);
    return {
      name,
      type: "vendor",
      status,
      statusText: providerStatusText(status),
      detail: activeIncidents.length ? activeIncidents.slice(0, 3).map((incident) => incident.name).join(", ") : "No active incidents reported.",
      lastUpdated: activeIncidents[0]?.updatedAt || null,
      url: data.page?.url || url,
      latencyMs
    };
  } catch (error) {
    return {
      name,
      type: "vendor",
      status: "unknown",
      statusText: "Status check failed",
      detail: error.message,
      lastUpdated: null,
      url,
      latencyMs: null
    };
  }
}

async function checkHtmlStatusProvider(name, url, { operationalPattern, issuePattern }) {
  if (process.env.EAIS_AI_HEALTH_SKIP_EXTERNAL === "1") {
    return skippedProvider(name, "vendor", url);
  }

  try {
    const { text, latencyMs } = await fetchTextWithTimeout(url);
    const compactText = text.replace(/\s+/g, " ").slice(0, 5000);
    const hasIssue = issuePattern.test(compactText);
    const status = hasIssue ? "watch" : operationalPattern.test(compactText) ? "operational" : "unknown";

    return {
      name,
      type: "vendor",
      status,
      statusText: providerStatusText(status),
      detail: hasIssue ? "Official status page is reporting an issue or degraded service." : status === "operational" ? "Official status page reports systems operational." : "Official status page responded, but EAIS could not confidently parse the status.",
      lastUpdated: null,
      url,
      latencyMs
    };
  } catch (error) {
    return {
      name,
      type: "vendor",
      status: "unknown",
      statusText: "Status check failed",
      detail: error.message,
      lastUpdated: null,
      url,
      latencyMs: null
    };
  }
}

function googleIncidentText(incident) {
  return [
    incident.external_desc,
    incident.service_name,
    incident.product_name,
    incident.most_recent_update?.text
  ].filter(Boolean).join(" ");
}

async function checkGoogleAiHealth() {
  const url = "https://status.cloud.google.com/incidents.json";
  if (process.env.EAIS_AI_HEALTH_SKIP_EXTERNAL === "1") {
    return skippedProvider("Google Gemini / Vertex AI", "vendor", url);
  }

  try {
    const { data, latencyMs } = await fetchJsonWithTimeout(url);
    const incidents = Array.isArray(data) ? data : [];
    const activeAiIncidents = incidents.filter((incident) => {
      const text = googleIncidentText(incident);
      return !incident.end && /\b(gemini|vertex ai|ai studio|generative ai|model garden)\b/i.test(text);
    });
    const severe = activeAiIncidents.some((incident) => /outage|service disruption|service outage/i.test(incident.most_recent_update?.status || incident.external_desc || ""));
    const status = activeAiIncidents.length ? (severe ? "down" : "watch") : "operational";

    return {
      name: "Google Gemini / Vertex AI",
      type: "vendor",
      status,
      statusText: providerStatusText(status),
      detail: activeAiIncidents.length ? activeAiIncidents.slice(0, 3).map((incident) => incident.external_desc || "Active Google AI incident").join(" | ") : "No active Gemini, Vertex AI, or AI Studio incidents found.",
      lastUpdated: activeAiIncidents[0]?.most_recent_update?.when || null,
      url: "https://status.cloud.google.com/",
      latencyMs
    };
  } catch (error) {
    return {
      name: "Google Gemini / Vertex AI",
      type: "vendor",
      status: "unknown",
      statusText: "Status check failed",
      detail: error.message,
      lastUpdated: null,
      url,
      latencyMs: null
    };
  }
}

async function checkKoraBridgeHealth() {
  const bridgeUrl = (process.env.EAIS_KORA_BRIDGE_URL || "").replace(/\/+$/, "");
  if (process.env.EAIS_AI_HEALTH_SKIP_EXTERNAL === "1") {
    return skippedProvider("Kora Bridge", "local", bridgeUrl ? `${bridgeUrl}/health` : "http://192.168.5.157:8791/health");
  }
  if (!bridgeUrl) {
    return skippedProvider("Kora Bridge", "local", "http://192.168.5.157:8791/health", "Bridge URL is not configured.");
  }

  const headers = {};
  if (process.env.EAIS_KORA_BRIDGE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EAIS_KORA_BRIDGE_TOKEN}`;
  }

  try {
    const { data, latencyMs } = await fetchJsonWithTimeout(`${bridgeUrl}/health`, { headers });
    return {
      name: "Kora Bridge",
      type: "local",
      status: data.ok === false ? "down" : "operational",
      statusText: data.ok === false ? "Down" : "Operational",
      detail: data.service ? `${data.service} ${data.provider || "bridge"}` : "Kora bridge health endpoint responded.",
      lastUpdated: new Date().toISOString(),
      url: `${bridgeUrl}/health`,
      latencyMs
    };
  } catch (error) {
    return {
      name: "Kora Bridge",
      type: "local",
      status: "down",
      statusText: "Down",
      detail: error.message,
      lastUpdated: null,
      url: `${bridgeUrl}/health`,
      latencyMs: null
    };
  }
}

async function checkKoraOllamaHealth() {
  const baseUrl = (
    process.env.EAIS_KORA_OLLAMA_BASE ||
    process.env.EAIS_KORA_BASE ||
    process.env.EAIS_JARVIS_BASE ||
    process.env.EAIS_OLLAMA_BASE ||
    "http://192.168.5.157:11434"
  ).replace(/\/+$/, "");

  if (process.env.EAIS_AI_HEALTH_SKIP_EXTERNAL === "1") {
    return skippedProvider("Kora Ollama", "local", `${baseUrl}/api/tags`);
  }

  try {
    const { data, latencyMs } = await fetchJsonWithTimeout(`${baseUrl}/api/tags`);
    const models = (data.models || []).slice(0, 3).map((model) => model.name).join(", ");
    return {
      name: "Kora Ollama",
      type: "local",
      status: "operational",
      statusText: "Operational",
      detail: models ? `Models available: ${models}` : "Ollama responded; no models listed.",
      lastUpdated: new Date().toISOString(),
      url: `${baseUrl}/api/tags`,
      latencyMs
    };
  } catch (error) {
    return {
      name: "Kora Ollama",
      type: "local",
      status: "down",
      statusText: "Down",
      detail: error.message,
      lastUpdated: null,
      url: `${baseUrl}/api/tags`,
      latencyMs: null
    };
  }
}

async function getAiHealth(options = {}) {
  const now = Date.now();
  if (!options.force && aiHealthCache.data && aiHealthCache.expiresAt > now) {
    return aiHealthCache.data;
  }

  const providers = await Promise.all([
    checkStatusPageProvider("OpenAI / ChatGPT", "https://status.openai.com/api/v2/summary.json"),
    checkStatusPageProvider("Anthropic / Claude", "https://status.anthropic.com/api/v2/summary.json"),
    checkGoogleAiHealth(),
    checkInstatusProvider("Perplexity", "https://status.perplexity.com/v3/summary.json"),
    checkHtmlStatusProvider("Mistral AI", "https://status.mistral.ai/", {
      operationalPattern: /all systems operational|all services are online|0 services experiencing issues/i,
      issuePattern: /service experiencing issues|degraded|partial outage|major outage|investigating/i
    }),
    checkHtmlStatusProvider("Cohere", "https://status.cohere.com/", {
      operationalPattern: /fully operational|all systems operational|not aware of any issues/i,
      issuePattern: /active incident|degraded|partial outage|major outage|investigating|issue affecting|service disruption/i
    }),
    Promise.resolve(skippedProvider("xAI Grok", "vendor", "https://status.x.ai", "No stable public JSON status API is configured yet.")),
    Promise.resolve(skippedProvider("Kimi / Moonshot AI", "vendor", "https://platform.moonshot.ai", "No stable public JSON status API is configured yet.")),
    Promise.resolve(skippedProvider("Groq", "vendor", "https://status.groq.com", "No stable public JSON status API is configured yet.")),
    Promise.resolve(skippedProvider("Meta Llama / Meta AI", "vendor", "https://metastatus.com/", "No dedicated public Meta AI/Llama status API is configured yet.")),
    checkKoraBridgeHealth(),
    checkKoraOllamaHealth()
  ]);

  const data = {
    ok: true,
    checkedAt: new Date().toISOString(),
    summary: summarizeAiProviders(providers),
    providers
  };
  aiHealthCache = {
    data,
    expiresAt: now + aiHealthCacheMs
  };

  return data;
}

async function serveVisionImage(response, pathname) {
  const fileName = decodeURIComponent(pathname.replace(/^\/api\/vision-board\/images\//, ""));
  if (!/^[a-f0-9-]+\.(gif|jpg|png|webp)$/i.test(fileName)) {
    sendError(response, 400, "Invalid image name.");
    return true;
  }

  try {
    const file = await readFile(resolve(visionUploadsRoot, fileName));
    sendBinary(response, 200, file, contentTypes[extname(fileName).toLowerCase()] || "application/octet-stream");
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(response, 404, "Image not found.");
      return true;
    }
    throw error;
  }

  return true;
}

async function serveStatic(request, response, pathname) {
  const filePath = safeStaticPath(pathname);

  if (!filePath) {
    sendError(response, 403, "Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      sendError(response, 404, "Not found");
      return;
    }
    throw error;
  }
}

async function serveLogin(response) {
  const file = await readFile(join(dashboardRoot, "login.html"));
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(file);
}

async function handleApi(request, response, url, db) {
  if (url.pathname === "/api/auth/login") {
    if (request.method !== "POST") {
      sendError(response, 405, "Method not allowed.");
      return true;
    }

    const payload = await readJsonBody(request);
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (!validateLogin(username, password)) {
      sendError(response, 401, "Invalid username or password.");
      return true;
    }

    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": createSessionCookie(username)
    });
    response.end(JSON.stringify({ ok: true }, null, 2));
    return true;
  }

  if (url.pathname === "/api/auth/logout") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie()
    });
    response.end(JSON.stringify({ ok: true }, null, 2));
    return true;
  }

  if (url.pathname === "/api/auth/session") {
    sendJson(response, 200, {
      ok: true,
      authenticated: isAuthorized(request)
    });
    return true;
  }

  if (url.pathname === "/api/kora/chat" || url.pathname === "/api/jarvis/chat") {
    if (request.method !== "POST") {
      sendError(response, 405, "Method not allowed.");
      return true;
    }

    try {
      const payload = await readJsonBody(request);
      const message = normalizeKoraMessage(payload.message);
      if (!message) {
        sendError(response, 400, "Message is required.");
        return true;
      }

      const result = await getKoraChatReply(message);
      sendJson(response, 200, {
        ok: true,
        provider: result.provider,
        model: result.model,
        reply: result.reply
      });
    } catch (error) {
      sendError(response, error.status || 502, error.message || "Kora bridge failed.");
    }
    return true;
  }

  if (url.pathname === "/api/vision-board") {
    if (request.method !== "GET") {
      sendError(response, 405, "Method not allowed.");
      return true;
    }

    sendJson(response, 200, {
      ok: true,
      items: (await readVisionItems()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    });
    return true;
  }

  if (url.pathname === "/api/vision-board/images" && request.method === "POST") {
    try {
      const payload = await readJsonBody(request);
      const image = decodeVisionImage(payload.imageData);
      const id = randomUUID();
      const fileName = `${id}${image.extension}`;
      const title = normalizeVisionTitle(payload.title, payload.fileName?.replace(/\.[^.]+$/, ""));
      const item = {
        id,
        title,
        description: String(payload.description || "Uploaded vision board image.").trim().slice(0, 180),
        imageUrl: `/api/vision-board/images/${fileName}`,
        fileName,
        mimeType: image.mimeType,
        createdAt: new Date().toISOString()
      };
      const items = await readVisionItems();

      await mkdir(visionUploadsRoot, { recursive: true });
      await writeFile(resolve(visionUploadsRoot, fileName), image.bytes);
      await writeVisionItems([item, ...items]);
      sendJson(response, 201, { ok: true, item });
    } catch (error) {
      sendError(response, 400, error.message || "Image upload failed.");
    }
    return true;
  }

  if (url.pathname.startsWith("/api/vision-board/images/")) {
    if (request.method !== "GET") {
      sendError(response, 405, "Method not allowed.");
      return true;
    }
    return serveVisionImage(response, url.pathname);
  }

  if (url.pathname === "/api/health") {
    let dbExists = false;
    try {
      const info = await stat(eaisDbPath());
      dbExists = info.isFile();
    } catch {
      dbExists = false;
    }

    sendJson(response, 200, {
      ok: true,
      service: "eais-dashboard",
      dbPath: eaisDbPath(),
      dbExists,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version
    });
    return true;
  }

  if (url.pathname === "/api/ai-health") {
    if (request.method !== "GET") {
      sendError(response, 405, "Method not allowed.");
      return true;
    }

    sendJson(response, 200, await getAiHealth({ force: url.searchParams.get("refresh") === "1" }));
    return true;
  }

  if (url.pathname === "/api/summary") {
    sendJson(response, 200, { ok: true, summary: getEaisSummary(db) });
    return true;
  }

  if (url.pathname === "/api/items") {
    const triage = url.searchParams.get("triage") || "all";
    const limit = url.searchParams.get("limit") || 8;
    sendJson(response, 200, { ok: true, items: listEaisItems(db, { triage, limit }) });
    return true;
  }

  if (url.pathname === "/api/sources") {
    sendJson(response, 200, { ok: true, sources: listEaisSources(db) });
    return true;
  }

  if (url.pathname === "/api/history") {
    const days = url.searchParams.get("days") || 10;
    sendJson(response, 200, {
      ok: true,
      history: getEaisHistory(db, { days }),
      topicMix: getEaisTopicMix(db)
    });
    return true;
  }

  if (url.pathname === "/api/recent-briefings") {
    sendJson(response, 200, { ok: true, briefings: listRecentBriefings(db) });
    return true;
  }

  if (url.pathname === "/api/ops") {
    sendJson(response, 200, {
      ok: true,
      timer: await getTimerStatus(),
      integrations: getIntegrationStatus(),
      briefings: listRecentBriefings(db, { limit: 5 }),
      runHistory: listRunHistory(db, { limit: 8 }),
      backlog: listBacklogItems(db, { limit: 8 })
    });
    return true;
  }

  if (url.pathname === "/api/backlog") {
    sendJson(response, 200, {
      ok: true,
      backlog: listBacklogItems(db)
    });
    return true;
  }

  if (url.pathname === "/api/integrations") {
    sendJson(response, 200, {
      ok: true,
      integrations: getIntegrationStatus()
    });
    return true;
  }

  if (url.pathname === "/api/system") {
    const summary = getEaisSummary(db);
    const integrations = getIntegrationStatus();
    sendJson(response, 200, {
      ok: true,
      system: {
        host,
        port,
        dbPath: eaisDbPath(),
        importedDigestItems: summary.totalItems,
        importedRuns: summary.importedRuns,
        todayItems: summary.todayItems,
        signalItems: summary.triageCounts.SIGNAL || 0,
        serviceStatus: "running",
        timer: await getTimerStatus(),
        integrations,
        processUptimeSeconds: Math.round(process.uptime()),
        node: process.version
      }
    });
    return true;
  }

  return false;
}

export async function createEaisServer() {
  const db = await ensureEaisDatabase();

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

      if (url.pathname === "/login" || url.pathname === "/login.html") {
        if (isAuthorized(request, { allowBasic: false })) {
          sendRedirect(response, "/");
          return;
        }
        await serveLogin(response);
        return;
      }

      if (url.pathname === "/api/auth/login") {
        await handleApi(request, response, url, db);
        return;
      }

      if (!isAuthorized(request, { allowBasic: url.pathname.startsWith("/api/") })) {
        if (url.pathname.startsWith("/api/")) {
          sendAuthRequired(response);
        } else {
          sendRedirect(response, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
        }
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        const handled = await handleApi(request, response, url, db);
        if (!handled) {
          sendError(response, 404, "API endpoint not found");
        }
        return;
      }

      await serveStatic(request, response, url.pathname);
    } catch (error) {
      console.error(error);
      sendError(response, 500, "Internal server error");
    }
  });

  server.on("close", () => {
    db.close();
  });

  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const server = await createEaisServer();
  server.listen(port, host, () => {
    console.log(`EAIS dashboard listening at http://${host}:${port}`);
  });
}
