import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureEaisDatabase, importLegacyDigest, upsertBriefing } from "../src/eais/db.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "eais-db-"));
const eaisDbPath = join(tempDir, "eais.db");
const legacyDbPath = join(tempDir, "digest.db");

try {
  const legacyDb = new DatabaseSync(legacyDbPath);
  legacyDb.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT,
      url TEXT,
      body TEXT,
      author TEXT,
      view_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      hashtags TEXT,
      pub_date TEXT,
      fetched_at TEXT NOT NULL,
      score REAL,
      triage TEXT,
      analysis TEXT,
      briefed_at TEXT
    );
  `);
  legacyDb.prepare(`
    INSERT INTO items (id, source, category, title, url, body, fetched_at, score, triage, analysis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "legacy-1",
    "rss",
    "ai",
    "Example AI signal",
    "https://example.com/ai",
    "Example body",
    "2026-05-24T06:00:00Z",
    0.91,
    "SIGNAL",
    "Useful migration test."
  );
  legacyDb.close();

  process.env.EAIS_DB_PATH = eaisDbPath;
  const eaisDb = await ensureEaisDatabase(eaisDbPath);
  await importLegacyDigest(eaisDb, legacyDbPath);
  upsertBriefing(eaisDb, {
    briefingDate: "2026-05-24",
    title: "AI Daily Briefing - May 24",
    sentStatus: "sent",
    sentAt: "2026-05-24T11:00:00.000Z",
    itemCount: 24,
    highPriorityCount: 8
  });
  upsertBriefing(eaisDb, {
    briefingDate: "2026-05-24",
    title: "AI Daily Briefing - May 24",
    sentStatus: "dry-run",
    sentAt: null,
    itemCount: 24,
    highPriorityCount: 8
  });
  eaisDb.close();

  const db = new DatabaseSync(eaisDbPath);
  const imported = db.prepare("SELECT id, legacy_id, status FROM items WHERE legacy_id = ?").get("legacy-1");
  const runs = db.prepare("SELECT COUNT(*) AS count FROM run_history WHERE job_name = 'import-digest' AND status = 'success'").get();
  const briefing = db.prepare("SELECT sent_status AS sentStatus, sent_at AS sentAt FROM briefings WHERE briefing_date = ?").get("2026-05-24");
  db.close();

  if (!imported || imported.id !== "digest:legacy-1" || imported.status !== "signal") {
    throw new Error("Expected legacy digest item to import as a signal item.");
  }

  if (runs.count !== 1) {
    throw new Error("Expected import-digest run history to be recorded.");
  }

  if (briefing.sentStatus !== "sent" || briefing.sentAt !== "2026-05-24T11:00:00.000Z") {
    throw new Error("Expected dry-run briefing upsert to preserve an existing sent status.");
  }

  console.log("EAIS database smoke test passed");
} finally {
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
