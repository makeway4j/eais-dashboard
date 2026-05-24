import { resolve } from "node:path";
import { loadEnv, envInt } from "../config/env.mjs";
import { loadSampleItems } from "../fetch/sample.mjs";
import { fetchLiveItems } from "../fetch/rss.mjs";
import { dedupeItems, normalizeForDigest } from "../analyze/classify.mjs";
import { enhanceWithOpenAI } from "../analyze/openai-summary.mjs";
import { rankItems } from "../analyze/rank.mjs";
import { saveDailyBriefingArchive } from "../archive/joplin.mjs";
import { renderToFile } from "../email/render.mjs";
import { sendEmail } from "../email/send.mjs";
import { ensureEaisDatabase, recordRunFinish, recordRunStart, upsertBriefing } from "../eais/db.mjs";
import { log, logError } from "../utils/logger.mjs";

async function main() {
  await loadEnv();

  const args = new Set(process.argv.slice(2));
  const useSample = args.has("--sample");
  const forceSend = args.has("--send");
  if (args.has("--dry-run")) {
    process.env.EMAIL_SEND_MODE = "dry-run";
  }

  const db = await ensureEaisDatabase();
  const runId = recordRunStart(db, "daily-brief", { useSample, forceSend });
  const generatedAt = new Date();

  await log("daily job started", { useSample, forceSend });

  try {
    const rawItems = useSample
      ? await loadSampleItems()
      : await fetchLiveItems();

    const maxTotalItems = envInt("MAX_TOTAL_ITEMS", 24);
    const localItems = rankItems(dedupeItems(normalizeForDigest(rawItems))).slice(0, maxTotalItems);
    const items = rankItems(await enhanceWithOpenAI(localItems)).slice(0, maxTotalItems);

    const outputPath = resolve("dist", "daily-update.html");
    const result = await renderToFile({ items, outputPath });
    const sendResult = await sendEmail({ subject: result.subject, html: result.html, forceSend });
    const archiveResult = await saveDailyBriefingArchive({
      subject: result.subject,
      items,
      outputPath: result.outputPath,
      generatedAt
    });
    const highPriorityCount = items.filter((item) => item.importance === "high").length;

    upsertBriefing(db, {
      briefingDate: generatedAt.toISOString().slice(0, 10),
      title: result.subject,
      htmlPath: result.outputPath,
      sentStatus: sendResult.sent ? "sent" : "dry-run",
      sentAt: sendResult.sent ? new Date().toISOString() : null,
      joplinNoteId: archiveResult.noteId || null,
      itemCount: items.length,
      highPriorityCount
    });

    console.log(`Subject: ${result.subject}`);
    console.log(`Rendered: ${result.outputPath}`);
    console.log(`Items: ${items.length}`);
    console.log(`Email: ${sendResult.sent ? "sent" : "not sent"} (${sendResult.mode || sendResult.messageId})`);
    console.log(`Archive: ${archiveResult.status}`);

    recordRunFinish(db, runId, {
      status: "success",
      details: {
        outputPath: result.outputPath,
        itemCount: items.length,
        highPriorityCount,
        emailSent: sendResult.sent,
        archiveStatus: archiveResult.status
      }
    });

    await log("daily job finished", {
      outputPath: result.outputPath,
      itemCount: items.length,
      emailSent: sendResult.sent,
      archiveStatus: archiveResult.status
    });
  } catch (error) {
    recordRunFinish(db, runId, {
      status: "failed",
      details: { error: error?.message || String(error) }
    });
    throw error;
  } finally {
    db.close();
  }
}

main().catch(async (error) => {
  console.error(error);
  await logError("daily job failed", error);
  process.exitCode = 1;
});
