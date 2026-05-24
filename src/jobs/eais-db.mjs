#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { ensureEaisDatabase, eaisDbPath, importLegacyDigest, legacyDigestDbPath, tableCount } from "../eais/db.mjs";

function printUsage() {
  console.log(`Usage:
  node src/jobs/eais-db.mjs init
  node src/jobs/eais-db.mjs import-digest [legacy-db-path]
  node src/jobs/eais-db.mjs summary

Environment:
  EAIS_DB_PATH            Defaults to data/eais.db
  LEGACY_DIGEST_DB_PATH   Defaults to /opt/digest/digest.db`);
}

function count(db, table) {
  return tableCount(db, table);
}

function printSummary(db) {
  const totals = {
    briefings: count(db, "briefings"),
    items: count(db, "items"),
    sources: count(db, "sources"),
    api_usage: count(db, "api_usage"),
    revenue_streams: count(db, "revenue_streams"),
    vision_items: count(db, "vision_items"),
    planner_events: count(db, "planner_events"),
    run_history: count(db, "run_history"),
    backlog_items: count(db, "backlog_items")
  };

  console.log(JSON.stringify({ dbPath: eaisDbPath(), totals }, null, 2));
}

async function main() {
  const command = process.argv[2];

  if (!command || command === "help" || command === "--help") {
    printUsage();
    return;
  }

  const db = await ensureEaisDatabase();

  if (command === "init") {
    console.log(JSON.stringify({ ok: true, dbPath: eaisDbPath() }, null, 2));
    return;
  }

  if (command === "summary") {
    printSummary(db);
    return;
  }

  if (command === "import-digest") {
    const digestPath = process.argv[3] || legacyDigestDbPath();
    await stat(digestPath);
    const result = await importLegacyDigest(db, digestPath);
    console.log(JSON.stringify({ ok: true, dbPath: eaisDbPath(), legacyDigestDbPath: digestPath, ...result }, null, 2));
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
