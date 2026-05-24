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
let toastTimer;
let activePlaceIndex = 0;

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

    showToast(`${selectedButton.textContent.trim()} view selected`);
  });
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
setInterval(updateClock, 1000);
setInterval(() => setPlace(activePlaceIndex + 1), 9000);
