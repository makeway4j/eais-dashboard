import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const execFileAsync = promisify(execFile);

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(projectRoot, "dist", "daily-update.html");
const tempDir = await mkdtemp(resolve(tmpdir(), "eais-render-"));
const testDbPath = resolve(tempDir, "eais.db");
const archiveDir = resolve(tempDir, "joplin");

try {
  await execFileAsync(process.execPath, ["src/jobs/daily.mjs", "--sample"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      EAIS_DB_PATH: testDbPath,
      EMAIL_SEND_MODE: "dry-run",
      JOPLIN_SAVE_MODE: "local",
      JOPLIN_LOCAL_EXPORT_DIR: archiveDir
    }
  });

  const output = await stat(outputPath);
  if (!output.isFile() || output.size < 1000) {
    throw new Error("Expected generated HTML email to exist and contain substantial markup.");
  }

  const html = await readFile(outputPath, "utf8");
  for (const requiredText of ["James's Daily Briefing", "AI Governance", "Major AI Vendors", "Data Centers", "AI Tools &amp; Agents", "Model Versions &amp; Releases", "Topic Section"]) {
    if (!html.includes(requiredText)) {
      throw new Error(`Generated HTML is missing required text: ${requiredText}`);
    }
  }

  const archivePath = resolve(archiveDir, `${new Date().toISOString().slice(0, 10)}-daily-briefing.md`);
  const archiveFiles = await stat(archivePath);
  if (!archiveFiles.isFile()) {
    throw new Error("Expected Joplin local archive markdown to be written.");
  }

  const archiveMarkdown = await readFile(archivePath, "utf8");
  for (const requiredText of ["## Topic Sections", "## AI Governance", "## AI Tools & Agents", "Why it matters:"]) {
    if (!archiveMarkdown.includes(requiredText)) {
      throw new Error(`Joplin archive markdown is missing required text: ${requiredText}`);
    }
  }

  const db = new DatabaseSync(testDbPath);
  const briefing = db.prepare("SELECT item_count AS itemCount, sent_status AS sentStatus, joplin_note_id AS joplinNoteId FROM briefings ORDER BY id DESC LIMIT 1").get();
  const run = db.prepare("SELECT status FROM run_history WHERE job_name = 'daily-brief' ORDER BY id DESC LIMIT 1").get();
  db.close();

  if (!briefing || briefing.itemCount < 1 || briefing.sentStatus !== "dry-run" || !briefing.joplinNoteId?.startsWith("local:")) {
    throw new Error("Expected rendered briefing to be recorded with local archive metadata.");
  }

  if (!run || run.status !== "success") {
    throw new Error("Expected daily-brief run history to be recorded as success.");
  }

  console.log("render smoke test passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
