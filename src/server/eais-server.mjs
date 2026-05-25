#!/usr/bin/env node
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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

function sendBinary(response, status, body, contentType) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=3600"
  });
  response.end(body);
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

async function handleApi(request, response, url, db) {
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
