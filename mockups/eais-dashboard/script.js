const navButtons = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const title = document.querySelector(".topbar h1");
const subtitle = document.querySelector(".topbar p");
const dateEl = document.querySelector("#today-date");
const timeEl = document.querySelector("#today-time");
const quoteEl = document.querySelector("#daily-quote");
let toastTimer;

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

    if (button.classList.contains("nav-item")) {
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
setInterval(updateClock, 1000);
