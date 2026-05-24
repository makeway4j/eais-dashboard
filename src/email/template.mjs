import { topics } from "../config/topics.mjs";
import { groupByTopic } from "../analyze/rank.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function importanceBadge(importance) {
  const labels = {
    high: "HIGH",
    medium: "MEDIUM",
    watch: "WATCH"
  };
  return labels[importance] || "WATCH";
}

function renderItem(item) {
  return `
    <tr>
      <td style="padding:16px 0;border-top:1px solid #e6e8ef;">
        <div style="margin-bottom:8px;">
          <span style="display:inline-block;padding:3px 8px;border-radius:4px;background:${item.importance === "high" ? "#14213d" : item.importance === "medium" ? "#31572c" : "#6c757d"};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.04em;">${importanceBadge(item.importance)}</span>
          <span style="color:#667085;font-size:12px;margin-left:8px;">${escapeHtml(item.source)} · ${formatDate(item.publishedAt)}</span>
        </div>
        <a href="${escapeHtml(item.url)}" style="color:#111827;text-decoration:none;font-size:17px;font-weight:700;line-height:1.35;">${escapeHtml(item.title)}</a>
        <p style="margin:8px 0 0;color:#344054;font-size:14px;line-height:1.55;">${escapeHtml(item.summary)}</p>
        <p style="margin:8px 0 0;color:#475467;font-size:13px;line-height:1.5;"><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</p>
      </td>
    </tr>
  `;
}

function renderSection(topic, items) {
  if (!items?.length) return "";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;">
      <tr>
        <td>
          <h2 style="margin:0 0 4px;color:#111827;font-size:20px;line-height:1.25;">${escapeHtml(topic.label)}</h2>
          <p style="margin:0 0 8px;color:#667085;font-size:13px;line-height:1.45;">${escapeHtml(topic.description)}</p>
        </td>
      </tr>
      ${items.map(renderItem).join("")}
    </table>
  `;
}

export function renderDailyEmail({ items, generatedAt = new Date() }) {
  const grouped = groupByTopic(items);
  const highCount = items.filter((item) => item.importance === "high").length;
  const subject = `AI Daily Briefing - ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(generatedAt)}`;

  const sections = topics
    .map((topic) => renderSection(topic, grouped[topic.id]))
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;background:#ffffff;border:1px solid #e6e8ef;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:26px 28px;background:#111827;color:#ffffff;">
                <p style="margin:0 0 8px;color:#cbd5e1;font-size:13px;">Generated ${escapeHtml(generatedAt.toLocaleString())}</p>
                <h1 style="margin:0;font-size:28px;line-height:1.15;">AI Daily Briefing</h1>
                <p style="margin:10px 0 0;color:#e5e7eb;font-size:15px;line-height:1.5;">${items.length} tracked signals, ${highCount} high-priority items, focused on governance, vendors, infrastructure, chips, products, and tech shifts.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                <h2 style="margin:0 0 10px;color:#111827;font-size:18px;">Executive Summary</h2>
                <p style="margin:0;color:#344054;font-size:14px;line-height:1.6;">Your morning scan of AI governance, major vendors, model/product releases, data centers, chips, enterprise adoption, security, funding, and market signals. Items are ranked for importance and grounded with source links.</p>
                ${sections}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f8fafc;color:#667085;font-size:12px;line-height:1.5;">
                Built for the home-lab daily digest. Review source links before acting on any item.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}
