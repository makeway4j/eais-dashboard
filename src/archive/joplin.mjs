import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { groupByTopic } from "../analyze/rank.mjs";
import { topics } from "../config/topics.mjs";
import { envString } from "../config/env.mjs";

function slugDate(value) {
  return value.toISOString().slice(0, 10);
}

function markdownLink(item) {
  const title = item.title || "Untitled item";
  const url = item.url || "";
  const summary = item.summary || item.whyItMatters || "";
  const link = url ? `[${title}](${url})` : title;
  const importance = item.importance ? item.importance.toUpperCase() : "WATCH";
  const source = item.source ? ` | ${item.source}` : "";
  const whyItMatters = item.whyItMatters ? `\n  - Why it matters: ${item.whyItMatters}` : "";

  return `- ${importance}${source}: ${link}${summary ? ` - ${summary}` : ""}${whyItMatters}`;
}

function buildBriefingMarkdown({ subject, items, outputPath, generatedAt }) {
  const grouped = groupByTopic(items);
  const generated = generatedAt.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short"
  });
  const sections = topics
    .map((topic) => {
      const topicItems = grouped[topic.id] || [];
      if (!topicItems.length) return "";

      return [
        `## ${topic.label}`,
        "",
        `${topic.description}`,
        "",
        ...topicItems.map(markdownLink),
        ""
      ].join("\n");
    })
    .filter(Boolean);

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
    "## Topic Sections",
    "",
    ...sections
  ].join("\n");
}

function joplinId() {
  return randomBytes(16).toString("hex");
}

function joplinTimestamp(value = new Date()) {
  return value.toISOString();
}

function parseSerializedJoplinItem(content) {
  const idMatch = content.match(/\nid: ([a-f0-9]{32})\r?\n/i);
  if (!idMatch) return null;

  const metadataStart = idMatch.index + 1;
  const body = content.slice(0, metadataStart).trimEnd();
  const metadataText = content.slice(metadataStart);
  const fields = {};

  for (const line of metadataText.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    fields[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1).trimStart();
  }

  return {
    body,
    title: body.split(/\r?\n/)[0] || "",
    fields
  };
}

function buildFolderSyncItem({ id, title, now }) {
  const timestamp = joplinTimestamp(now);
  return [
    title,
    "",
    `id: ${id}`,
    `created_time: ${timestamp}`,
    `updated_time: ${timestamp}`,
    `user_created_time: ${timestamp}`,
    `user_updated_time: ${timestamp}`,
    "encryption_cipher_text: ",
    "encryption_applied: 0",
    "parent_id: ",
    "is_shared: 0",
    "type_: 2"
  ].join("\n");
}

function buildNoteSyncItem({ id, parentId, title, body, now }) {
  const timestamp = joplinTimestamp(now);
  const order = now.getTime();
  return [
    title,
    "",
    body,
    "",
    `id: ${id}`,
    `parent_id: ${parentId}`,
    `created_time: ${timestamp}`,
    `updated_time: ${timestamp}`,
    "is_conflict: 0",
    "latitude: 0.00000000",
    "longitude: 0.00000000",
    "altitude: 0.0000",
    "author: EAIS",
    "source_url: ",
    "is_todo: 0",
    "todo_due: 0",
    "todo_completed: 0",
    "source: eais",
    "source_application: eais-dashboard",
    "application_data: ",
    `order: ${order}`,
    `user_created_time: ${timestamp}`,
    `user_updated_time: ${timestamp}`,
    "encryption_cipher_text: ",
    "encryption_applied: 0",
    "markup_language: 1",
    "is_shared: 0",
    "type_: 1"
  ].join("\n");
}

async function createJoplinServerSession({ serverBase, email, password }) {
  const response = await fetch(`${serverBase}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-MIN-VERSION": "2.6.0"
    },
    body: JSON.stringify({
      email,
      password,
      platform: 3,
      version: "EAIS"
    })
  });

  if (!response.ok) {
    throw new Error(`Joplin Server login failed with HTTP ${response.status}.`);
  }

  const session = await response.json();
  if (!session.id) {
    throw new Error("Joplin Server login did not return a session id.");
  }
  return session.id;
}

async function getJoplinServerAuthToken(serverBase) {
  const serverToken = envString("JOPLIN_SERVER_TOKEN");
  if (serverToken) return serverToken;

  const email = envString("JOPLIN_SERVER_EMAIL");
  const password = envString("JOPLIN_SERVER_PASSWORD");
  if (!email || !password) {
    throw new Error("JOPLIN_SERVER_TOKEN or JOPLIN_SERVER_EMAIL/JOPLIN_SERVER_PASSWORD is required when JOPLIN_SAVE_MODE=server.");
  }

  return createJoplinServerSession({ serverBase, email, password });
}

async function joplinServerFetch(serverBase, token, path, options = {}) {
  const response = await fetch(`${serverBase}${path}`, {
    ...options,
    headers: {
      "X-API-AUTH": token,
      "X-API-MIN-VERSION": "2.6.0",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Joplin Server request failed with HTTP ${response.status}: ${message.slice(0, 120)}`);
  }

  return response;
}

async function listJoplinServerRootItems(serverBase, token) {
  const items = [];
  let page = 1;
  let hasMore = false;

  do {
    const response = await joplinServerFetch(serverBase, token, `/api/items/root:/:/children?limit=100&page=${page}`);
    const data = await response.json();
    items.push(...(data.items || []));
    hasMore = Boolean(data.has_more);
    page += 1;
  } while (hasMore);

  return items;
}

async function getJoplinServerItemContent(serverBase, token, name) {
  const response = await joplinServerFetch(serverBase, token, `/api/items/root:/${encodeURIComponent(name)}:/content`);
  return response.text();
}

async function uploadJoplinServerItem(serverBase, token, itemId, content) {
  const formData = new FormData();
  formData.set("file", new Blob([content], { type: "text/plain" }), `${itemId}.md`);

  const response = await joplinServerFetch(serverBase, token, `/api/items/root:/${itemId}.md:/content`, {
    method: "PUT",
    body: formData
  });
  return response.json();
}

async function findServerNotebookId({ serverBase, token, title }) {
  const items = await listJoplinServerRootItems(serverBase, token);

  for (const item of items) {
    if (!item.name?.endsWith(".md")) continue;
    const content = await getJoplinServerItemContent(serverBase, token, item.name);
    const parsed = parseSerializedJoplinItem(content);
    if (parsed?.fields?.type_ === "2" && parsed.title === title) {
      return parsed.fields.id;
    }
  }

  return null;
}

async function ensureServerNotebook({ serverBase, token, now }) {
  const configuredNotebookId = envString("JOPLIN_NOTEBOOK_ID");
  if (configuredNotebookId) return configuredNotebookId;

  const title = envString("JOPLIN_NOTEBOOK_TITLE", "EAIS");
  const existingNotebookId = await findServerNotebookId({ serverBase, token, title });
  if (existingNotebookId) return existingNotebookId;

  const notebookId = joplinId();
  await uploadJoplinServerItem(serverBase, token, notebookId, buildFolderSyncItem({
    id: notebookId,
    title,
    now
  }));
  return notebookId;
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

async function saveJoplinServer({ subject, items, outputPath, generatedAt }) {
  const serverBase = envString("JOPLIN_SERVER_BASE", "http://127.0.0.1:22300").replace(/\/$/, "");
  const token = await getJoplinServerAuthToken(serverBase);
  const notebookId = await ensureServerNotebook({ serverBase, token, now: generatedAt });
  const noteId = joplinId();
  const body = buildBriefingMarkdown({ subject, items, outputPath, generatedAt });

  await uploadJoplinServerItem(serverBase, token, noteId, buildNoteSyncItem({
    id: noteId,
    parentId: notebookId,
    title: subject,
    body,
    now: generatedAt
  }));

  return {
    enabled: true,
    status: "saved-server",
    noteId
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

  if (mode === "server") {
    return saveJoplinServer({ subject, items, outputPath, generatedAt });
  }

  throw new Error(`Unsupported JOPLIN_SAVE_MODE=${mode}. Use off, local, api, or server.`);
}
