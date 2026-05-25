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
  const badgeBackground = item.importance === "high" ? "#d97757" : item.importance === "medium" ? "#8a5744" : "#3b3932";
  const badgeColor = item.importance === "watch" ? "#faf9f5" : "#141413";

  return `
    <tr>
      <td style="padding:16px 0;border-top:1px solid #3b3932;">
        <div style="margin-bottom:8px;">
          <span style="display:inline-block;padding:4px 8px;border-radius:4px;background:${badgeBackground};color:${badgeColor};font-size:11px;font-weight:800;letter-spacing:.04em;">${importanceBadge(item.importance)}</span>
          <span style="color:#b0aea5;font-size:12px;margin-left:8px;">${escapeHtml(item.source)} &middot; ${formatDate(item.publishedAt)}</span>
        </div>
        <a href="${escapeHtml(item.url)}" style="color:#faf9f5;text-decoration:none;font-size:17px;font-weight:800;line-height:1.35;">${escapeHtml(item.title)}</a>
        <p style="margin:8px 0 0;color:#e8e6dc;font-size:14px;line-height:1.55;">${escapeHtml(item.summary)}</p>
        <p style="margin:8px 0 0;color:#b0aea5;font-size:13px;line-height:1.5;"><strong style="color:#d97757;">Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</p>
      </td>
    </tr>
  `;
}

function renderSection(topic, items) {
  if (!items?.length) return "";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:28px;border:1px solid #3b3932;border-radius:8px;overflow:hidden;background:#181716;">
      <tr>
        <td style="width:7px;background:#d97757;font-size:1px;line-height:1px;">&nbsp;</td>
        <td style="padding:16px 18px;background:#24231f;border-bottom:1px solid #3b3932;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td>
                <p style="margin:0 0 5px;color:#d97757;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;">Topic Section</p>
                <h2 style="margin:0;color:#faf9f5;font-size:23px;line-height:1.2;">${escapeHtml(topic.label)}</h2>
              </td>
              <td align="right" style="vertical-align:top;">
                <span style="display:inline-block;padding:6px 9px;border-radius:4px;background:#141413;border:1px solid #3b3932;color:#faf9f5;font-size:12px;font-weight:900;">${items.length} item${items.length === 1 ? "" : "s"}</span>
              </td>
            </tr>
          </table>
          <p style="margin:9px 0 0;color:#b0aea5;font-size:14px;line-height:1.5;">${escapeHtml(topic.description)}</p>
        </td>
      </tr>
      <tr>
        <td style="width:7px;background:#d97757;font-size:1px;line-height:1px;">&nbsp;</td>
        <td style="padding:0 18px 2px;background:#181716;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${items.map(renderItem).join("")}
          </table>
        </td>
      </tr>
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
  <body style="margin:0;background:#141413;font-family:Arial,Helvetica,sans-serif;color:#faf9f5;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#141413;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;background:#1c1b19;border:1px solid #3b3932;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px;background:#181716;background-image:linear-gradient(118deg,#1c1b19 0%,#141413 58%,rgba(217,119,87,0.22) 100%);color:#faf9f5;border-bottom:1px solid #3b3932;">
                <p style="margin:0 0 8px;color:#d97757;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;">EAIS Command Brief &middot; Generated ${escapeHtml(generatedAt.toLocaleString())}</p>
                <h1 style="margin:0;color:#faf9f5;font-size:32px;line-height:1.1;">AI Daily Briefing</h1>
                <p style="margin:10px 0 0;color:#e8e6dc;font-size:15px;line-height:1.5;">${items.length} tracked signals, ${highCount} high-priority items, focused on governance, vendors, AI tools, model versions, infrastructure, chips, and tech shifts.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:18px;">
                  <tr>
                    <td style="padding:8px 10px;border:1px solid #3b3932;border-radius:8px;background:rgba(20,20,19,0.76);color:#faf9f5;font-size:12px;font-weight:800;">Signals: ${items.length}</td>
                    <td style="width:8px;"></td>
                    <td style="padding:8px 10px;border:1px solid #3b3932;border-radius:8px;background:rgba(20,20,19,0.76);color:#faf9f5;font-size:12px;font-weight:800;">High Priority: ${highCount}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;background:#1c1b19;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:4px;border:1px solid #3b3932;border-radius:8px;background:#24231f;">
                  <tr>
                    <td style="padding:16px;">
                      <h2 style="margin:0 0 10px;color:#faf9f5;font-size:18px;">Executive Summary</h2>
                      <p style="margin:0;color:#e8e6dc;font-size:14px;line-height:1.6;">Your morning scan of AI governance, major vendors, AI tools, model versions, data centers, chips, enterprise adoption, security, funding, and market signals. Items are ranked for importance and grounded with source links.</p>
                    </td>
                  </tr>
                </table>
                ${sections}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#181716;color:#b0aea5;font-size:12px;line-height:1.5;border-top:1px solid #3b3932;">
                <strong style="color:#d97757;">EAIS</strong> home-lab daily digest. Review source links before acting on any item.
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
