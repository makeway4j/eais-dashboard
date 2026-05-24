const navButtons = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const title = document.querySelector(".topbar h1");
const subtitle = document.querySelector(".topbar p");
const dateEl = document.querySelector("#today-date");
const timeEl = document.querySelector("#today-time");
const quoteEl = document.querySelector("#daily-quote");

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
  social: ["Social Drafts", "Approval-first LinkedIn and X drafts from high-confidence stories."],
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

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
    const url = new URL(window.location.href);
    url.searchParams.set("view", button.dataset.view);
    window.history.replaceState({}, "", url);
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
