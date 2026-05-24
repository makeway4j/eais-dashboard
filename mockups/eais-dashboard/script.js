const navButtons = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const title = document.querySelector(".topbar h1");
const subtitle = document.querySelector(".topbar p");
const dateEl = document.querySelector("#today-date");
const timeEl = document.querySelector("#today-time");
const quoteEl = document.querySelector("#daily-quote");
const revenueSliders = document.querySelectorAll("[data-revenue-key]");
const placeButtons = document.querySelectorAll("[data-place]");
const placeImage = document.querySelector("#place-feature-image");
const placeTitle = document.querySelector("#place-feature-title");
const placeCopy = document.querySelector("#place-feature-copy");
const nextPlaceButton = document.querySelector("#next-place-button");
const jarvisForm = document.querySelector("#jarvis-form");
const jarvisInput = document.querySelector("#jarvis-input");
const jarvisMessages = document.querySelector("#jarvis-messages");
const jarvisEndpoint = window.EAIS_JARVIS_ENDPOINT || "";
const calendarStatus = document.querySelector("#calendar-status");
const calendarAccountLabel = document.querySelector("#calendar-account-label");
const signalList = document.querySelector("#signal-list");
const sourcesTableBody = document.querySelector("#sources-table-body");
const historyTimeline = document.querySelector("#history-timeline");
const topicMixList = document.querySelector("#topic-mix-list");
const serviceList = document.querySelector("#service-list");
let toastTimer;
let activePlaceIndex = 0;
let eaisApiOnline = false;

const dailyQuotes = [
  "Build the system that makes the right action obvious.",
  "Consistency compounds faster when the machine remembers.",
  "A useful signal beats a loud feed.",
  "Automate the scan. Keep the judgment human.",
  "The edge comes from seeing the pattern early.",
  "Turn information into options before the day gets noisy.",
  "Small daily intelligence becomes strategic memory."
];

const viewCopy = {
  today: ["Today", "6 AM briefing, source health, and active intelligence queue."],
  sources: ["Sources", "Feeds, monitors, and provider APIs that power EAIS."],
  history: ["Digest History", "Search previous briefings, decisions, and saved intelligence."],
  jobs: ["Jobs", "Recommendations scored by fit, upside, urgency, and effort."],
  revenue: ["Revenue Streams", "Projected income, active projects, confidence, and next actions."],
  vision: ["Vision Board", "Goals, lifestyle targets, and saved objects tied to revenue milestones."],
  social: ["Social Drafts", "Approval-first LinkedIn and X drafts from high-confidence stories."],
  planner: ["Planner", "Project calendar, cron run windows, checklist, and backlog."],
  system: ["System", "Homelab services, deployment health, and launch checklist."]
};

const places = [
  {
    title: "Bali Reset Trip",
    copy: "A warm, restorative destination for the first real unplugged EAIS win.",
    image: "./assets/place-bali.jpg",
    alt: "Bali, Indonesia"
  },
  {
    title: "Tokyo Systems Week",
    copy: "A high-energy city target for technology, food, fashion, and future operator inspiration.",
    image: "./assets/place-tokyo.jpg",
    alt: "Tokyo, Japan"
  },
  {
    title: "Santorini Strategy Break",
    copy: "A clean, beautiful reset point for mapping the next revenue engine after launch.",
    image: "./assets/place-santorini.jpg",
    alt: "Santorini, Greece"
  },
  {
    title: "Maldives Deep Recharge",
    copy: "A premium recovery target tied to bigger recurring revenue and real time freedom.",
    image: "./assets/place-maldives.jpg",
    alt: "Maldives overwater vacation"
  }
];

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatCompact(value) {
  if (value >= 1000) {
    const compact = value / 1000;
    return `$${Number.isInteger(compact) ? compact : compact.toFixed(compact >= 10 ? 0 : 1)}k`;
  }

  return formatMoney(value);
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function setMetric(key, value, note) {
  const metric = document.querySelector(`[data-metric="${key}"]`);
  const metricNote = document.querySelector(`[data-metric-note="${key}"]`);

  if (metric) {
    metric.textContent = value;
  }

  if (metricNote && note) {
    metricNote.textContent = note;
  }
}

function scoreToPercent(score) {
  const numericScore = Number(score || 0);
  return numericScore <= 1 ? Math.round(numericScore * 100) : Math.round(numericScore);
}

function signalClass(item) {
  if (item.triage === "SIGNAL" || Number(item.score || 0) >= 0.85) {
    return "high";
  }

  if (item.triage === "WATCH" || Number(item.score || 0) >= 0.65) {
    return "medium";
  }

  return "watch";
}

function formatItemTime(value) {
  if (!value) {
    return "recent import";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recent import";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDateShort(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatUptime(seconds) {
  const value = Number(seconds || 0);
  if (value < 60) {
    return `${value}s`;
  }
  if (value < 3600) {
    return `${Math.round(value / 60)}m`;
  }
  return `${Math.round(value / 3600)}h`;
}

function healthForSource(source) {
  if (!source.itemCount) {
    return ["neutral", "No Data"];
  }
  if (source.untriagedCount > source.itemCount * 0.65) {
    return ["warn", "Needs Triage"];
  }
  return ["good", "Healthy"];
}

function renderSignalItems(items) {
  if (!signalList || !items?.length) {
    return;
  }

  signalList.replaceChildren();

  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = `signal-row ${signalClass(item)}`;

    const score = document.createElement("div");
    score.className = "signal-score";
    score.textContent = String(scoreToPercent(item.score));

    const body = document.createElement("div");
    body.className = "signal-body";

    const meta = document.createElement("div");
    meta.className = "row-meta";
    meta.textContent = `${item.category || "Signal"} - ${item.source || "EAIS"} - ${formatItemTime(item.fetchedAt)}`;

    const heading = document.createElement("h3");
    heading.textContent = item.title || "Untitled signal";

    const copy = document.createElement("p");
    copy.textContent = item.analysis || item.body || "Imported from the legacy digest pipeline.";

    const action = document.createElement("button");
    action.className = "row-action";
    action.type = "button";
    action.textContent = item.triage === "SIGNAL" ? "Review" : "Queue";

    body.append(meta, heading, copy);
    row.append(score, body, action);
    signalList.append(row);
  });
}

function renderSources(sources) {
  if (!sourcesTableBody || !sources?.length) {
    return;
  }

  sourcesTableBody.replaceChildren();

  sources.slice(0, 8).forEach((source) => {
    const [statusClass, statusLabel] = healthForSource(source);
    const row = document.createElement("tr");

    const sourceName = document.createElement("td");
    sourceName.textContent = `${source.category || "uncategorized"} feed`;

    const sourceType = document.createElement("td");
    sourceType.textContent = (source.source || "unknown").toUpperCase();

    const topic = document.createElement("td");
    topic.textContent = `${source.itemCount} items`;

    const lastFetch = document.createElement("td");
    lastFetch.textContent = formatItemTime(source.lastFetchedAt);

    const health = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `status-pill ${statusClass}`;
    pill.textContent = statusLabel;
    health.append(pill);

    const actionCell = document.createElement("td");
    const action = document.createElement("button");
    action.className = "text-button";
    action.type = "button";
    action.textContent = source.signalCount ? `${source.signalCount} signals` : "Inspect";
    actionCell.append(action);

    row.append(sourceName, sourceType, topic, lastFetch, health, actionCell);
    sourcesTableBody.append(row);
  });
}

function renderHistory(history, topicMix) {
  if (historyTimeline && history?.length) {
    historyTimeline.replaceChildren();

    history.slice(0, 6).forEach((entry) => {
      const article = document.createElement("article");
      const time = document.createElement("time");
      const heading = document.createElement("h3");
      const copy = document.createElement("p");

      time.textContent = formatDateShort(entry.digestDate);
      heading.textContent = entry.topTitle || "Imported digest items";
      copy.textContent = `${entry.itemCount} items, ${entry.signalCount} signals, ${entry.watchCount} watch, ${entry.deferredCount} deferred.`;

      article.append(time, heading, copy);
      historyTimeline.append(article);
    });
  }

  if (topicMixList && topicMix?.length) {
    topicMixList.replaceChildren();
    const maxItems = Math.max(...topicMix.map((topic) => topic.itemCount), 1);

    topicMix.slice(0, 6).forEach((topic) => {
      const row = document.createElement("div");
      const label = document.createElement("span");
      const bar = document.createElement("b");
      label.textContent = `${topic.category} (${topic.itemCount})`;
      bar.style.width = `${Math.max(6, Math.round((topic.itemCount / maxItems) * 100))}%`;
      row.append(label, bar);
      topicMixList.append(row);
    });
  }
}

function renderSystem(system) {
  if (!serviceList || !system) {
    return;
  }

  serviceList.replaceChildren();

  const services = [
    ["EAIS dashboard", String(system.port), system.serviceStatus === "running" ? "Running" : "Check", system.serviceStatus === "running" ? "ok" : "warn-text"],
    ["EAIS database", "SQLite", `${system.importedDigestItems} items`, "ok"],
    ["Digest import", "legacy", `${system.importedRuns} runs`, "ok"],
    ["Today feed", "live", `${system.todayItems} items`, system.todayItems ? "ok" : "warn-text"],
    ["Signal archive", "triage", `${system.signalItems} signals`, "ok"],
    ["Node runtime", system.node, `up ${formatUptime(system.processUptimeSeconds)}`, "ok"]
  ];

  services.forEach(([name, port, status, className]) => {
    const row = document.createElement("div");
    const nameEl = document.createElement("span");
    const portEl = document.createElement("b");
    const statusEl = document.createElement("em");

    nameEl.textContent = name;
    portEl.textContent = port;
    statusEl.textContent = status;
    statusEl.className = className;

    row.append(nameEl, portEl, statusEl);
    serviceList.append(row);
  });
}

async function fetchJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`EAIS API returned ${response.status}`);
  }

  return response.json();
}

async function loadEaisSummary() {
  const data = await fetchJson("/api/summary");
  const summary = data.summary;

  eaisApiOnline = true;
  setMetric("signals-today", String(summary.todayItems || summary.totalItems || 0), `${summary.todaySignals || 0} high priority`);
  setMetric("source-health", summary.totalItems > 0 ? "92%" : "0%", `${summary.categoryCount || 0} categories imported`);
}

async function loadEaisSignals(filter = "all") {
  const query = new URLSearchParams({ limit: "4" });
  if (filter !== "all") {
    query.set("triage", filter);
  }

  const data = await fetchJson(`/api/items?${query}`);
  renderSignalItems(data.items);
}

async function hydrateEaisDashboard(filter = "all") {
  if (window.location.protocol === "file:") {
    return;
  }

  try {
    await Promise.all([loadEaisSummary(), loadEaisSignals(filter)]);
  } catch (error) {
    eaisApiOnline = false;
    console.warn(error);
  }
}

async function hydrateSources() {
  if (window.location.protocol === "file:") {
    return;
  }

  try {
    const data = await fetchJson("/api/sources");
    renderSources(data.sources);
  } catch (error) {
    console.warn(error);
  }
}

async function hydrateHistory() {
  if (window.location.protocol === "file:") {
    return;
  }

  try {
    const data = await fetchJson("/api/history?days=10");
    renderHistory(data.history, data.topicMix);
  } catch (error) {
    console.warn(error);
  }
}

async function hydrateSystem() {
  if (window.location.protocol === "file:") {
    return;
  }

  try {
    const data = await fetchJson("/api/system");
    renderSystem(data.system);
  } catch (error) {
    console.warn(error);
  }
}

function hydrateView(viewName) {
  if (viewName === "today") {
    hydrateEaisDashboard();
  }
  if (viewName === "sources") {
    hydrateSources();
  }
  if (viewName === "history") {
    hydrateHistory();
  }
  if (viewName === "system") {
    hydrateSystem();
  }
}

function showView(viewName) {
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  views.forEach((view) => {
    view.classList.toggle("active", view.id === `view-${viewName}`);
  });

  const copy = viewCopy[viewName] || viewCopy.today;
  title.textContent = copy[0];
  subtitle.textContent = copy[1];
  hydrateView(viewName);
}

function showToast(message) {
  let toast = document.querySelector(".demo-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "demo-toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function setVisionProgress(key, value) {
  const percent = clampPercent(value);
  const bar = document.querySelector(`[data-vision-progress="${key}"]`);
  const label = document.querySelector(`[data-vision-percent="${key}"]`);

  if (bar) {
    bar.style.width = `${percent}%`;
  }

  if (label) {
    label.textContent = `${percent}%`;
  }
}

function updateRevenueModel() {
  const values = {};
  let total = 0;
  let weightedConfidence = 0;

  revenueSliders.forEach((slider) => {
    const key = slider.dataset.revenueKey;
    const value = Number(slider.value);
    const confidence = Number(slider.dataset.confidence);
    values[key] = value;
    total += value;
    weightedConfidence += value * confidence;

    document.querySelector(`[data-slider-value="${key}"]`).textContent = formatMoney(value);
    document.querySelector(`[data-monthly-value="${key}"]`).textContent = formatMoney(value);
    document.querySelector(`[data-mix-value="${key}"]`).textContent = formatCompact(value);
  });

  const maxValue = Math.max(...Object.values(values), 1);
  Object.entries(values).forEach(([key, value]) => {
    const bar = document.querySelector(`[data-mix-bar="${key}"]`);
    if (bar) {
      bar.style.width = `${Math.max(4, Math.round((value / maxValue) * 100))}%`;
    }
  });

  document.querySelector("#revenue-total-monthly").textContent = formatMoney(total);
  document.querySelector("#revenue-total-annual").textContent = formatCompact(total * 12);
  document.querySelector("#revenue-confidence").textContent = `${clampPercent(weightedConfidence / Math.max(total, 1))}%`;

  setVisionProgress("lucid", total / 450);
  setVisionProgress("tumi", 20 + total / 160);
  setVisionProgress("system", 20 + total / 400);
  setVisionProgress("travel", total / 220);

  document.querySelector("#vision-income-focus").textContent = `${formatMoney(total)} monthly target`;
  document.querySelector("#vision-income-note").textContent = `travel fund ${clampPercent(total / 220)}% and system launch ${clampPercent(20 + total / 400)}%`;
}

function setPlace(index) {
  activePlaceIndex = (index + places.length) % places.length;
  const place = places[activePlaceIndex];
  placeImage.src = place.image;
  placeImage.alt = place.alt;
  placeTitle.textContent = place.title;
  placeCopy.textContent = place.copy;

  placeButtons.forEach((button) => {
    button.classList.toggle("selected", Number(button.dataset.place) === activePlaceIndex);
  });
}

function addJarvisMessage(author, message) {
  const bubble = document.createElement("p");
  bubble.innerHTML = `<b>${author}</b> ${message}`;
  jarvisMessages.append(bubble);
  jarvisMessages.scrollTop = jarvisMessages.scrollHeight;
}

function getLocalJarvisReply(message) {
  const lower = message.toLowerCase();

  if (lower.includes("revenue") || lower.includes("slider")) {
    return "Revenue sliders are live. Move a project amount and I will reflect it in total revenue, confidence, and Vision Board progress.";
  }

  if (lower.includes("cron") || lower.includes("schedule")) {
    return "Planner is the right place for cron visibility. Next production step is storing run history from systemd timers.";
  }

  if (lower.includes("joplin")) {
    return "Joplin archive is represented in the prototype. A real connection should save daily briefs and notable items by notebook/tag.";
  }

  if (lower.includes("vacation") || lower.includes("trip") || lower.includes("place")) {
    return "The Vision Board travel image rotates automatically. Use Change Image or the place chips to pick the target manually.";
  }

  return "Jarvis bridge is visible and ready. This prototype is using local demo replies until we connect the real homelab Jarvis endpoint.";
}

async function getJarvisReply(message) {
  if (!jarvisEndpoint) {
    return getLocalJarvisReply(message);
  }

  try {
    const response = await fetch(jarvisEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, source: "eais-dashboard" })
    });

    if (!response.ok) {
      throw new Error(`Jarvis returned ${response.status}`);
    }

    const data = await response.json();
    return data.reply || data.message || getLocalJarvisReply(message);
  } catch (error) {
    return `Jarvis bridge failed over to local mode: ${error.message}`;
  }
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
    const url = new URL(window.location.href);
    url.searchParams.set("view", button.dataset.view);
    window.history.replaceState({}, "", url);
  });
});

document.querySelectorAll(".segmented-control").forEach((control) => {
  control.addEventListener("click", (event) => {
    const selectedButton = event.target.closest("button");

    if (!selectedButton) {
      return;
    }

    control.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("selected", button === selectedButton);
    });

    if (selectedButton.dataset.signalFilter) {
      hydrateEaisDashboard(selectedButton.dataset.signalFilter);
    }

    showToast(`${selectedButton.textContent.trim()} view selected`);
  });
});

signalList?.addEventListener("click", (event) => {
  const action = event.target.closest(".row-action");

  if (action) {
    showToast(eaisApiOnline ? "EAIS item selected from live database" : "Demo action: signal selected");
  }
});

document.querySelectorAll(".row-action, .command-button, .full-button, .text-button, .icon-button").forEach((button) => {
  button.addEventListener("click", () => {
    const label = button.getAttribute("title") || button.textContent.trim();
    const calendarAction = button.dataset.calendarAction;

    if (button.classList.contains("nav-item")) {
      return;
    }

    if (calendarAction === "connect") {
      calendarStatus.textContent = "Demo Connected";
      calendarStatus.classList.remove("warn");
      calendarStatus.classList.add("good");
      calendarAccountLabel.textContent = "Gmail calendar ready for OAuth";
      showToast("Demo: Google Calendar connection staged");
      return;
    }

    if (calendarAction === "sync") {
      calendarStatus.textContent = "Synced";
      calendarStatus.classList.remove("warn");
      calendarStatus.classList.add("good");
      showToast("Demo: planner runs synced to Google Calendar");
      return;
    }

    if (button.textContent.trim() === "Approve") {
      button.textContent = "Approved";
      button.disabled = true;
      button.closest(".draft-card")?.classList.add("is-complete");
      showToast("Draft marked approved");
      return;
    }

    if (button.textContent.trim() === "Save to Joplin" || button.textContent.trim() === "Save Daily Brief") {
      showToast("Demo: briefing saved to Joplin archive");
      return;
    }

    if (button.textContent.trim() === "Preview HTML Email") {
      showToast("Demo: opening HTML email preview");
      showView("today");
      return;
    }

    showToast(`Demo action: ${label}`);
  });
});

document.querySelectorAll(".check-row input").forEach((checkbox) => {
  const row = checkbox.closest(".check-row");
  row?.classList.toggle("is-complete", checkbox.checked);

  checkbox.addEventListener("change", () => {
    row?.classList.toggle("is-complete", checkbox.checked);
    showToast(checkbox.checked ? "Checklist item completed" : "Checklist item reopened");
  });
});

revenueSliders.forEach((slider) => {
  slider.addEventListener("input", updateRevenueModel);
  slider.addEventListener("change", () => {
    showToast("Revenue model updated");
  });
});

placeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setPlace(Number(button.dataset.place));
    showToast(`${placeTitle.textContent} selected`);
  });
});

nextPlaceButton?.addEventListener("click", () => {
  setPlace(activePlaceIndex + 1);
});

jarvisForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = jarvisInput.value.trim();

  if (!message) {
    return;
  }

  addJarvisMessage("You", message);
  jarvisInput.value = "";
  window.setTimeout(async () => {
    addJarvisMessage("Jarvis", await getJarvisReply(message));
  }, 220);
});

const initialView = new URL(window.location.href).searchParams.get("view") || "today";
showView(viewCopy[initialView] ? initialView : "today");

function updateClock() {
  const now = new Date();
  dateEl.textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(now);
  timeEl.textContent = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(now);
}

function setDailyQuote() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((new Date() - start) / 86400000);
  quoteEl.textContent = dailyQuotes[day % dailyQuotes.length];
}

updateClock();
setDailyQuote();
updateRevenueModel();
setPlace(0);
hydrateEaisDashboard();
setInterval(updateClock, 1000);
setInterval(() => setPlace(activePlaceIndex + 1), 9000);
