import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureEaisDatabase } from "../src/eais/db.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "eais-server-"));
const eaisDbPath = join(tempDir, "eais.db");
process.env.EAIS_DB_PATH = eaisDbPath;
process.env.EMAIL_SEND_MODE = "dry-run";
process.env.EMAIL_PROVIDER = "gmail_smtp";
process.env.EMAIL_FROM = "EAIS Test <eais@example.com>";
process.env.EMAIL_TO = "owner@example.com";
process.env.SMTP_USER = "eais@example.com";
process.env.SMTP_PASS = "test-password";
process.env.JOPLIN_SAVE_MODE = "local";
process.env.EAIS_VISION_BOARD_DIR = join(tempDir, "vision-board");

let server;
let protectedServer;

function basicAuth(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

try {
  const db = await ensureEaisDatabase(eaisDbPath);
  db.prepare(`
    INSERT INTO items (id, source, category, title, url, body, fetched_at, score, triage, analysis, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "server-test-1",
    "rss",
    "ai",
    "Server test signal",
    "https://example.com/server-test",
    "Server test body",
    new Date().toISOString(),
    0.94,
    "SIGNAL",
    "Server test analysis.",
    "signal"
  );
  db.prepare(`
    INSERT INTO briefings (briefing_date, title, html_path, sent_status, joplin_note_id, item_count, high_priority_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    "2026-05-24",
    "James's Daily Briefing - May 24",
    "/tmp/daily-update.html",
    "dry-run",
    "local:/tmp/2026-05-24-daily-briefing.md",
    24,
    7
  );
  db.prepare(`
    INSERT INTO run_history (job_name, status, finished_at, details)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?)
  `).run("daily-brief", "success", JSON.stringify({ outputPath: "/tmp/daily-update.html" }));
  db.prepare(`
    INSERT INTO backlog_items (task, project, priority, status, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run("Improve email topic boundaries", "EAIS", "high", "open", "Make section breaks clearer in the daily briefing.");
  db.close();

  const { createEaisServer } = await import("../src/server/eais-server.mjs");
  server = await createEaisServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  const summary = await fetch(`${baseUrl}/api/summary`).then((response) => response.json());
  const items = await fetch(`${baseUrl}/api/items?triage=SIGNAL&limit=1`).then((response) => response.json());
  const sources = await fetch(`${baseUrl}/api/sources`).then((response) => response.json());
  const history = await fetch(`${baseUrl}/api/history`).then((response) => response.json());
  const system = await fetch(`${baseUrl}/api/system`).then((response) => response.json());
  const briefings = await fetch(`${baseUrl}/api/recent-briefings`).then((response) => response.json());
  const ops = await fetch(`${baseUrl}/api/ops`).then((response) => response.json());
  const integrations = await fetch(`${baseUrl}/api/integrations`).then((response) => response.json());
  const html = await fetch(baseUrl).then((response) => response.text());
  const koraUnconfigured = await fetch(`${baseUrl}/api/kora/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Are you connected?" })
  });
  const visionBefore = await fetch(`${baseUrl}/api/vision-board`).then((response) => response.json());
  const uploadedVision = await fetch(`${baseUrl}/api/vision-board/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Smoke Test Vision Image",
      fileName: "smoke.png",
      imageData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwC+WQAAAABJRU5ErkJggg=="
    })
  }).then((response) => response.json());
  const corruptVision = await fetch(`${baseUrl}/api/vision-board/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Bad Vision Image",
      fileName: "bad.png",
      imageData: "data:image/png;base64,AAAA"
    })
  });
  const visionAfter = await fetch(`${baseUrl}/api/vision-board`).then((response) => response.json());
  const uploadedImage = await fetch(`${baseUrl}${uploadedVision.item?.imageUrl || ""}`);

  if (!health.ok || health.service !== "eais-dashboard") {
    throw new Error("Expected health endpoint to report EAIS dashboard service.");
  }

  if (summary.summary.totalItems !== 1 || summary.summary.todaySignals !== 1) {
    throw new Error("Expected summary endpoint to report the test signal.");
  }

  if (items.items[0]?.title !== "Server test signal") {
    throw new Error("Expected items endpoint to return the test signal.");
  }

  if (sources.sources[0]?.category !== "ai") {
    throw new Error("Expected sources endpoint to group the test signal category.");
  }

  if (history.history[0]?.itemCount !== 1 || history.topicMix[0]?.category !== "ai") {
    throw new Error("Expected history endpoint to summarize the test signal.");
  }

  if (system.system.importedDigestItems !== 1 || system.system.serviceStatus !== "running") {
    throw new Error("Expected system endpoint to report dashboard and database status.");
  }

  if (briefings.briefings[0]?.sentStatus !== "dry-run") {
    throw new Error("Expected recent briefings endpoint to return the dry-run briefing.");
  }

  if (ops.briefings[0]?.joplinNoteId?.startsWith("local:") !== true || ops.runHistory[0]?.jobName !== "daily-brief") {
    throw new Error("Expected ops endpoint to return briefing archive and run history.");
  }

  if (ops.backlog[0]?.task !== "Improve email topic boundaries") {
    throw new Error("Expected ops endpoint to return backlog items.");
  }

  if (integrations.integrations.email.status !== "configured" || integrations.integrations.joplin.status !== "ready") {
    throw new Error("Expected integrations endpoint to report configured email and ready local Joplin archive.");
  }

  if (system.system.integrations.email.provider !== "gmail_smtp") {
    throw new Error("Expected system endpoint to include integration readiness.");
  }

  if (!html.includes("EAIS Command Surface")) {
    throw new Error("Expected root route to serve the EAIS dashboard.");
  }

  if (koraUnconfigured.status !== 503) {
    throw new Error("Expected Kora chat endpoint to require bridge configuration.");
  }

  if (visionBefore.items.length !== 0 || uploadedVision.item?.title !== "Smoke Test Vision Image" || visionAfter.items[0]?.id !== uploadedVision.item.id) {
    throw new Error("Expected vision board image upload to persist metadata.");
  }

  if (corruptVision.status !== 400) {
    throw new Error("Expected corrupt vision board image uploads to be rejected.");
  }

  if (!uploadedImage.ok || uploadedImage.headers.get("content-type") !== "image/png") {
    throw new Error("Expected uploaded vision board image to be served as PNG.");
  }

  process.env.EAIS_AUTH_USER = "James";
  process.env.EAIS_AUTH_PASS = "test-secret";
  protectedServer = await createEaisServer();
  await new Promise((resolve) => protectedServer.listen(0, "127.0.0.1", resolve));
  const protectedBaseUrl = `http://127.0.0.1:${protectedServer.address().port}`;
  const denied = await fetch(`${protectedBaseUrl}/api/health`);
  const allowed = await fetch(`${protectedBaseUrl}/api/health`, {
    headers: { Authorization: basicAuth("James", "test-secret") }
  });

  if (denied.status !== 401 || denied.headers.get("www-authenticate")?.includes("Basic realm=\"EAIS\"") !== true) {
    throw new Error("Expected EAIS auth to require Basic credentials when configured.");
  }

  if (!allowed.ok) {
    throw new Error("Expected EAIS auth to accept configured Basic credentials.");
  }

  console.log("EAIS server smoke test passed");
} finally {
  delete process.env.EAIS_AUTH_USER;
  delete process.env.EAIS_AUTH_PASS;

  if (protectedServer) {
    await new Promise((resolve) => protectedServer.close(resolve));
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(tempDir, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 4 || error.code !== "EBUSY") {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
