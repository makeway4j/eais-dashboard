import { resolve } from "node:path";
import { loadEnv, envInt } from "../config/env.mjs";
import { loadSampleItems } from "../fetch/sample.mjs";
import { fetchLiveItems } from "../fetch/rss.mjs";
import { dedupeItems, normalizeForDigest } from "../analyze/classify.mjs";
import { enhanceWithOpenAI } from "../analyze/openai-summary.mjs";
import { rankItems } from "../analyze/rank.mjs";
import { renderToFile } from "../email/render.mjs";
import { sendEmail } from "../email/send.mjs";
import { log, logError } from "../utils/logger.mjs";

async function main() {
  await loadEnv();

  const args = new Set(process.argv.slice(2));
  const useSample = args.has("--sample");
  const forceSend = args.has("--send");
  if (args.has("--dry-run")) {
    process.env.EMAIL_SEND_MODE = "dry-run";
  }

  await log("daily job started", { useSample, forceSend });

  const rawItems = useSample
    ? await loadSampleItems()
    : await fetchLiveItems();

  const maxTotalItems = envInt("MAX_TOTAL_ITEMS", 24);
  const localItems = rankItems(dedupeItems(normalizeForDigest(rawItems))).slice(0, maxTotalItems);
  const items = rankItems(await enhanceWithOpenAI(localItems)).slice(0, maxTotalItems);

  const outputPath = resolve("dist", "daily-update.html");
  const result = await renderToFile({ items, outputPath });
  const sendResult = await sendEmail({ subject: result.subject, html: result.html, forceSend });

  console.log(`Subject: ${result.subject}`);
  console.log(`Rendered: ${result.outputPath}`);
  console.log(`Items: ${items.length}`);
  console.log(`Email: ${sendResult.sent ? "sent" : "not sent"} (${sendResult.mode || sendResult.messageId})`);

  await log("daily job finished", {
    outputPath: result.outputPath,
    itemCount: items.length,
    emailSent: sendResult.sent
  });
}

main().catch(async (error) => {
  console.error(error);
  await logError("daily job failed", error);
  process.exitCode = 1;
});
