import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { envString } from "../config/env.mjs";

function slugDate(value) {
  return value.toISOString().slice(0, 10);
}

function markdownLink(item) {
  const title = item.title || "Untitled item";
  const url = item.url || "";
  const summary = item.summary || item.whyItMatters || "";
  const link = url ? `[${title}](${url})` : title;
  return `- ${link}${summary ? ` - ${summary}` : ""}`;
}

function buildBriefingMarkdown({ subject, items, outputPath, generatedAt }) {
  const generated = generatedAt.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short"
  });

  return [
    `# ${subject}`,
    "",
    `Generated: ${generated}`,
    `HTML preview: ${outputPath}`,
    "",
    "## Executive Brief",
    "",
    `${items.length} tracked signals for AI governance, AI vendors, data centers, infrastructure, and related technology.`,
    "",
    "## Source Items",
    "",
    ...items.map(markdownLink)
  ].join("\n");
}

async function saveLocalArchive({ subject, items, outputPath, generatedAt }) {
  const archiveDir = resolve(envString("JOPLIN_LOCAL_EXPORT_DIR", "archives/joplin"));
  const archivePath = resolve(archiveDir, `${slugDate(generatedAt)}-daily-briefing.md`);
  const body = buildBriefingMarkdown({ subject, items, outputPath, generatedAt });

  await mkdir(archiveDir, { recursive: true });
  await writeFile(archivePath, body, "utf8");

  return {
    enabled: true,
    status: "saved-local",
    noteId: `local:${archivePath}`,
    path: archivePath
  };
}

async function saveJoplinApi({ subject, items, outputPath, generatedAt }) {
  const token = envString("JOPLIN_TOKEN");
  const apiBase = envString("JOPLIN_API_BASE", "http://127.0.0.1:41184").replace(/\/$/, "");
  const notebookId = envString("JOPLIN_NOTEBOOK_ID");

  if (!token) {
    throw new Error("JOPLIN_TOKEN is required when JOPLIN_SAVE_MODE=api.");
  }

  const url = new URL(`${apiBase}/notes`);
  url.searchParams.set("token", token);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: subject,
      body: buildBriefingMarkdown({ subject, items, outputPath, generatedAt }),
      ...(notebookId ? { parent_id: notebookId } : {})
    })
  });

  if (!response.ok) {
    throw new Error(`Joplin API save failed with HTTP ${response.status}.`);
  }

  const note = await response.json();
  return {
    enabled: true,
    status: "saved-api",
    noteId: note.id
  };
}

export async function saveDailyBriefingArchive({ subject, items, outputPath, generatedAt = new Date() }) {
  const mode = envString("JOPLIN_SAVE_MODE", "off").toLowerCase();

  if (mode === "off" || mode === "false" || mode === "0") {
    return { enabled: false, status: "skipped" };
  }

  if (mode === "local") {
    return saveLocalArchive({ subject, items, outputPath, generatedAt });
  }

  if (mode === "api") {
    return saveJoplinApi({ subject, items, outputPath, generatedAt });
  }

  throw new Error(`Unsupported JOPLIN_SAVE_MODE=${mode}. Use off, local, or api.`);
}
