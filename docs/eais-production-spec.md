# EAIS Production Build Spec

Approved on: 2026-05-24

EAIS stands for Executive AI Intelligence System. The approved mockup is the design and product reference for the first production build:

```text
C:\JCW_3\projects\html-dailyupdate\mockups\eais-dashboard\index.html
```

The production system should preserve the approved dashboard direction while replacing mock data with live homelab services, stored history, and controlled automations.

## Product Goal

Build an internal executive intelligence dashboard that helps James stay current, remember decisions, track money systems, and run the daily AI briefing workflow from the homelab.

The first production version should be useful even before social posting, job applications, and advanced automation are connected.

## MVP Scope

Build these first:

- Today command dashboard with date, time, Little Elm weather, daily operating thought, source health, next brief, API spend, and token use.
- Daily AI briefing queue for AI governance, AI vendors, data centers, AI infrastructure, model releases, regulation, market funding, and related technology signals.
- HTML daily briefing generation and email delivery.
- Digest history with saved briefing records, source links, and notes.
- API and token cost tracking for OpenAI, Gemini, Anthropic, Kimi 2.5, and local Ollama/Kora fallback.
- Revenue streams dashboard for Pinterest, KalshiEdge, RepoReel/ClipEngine, EAIS reports, and future businesses.
- Vision board with goals, desired items, travel targets, and revenue-linked progress.
- Planner with project calendar, cron windows, run history, checklists, and backlog.
- Joplin archive action for daily briefings.
- Jarvis chat dock prepared for VM 106 integration.
- System health view for homelab services, scheduled jobs, and launch readiness.

Defer until after MVP:

- Auto-posting to LinkedIn and X/Twitter.
- Job recommendation ingestion and one-click application workflow.
- Multi-user access.
- Public marketing site.
- Payment/subscription features.
- Fully autonomous social or job actions without human approval.

## Approved UX Direction

Use the static mockup as the visual contract:

- Dark executive command-center style.
- Claude/Anthropic-inspired palette:
  - `#141413` primary background and dark text
  - `#faf9f5` light text/accent text
  - `#b0aea5` muted gray
  - `#e8e6dc` subtle background
  - `#d97757` primary orange accent
- Dense but readable operational layout.
- Minimal rounded corners, 8px or less.
- Always-visible Jarvis chat dock.
- Futuristic top command header with subtle motion, not flashy marketing UI.
- Dashboard-first experience, not a landing page.
- The daily morning email briefing should use the same EAIS brand palette and executive command-center feel.

## Recommended Architecture

Recommended first production shape:

```text
CT 301 /opt/eais
  Node web app
  SQLite or Postgres database
  background workers / systemd timers
  local .env secrets
  Cloudflare Tunnel to eais.muvazio.com
```

Suggested app split:

```text
web dashboard
  -> Today, Sources, History, Revenue, Vision, Planner, System

jobs
  -> 6 AM briefing generation
  -> source ingestion
  -> cost rollup
  -> calendar sync
  -> Joplin archive

integrations
  -> AI providers
  -> Gmail SMTP
  -> Joplin API
  -> Jarvis/OpenClaw
  -> weather provider
  -> Google Calendar
```

Keep daily briefing generation reliable and separate from social/job automation. Social and job modules can reuse the intelligence pipeline, but they should not make the 6 AM briefing fragile.

## Homelab Deployment Target

Primary production host:

```text
CT 301
192.168.5.156
/opt/eais
```

Known related services:

```text
Proxmox gateway: 192.168.5.77
Jarvis/OpenClaw VM 106: 192.168.5.152
Joplin server CT 111: 192.168.5.153
Kora GPU inference VM 302: 192.168.5.157
Paperclip CT 303: 192.168.5.158
```

The Windows project remains the VS Code development workspace. Production should run from the always-on homelab because the Windows PC may turn off at night.

## Domain And Access

Target domain:

```text
eais.muvazio.com
```

Use Cloudflare Tunnel or an equivalent protected route. Before any external access:

- Add authentication.
- Rotate exposed or old secrets.
- Move all secrets to `.env` or the host secret manager.
- Confirm no dashboard page leaks API keys, tokens, or private internal URLs.
- Confirm Joplin, calendar, and Jarvis actions require explicit user intent.

## Data Model Draft

Start with a small schema that supports the approved dashboard:

- `briefings`: generated daily briefings, rendered HTML path, sent status, Joplin note id, created time.
- `items`: ingested intelligence items, source, topic, url, score, summary, status.
- `sources`: RSS feeds, direct sources, vendor sources, health status, last success, last error.
- `api_usage`: provider, model, input tokens, output tokens, estimated cost, job id, timestamp.
- `revenue_streams`: project name, category, projected monthly revenue, confidence, status, next action.
- `vision_items`: title, category, image, target amount, priority, notes.
- `planner_events`: project, schedule, expected run time, owner, status.
- `run_history`: job name, started at, finished at, success/fail, logs pointer.
- `backlog_items`: task, project, priority, status, notes.
- `settings`: dashboard preferences, caps, integration toggles.

## Integration Notes

AI providers:

- Track OpenAI, Gemini, Anthropic, Kimi 2.5, and local fallback usage separately.
- Store input tokens, output tokens, model name, estimated cost, and purpose.
- Add daily caps and warning thresholds before enabling high-volume jobs.
- Local Ollama/Kora fallback should show as compute-local, not billed API spend.

Daily briefing:

- Preserve the current `html-dailyupdate` pipeline where useful.
- Review `/opt/digest` before replacing anything on CT 301.
- Migrate working ingest, scoring, and brief generation logic into EAIS if it is better than the local prototype.

Email:

- Gmail SMTP is acceptable for one personal daily briefing.
- Keep dry-run mode available.
- Log send result and rendered HTML path.

Joplin:

- First action: save the generated daily briefing to Joplin.
- Store returned note id on the briefing record.
- Do not expose Joplin token to the browser.

Google Calendar:

- First action: display planned cron/project events.
- Later action: sync EAIS planner blocks into Gmail calendar.
- Calendar writes should require confirmation until behavior is trusted.

Jarvis:

- First action: chat dock posts to a local Jarvis bridge endpoint.
- Keep the UI available even when Jarvis is offline.
- Show VM 106 status in the System view.

Weather:

- First action: display Little Elm, Texas current weather and short forecast.
- Production should fetch this from a weather provider server-side and cache it.

## Build Phases

Phase 1: Production shell

- Create `/opt/eais` app structure.
- Add dashboard routes matching the approved mockup.
- Add database and migrations.
- Add `.env.example`.
- Add local login/auth.
- Add system health page.

Phase 2: Daily briefing integration

- Move current digest logic behind EAIS jobs.
- Add 6 AM systemd timer.
- Store briefing output in database.
- Keep HTML email preview and send controls.
- Add Joplin save action.

Phase 3: Intelligence sources and costs

- Add source health tracking.
- Add AI provider usage logging.
- Add cost dashboard with daily and monthly totals.
- Add token caps and alerts.

Phase 4: Planner, revenue, and vision persistence

- Save revenue stream values.
- Save vision board items.
- Save planner/checklist/backlog data.
- Add run history for Sunkissed, Fitness, RepoReel, KalshiEdge, EAIS, and future projects.

Phase 5: External access

- Add Cloudflare Tunnel route for `eais.muvazio.com`.
- Confirm authentication.
- Rotate secrets.
- Run security checklist.
- Add backup/restore procedure.

Phase 6: Future agents

- Add LinkedIn and X draft generation.
- Add approval workflow for social posts.
- Add job recommendation ingestion.
- Add application tracker.

## Pre-Launch Checklist

- Confirm CT 301 is the final host.
- Snapshot or backup CT 301 before deployment.
- Read `/opt/digest` and decide migrate vs archive.
- Rotate any old Gemini, Telegram, Twitter/X, or other tokens found in legacy code.
- Move secrets to `.env`.
- Confirm `npm test` passes locally.
- Confirm production dry run works on CT 301.
- Confirm `systemctl status eais.service`.
- Confirm `systemctl list-timers` for scheduled jobs.
- Confirm dashboard requires authentication.
- Confirm Cloudflare route is protected.
- Confirm daily email can be sent manually.
- Confirm Joplin save works manually.
- Confirm logs are written and easy to inspect.

## Acceptance Criteria For MVP

EAIS MVP is complete when:

- `https://eais.muvazio.com` loads the authenticated dashboard.
- The dashboard uses the approved visual direction from the mockup.
- The 6 AM briefing can run unattended from CT 301.
- A manual run can generate, preview, email, and save a briefing to Joplin.
- API usage and estimated cost counts are stored and displayed by provider.
- Planner/revenue/vision/backlog data persists after refresh.
- System view shows key service and job health.
- Secrets are not hardcoded in source code.
- There is a documented rollback or restore path.

## Open Decisions

- Final production framework: lightweight Node/Express, Next.js, or another app framework.
- Database choice: SQLite for simplest homelab deployment, or Postgres if EAIS will grow quickly.
- Authentication method: Cloudflare Access, local login, or both.
- Weather provider.
- Google Calendar sync direction: read-only first or read/write after approval.
- Jarvis bridge API contract.
- Whether `/opt/digest` becomes `/opt/eais` directly or is migrated module by module.
