const topicKeywords = {
  governance: [
    "regulation", "regulator", "policy", "governance", "law", "lawsuit", "copyright",
    "safety", "nist", "eu ai act", "ftc", "white house", "senate", "compliance"
  ],
  infrastructure: [
    "data center", "datacenter", "power", "energy", "nuclear", "cooling", "cloud",
    "capacity", "inference campus", "colocation"
  ],
  models: [
    "model", "version", "release", "launch", "api", "pricing", "benchmark", "reasoning",
    "multimodal", "voice", "video", "tool use", "gpt-5", "gpt-4", "claude 4",
    "claude 3", "gemini 2", "gemini 3", "llama", "mistral", "kimi", "deepseek",
    "model card", "context window", "frontier model"
  ],
  tools: [
    "ai tool", "tools", "agent", "agents", "agentic", "manus", "cursor", "windsurf",
    "lovable", "replit", "v0", "bolt", "n8n", "zapier", "workflow", "automation",
    "coding assistant", "code assistant", "browser agent", "operator", "computer use",
    "creative tool", "video generator", "image generator", "research agent"
  ],
  chips: [
    "gpu", "nvidia", "amd", "intel", "chip", "semiconductor", "hbm", "memory",
    "blackwell", "cuda", "accelerator", "networking"
  ],
  enterprise: [
    "enterprise", "customer", "deployment", "copilot", "workflow", "automation",
    "admin", "audit", "compliance", "governance platform"
  ],
  security: [
    "security", "safety", "red team", "red-team", "jailbreak", "prompt injection",
    "data leakage", "breach", "cyber", "misuse", "eval"
  ],
  markets: [
    "funding", "raises", "raised", "acquisition", "acquires", "merger", "ipo",
    "valuation", "partnership", "invests", "investment"
  ],
  vendors: [
    "openai", "chatgpt", "anthropic", "claude", "gemini", "google", "microsoft",
    "meta", "xai", "perplexity", "mistral", "manus", "apple intelligence"
  ],
  tech: [
    "startup", "funding", "security", "enterprise", "product", "launch", "agent",
    "automation", "developer", "api"
  ]
};

const highKeywords = [
  "regulation", "lawsuit", "acquisition", "acquires", "billion", "data center",
  "nvidia", "openai", "anthropic", "safety", "security", "breach", "government"
];

const mediumKeywords = [
  "launch", "release", "partnership", "funding", "model", "enterprise", "api",
  "gemini", "claude", "chatgpt"
];

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function chooseTopic(item) {
  const text = `${item.title} ${item.rawSummary || item.summary || ""}`.toLowerCase();

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (includesAny(text, keywords)) return topic;
  }

  return item.topicHint || "tech";
}

function chooseImportance(item) {
  const text = `${item.title} ${item.rawSummary || item.summary || ""}`.toLowerCase();
  if (includesAny(text, highKeywords)) return "high";
  if (includesAny(text, mediumKeywords)) return "medium";
  return "watch";
}

function fallbackSummary(item) {
  const summary = item.rawSummary || item.summary || "";
  if (!summary) return "Source item captured for review; summary will improve when AI summarization is enabled.";
  return summary.length > 260 ? `${summary.slice(0, 257).trim()}...` : summary;
}

function whyItMatters(item, topic) {
  if (topic === "governance") return "Governance shifts can change vendor behavior, compliance needs, and the pace of AI deployment.";
  if (topic === "infrastructure") return "Infrastructure updates show where AI capacity, power, and chip constraints are moving.";
  if (topic === "models") return "Model and product changes affect what tools are practical to use, automate, or build on.";
  if (topic === "tools") return "AI tools and agents show what is becoming useful for daily workflows, automation, and new revenue projects.";
  if (topic === "chips") return "Hardware changes shape AI capacity, costs, bottlenecks, and competitive advantage.";
  if (topic === "enterprise") return "Enterprise adoption signals which AI tools are moving from experiments into durable workflows.";
  if (topic === "security") return "Safety and security issues can create operational, legal, and trust risks.";
  if (topic === "markets") return "Funding and deal activity shows where capital, talent, and platform control are moving.";
  if (topic === "vendors") return "Vendor moves can affect tools, pricing, product strategy, and enterprise adoption.";
  return "This may signal a broader change in the AI market, security posture, or product landscape.";
}

export function normalizeForDigest(items) {
  return items.map((item) => {
    const topic = item.topic || chooseTopic(item);
    return {
      title: item.title,
      source: item.source,
      sourceId: item.sourceId,
      url: item.url,
      publishedAt: item.publishedAt,
      topic,
      importance: item.importance || chooseImportance(item),
      summary: fallbackSummary(item),
      whyItMatters: item.whyItMatters || whyItMatters(item, topic)
    };
  });
}

export function dedupeItems(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = (item.url || item.title).toLowerCase().replace(/[?#].*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}
