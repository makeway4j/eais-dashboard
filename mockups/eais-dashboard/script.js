const navButtons = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const title = document.querySelector(".topbar h1");
const subtitle = document.querySelector(".topbar p");

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
