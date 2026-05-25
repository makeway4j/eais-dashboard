#!/usr/bin/env node
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
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
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

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
