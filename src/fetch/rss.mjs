import { XMLParser } from "fast-xml-parser";
import { envInt } from "../config/env.mjs";
import { liveSources } from "../config/live-sources.mjs";
import { log, logError } from "../utils/logger.mjs";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true
});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return value["#text"] || value._ || value.text || "";
  return "";
}

function linkValue(item) {
  if (typeof item.link === "string") return item.link;
  if (Array.isArray(item.link)) {
    const alternate = item.link.find((link) => link.rel === "alternate") || item.link[0];
    return alternate?.href || textValue(alternate);
  }
  return item.link?.href || textValue(item.link) || textValue(item.guid) || "";
}

function itemDate(item) {
  return textValue(item.pubDate || item.published || item.updated || item["dc:date"] || item.date) || new Date().toISOString();
}

function stripHtml(value) {
  return textValue(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeywords(source, item) {
  if (!source.includeKeywords?.length) return true;
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  return source.includeKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function normalizeItems(source, parsed) {
  const rssItems = asArray(parsed.rss?.channel?.item);
  const atomEntries = asArray(parsed.feed?.entry);
  const items = rssItems.length ? rssItems : atomEntries;

  return items.map((item) => {
    const title = textValue(item.title);
    const summary = stripHtml(item.description || item.summary || item.content || item["content:encoded"]);
    return {
      title,
      source: source.label,
      sourceId: source.id,
      url: linkValue(item),
      publishedAt: itemDate(item),
      topicHint: source.topicHint,
      rawSummary: summary
    };
  }).filter((item) => item.title && item.url && matchesKeywords(source, item));
}

export async function fetchFeed(source) {
  const timeoutMs = envInt("FETCH_TIMEOUT_MS", 12000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "user-agent": "html-dailyupdate/0.1 (+home-lab daily digest)"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);
    const items = normalizeItems(source, parsed);
    await log("fetched source", { source: source.id, count: items.length });
    return items;
  } catch (error) {
    await logError("source fetch failed", error, { source: source.id, url: source.url });
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLiveItems(sources = liveSources) {
  const maxItemsPerSource = envInt("MAX_ITEMS_PER_SOURCE", 5);
  const results = await Promise.all(sources.map(fetchFeed));
  return results.flatMap((items) => items.slice(0, maxItemsPerSource));
}
