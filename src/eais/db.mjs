import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const schemaPath = resolve(projectRoot, "src", "eais", "schema.sql");

export function eaisDbPath() {
  return resolve(process.env.EAIS_DB_PATH || "data/eais.db");
}

export function legacyDigestDbPath() {
  return resolve(process.env.LEGACY_DIGEST_DB_PATH || "/opt/digest/digest.db");
}

export async function ensureEaisDatabase(dbPath = eaisDbPath()) {
  await mkdir(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  const schema = await readFile(schemaPath, "utf8");
  db.exec(schema);
  return db;
}

export function openEaisDatabase(dbPath = eaisDbPath()) {
  return new DatabaseSync(dbPath);
}

export function quoteSqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function tableCount(db, table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

export function getEaisSummary(db) {
  const totalItems = tableCount(db, "items");
  const triageRows = db.prepare(`
    SELECT COALESCE(triage, 'UNTRIAGED') AS triage, COUNT(*) AS count
    FROM items
    GROUP BY COALESCE(triage, 'UNTRIAGED')
  `).all();

  const triageCounts = Object.fromEntries(triageRows.map((row) => [row.triage, row.count]));
  const todayItems = db.prepare("SELECT COUNT(*) AS count FROM items WHERE date(fetched_at) = date('now')").get().count;
  const todaySignals = db.prepare("SELECT COUNT(*) AS count FROM items WHERE triage = 'SIGNAL' AND date(fetched_at) = date('now')").get().count;
  const categoryCount = db.prepare("SELECT COUNT(DISTINCT category) AS count FROM items").get().count;
  const importedRuns = db.prepare("SELECT COUNT(*) AS count FROM run_history WHERE job_name = 'import-digest'").get().count;

  return {
    totalItems,
    todayItems,
    todaySignals,
    categoryCount,
    importedRuns,
    triageCounts
  };
}

export function listEaisItems(db, { triage, limit = 8 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 8, 50));
  const params = {};
  let where = "WHERE title IS NOT NULL AND trim(title) != ''";

  if (triage && triage !== "all") {
    where += " AND triage = $triage";
    params.$triage = triage;
  }

  return db.prepare(`
    SELECT
      id,
      source,
      category,
      title,
      url,
      body,
      fetched_at AS fetchedAt,
      score,
      triage,
      analysis,
      status
    FROM items
    ${where}
    ORDER BY
      CASE triage
        WHEN 'SIGNAL' THEN 1
        WHEN 'WATCH' THEN 2
        WHEN 'DEFERRED' THEN 3
        WHEN 'REJECT' THEN 5
        ELSE 4
      END,
      COALESCE(score, 0) DESC,
      fetched_at DESC
    LIMIT ${normalizedLimit}
  `).all(params);
}

export function listEaisSources(db) {
  return db.prepare(`
    SELECT
      category,
      source,
      COUNT(*) AS itemCount,
      MAX(fetched_at) AS lastFetchedAt,
      SUM(CASE WHEN triage = 'SIGNAL' THEN 1 ELSE 0 END) AS signalCount,
      SUM(CASE WHEN triage IS NULL THEN 1 ELSE 0 END) AS untriagedCount
    FROM items
    GROUP BY category, source
    ORDER BY itemCount DESC, category ASC
  `).all();
}

export function getEaisHistory(db, { days = 10 } = {}) {
  const normalizedDays = Math.max(1, Math.min(Number(days) || 10, 30));
  return db.prepare(`
    SELECT
      date(fetched_at) AS digestDate,
      COUNT(*) AS itemCount,
      SUM(CASE WHEN triage = 'SIGNAL' THEN 1 ELSE 0 END) AS signalCount,
      SUM(CASE WHEN triage = 'WATCH' THEN 1 ELSE 0 END) AS watchCount,
      SUM(CASE WHEN triage = 'DEFERRED' THEN 1 ELSE 0 END) AS deferredCount,
      (
        SELECT title
        FROM items AS ranked
        WHERE date(ranked.fetched_at) = date(items.fetched_at)
          AND title IS NOT NULL
          AND trim(title) != ''
        ORDER BY
          CASE triage
            WHEN 'SIGNAL' THEN 1
            WHEN 'WATCH' THEN 2
            WHEN 'DEFERRED' THEN 3
            ELSE 4
          END,
          COALESCE(score, 0) DESC
        LIMIT 1
      ) AS topTitle
    FROM items
    GROUP BY date(fetched_at)
    ORDER BY digestDate DESC
    LIMIT ${normalizedDays}
  `).all();
}

export function getEaisTopicMix(db) {
  return db.prepare(`
    SELECT category, COUNT(*) AS itemCount
    FROM items
    GROUP BY category
    ORDER BY itemCount DESC
    LIMIT 8
  `).all();
}

export function recordRunStart(db, jobName, details = {}) {
  const result = db.prepare(`
    INSERT INTO run_history (job_name, status, details)
    VALUES (?, 'running', ?)
  `).run(jobName, JSON.stringify(details));

  return result.lastInsertRowid;
}

export function recordRunFinish(db, runId, { status, details = {}, logPath = null } = {}) {
  db.prepare(`
    UPDATE run_history
    SET status = ?, finished_at = CURRENT_TIMESTAMP, details = ?, log_path = ?
    WHERE id = ?
  `).run(status, JSON.stringify(details), logPath, runId);
}

export function upsertBriefing(db, briefing) {
  const {
    briefingDate,
    title,
    htmlPath = null,
    sentStatus = "draft",
    sentAt = null,
    joplinNoteId = null,
    itemCount = 0,
    highPriorityCount = 0
  } = briefing;

  db.prepare(`
    INSERT INTO briefings (
      briefing_date,
      title,
      html_path,
      sent_status,
      sent_at,
      joplin_note_id,
      item_count,
      high_priority_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(briefing_date) DO UPDATE SET
      title = excluded.title,
      html_path = excluded.html_path,
      sent_status = excluded.sent_status,
      sent_at = excluded.sent_at,
      joplin_note_id = excluded.joplin_note_id,
      item_count = excluded.item_count,
      high_priority_count = excluded.high_priority_count,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    briefingDate,
    title,
    htmlPath,
    sentStatus,
    sentAt,
    joplinNoteId,
    itemCount,
    highPriorityCount
  );
}

export async function importLegacyDigest(db, digestPath = legacyDigestDbPath()) {
  const before = tableCount(db, "items");
  const escapedPath = quoteSqlString(digestPath);

  db.exec(`ATTACH DATABASE ${escapedPath} AS legacy_digest`);
  db.exec("BEGIN");
  try {
    db.exec(`
      INSERT OR IGNORE INTO items (
        id,
        legacy_id,
        source,
        category,
        title,
        url,
        body,
        author,
        pub_date,
        fetched_at,
        score,
        triage,
        analysis,
        status,
        briefed_at
      )
      SELECT
        'digest:' || id,
        id,
        source,
        category,
        title,
        url,
        body,
        author,
        pub_date,
        fetched_at,
        score,
        triage,
        analysis,
        CASE
          WHEN triage = 'SIGNAL' THEN 'signal'
          WHEN triage = 'WATCH' THEN 'watch'
          WHEN triage = 'DEFERRED' THEN 'deferred'
          WHEN triage = 'REJECT' THEN 'rejected'
          ELSE 'new'
        END,
        briefed_at
      FROM legacy_digest.items
    `);
    const after = tableCount(db, "items");
    const inserted = after - before;
    const details = JSON.stringify({ legacyPath: digestPath, before, after, inserted });
    db.prepare(`
      INSERT INTO run_history (job_name, status, finished_at, details)
      VALUES ('import-digest', 'success', CURRENT_TIMESTAMP, ?)
    `).run(details);

    db.exec("COMMIT");
    db.exec("DETACH DATABASE legacy_digest");
    return { before, after, inserted };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures so the original error is preserved.
    }
    try {
      db.exec("DETACH DATABASE legacy_digest");
    } catch {
      // Ignore detach failures so the original error is preserved.
    }
    throw error;
  }
}
