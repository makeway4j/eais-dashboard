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
