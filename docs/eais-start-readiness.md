# EAIS Start Readiness

Checked on: 2026-05-24

This note captures the read-only production reconnaissance before building EAIS on CT 301.

## Local Repo State

- Repository: `makeway4j/eais-dashboard`
- Local path: `C:\JCW_3\projects\html-dailyupdate`
- Branch: `master`
- Production spec: `docs/eais-production-spec.md`
- Approved mockup: `mockups/eais-dashboard/index.html`
- Daily email template now matches the EAIS dashboard brand palette.

## CT 301 Host Snapshot

Target host:

```text
creative-workstation
192.168.5.156
target path: /opt/eais
```

Observed capacity:

- Root filesystem: 196 GB total, 37 GB used, 149 GB available.
- Memory: 19 GiB total, about 15 GiB available during the check.
- Uptime: about 56 days.
- No `eais`, `digest`, or `html-dailyupdate` systemd service/timer was found.

Conclusion: CT 301 has enough room for the first EAIS production app.

## Active Services On CT 301

Observed listening services:

| Port | Path | Purpose / Owner |
| --- | --- | --- |
| 5050 | `/opt/arb-dashboard` | Uvicorn app |
| 8080 | `/usr/lib/code-server` | code-server |
| 8765 | `/opt/ClipEngine` | ClipEngine Uvicorn app |
| 8766 | `/opt/kalshiedge/backend` | KalshiEdge backend, running from shell process |
| 8767 | `/opt/reporeel` | RepoReel |
| 8501 | `/opt/MoneyPrinterTurbo-Extended` | Streamlit app |
| 8502 | `/opt/ai-videos` | AI videos web UI |

EAIS should avoid these ports. Recommended first local port:

```text
127.0.0.1:8788
```

Then expose through Cloudflare Tunnel as:

```text
eais.muvazio.com
```

## Existing `/opt/digest`

`/opt/digest` is active and should not be deleted or replaced blindly.

Top-level structure:

```text
/opt/digest
  config.py
  digest.db
  init_db.py
  run_all.sh
  ingest/
    rss_ingest.py
    tiktok_scraper.py
    twitter_ingest.py
  pipeline/
    analyzer.py
    brief.py
    scorer.py
    triager.py
  logs/
    brief.log
    ingest.log
    pipeline.log
```

Current behavior:

- Root crontab runs `/opt/digest/run_all.sh` at 3:00 AM.
- Root crontab sends the Telegram brief through `/opt/digest/pipeline/brief.py` at 7:00 AM.
- RSS ingest is active and recently added about 70-80 items per day.
- TikTok ingest currently returns zero items.
- Twitter ingest currently returns zero items.
- Brief delivery has been sending Telegram messages.

Database:

```text
table: items
columns:
  id, source, category, title, url, body, author, view_count, like_count,
  hashtags, pub_date, fetched_at, score, triage, analysis, briefed_at
indexes:
  idx_triage
  idx_category
  idx_date
```

Observed data counts:

- Total items: 2,967.
- Triage counts:
  - untriaged: 2,027.
  - DEFERRED: 394.
  - SIGNAL: 392.
  - WATCH: 116.
  - REJECT: 38.
- Top categories:
  - viral: 722.
  - ai: 561.
  - homelab: 539.
  - business: 461.
  - creator: 429.
  - automation: 255.

Useful pieces to migrate into EAIS:

- SQLite schema as the first `items` migration reference.
- RSS source map and ingest behavior.
- Keyword pre-score logic.
- Triage categories: `SIGNAL`, `WATCH`, `DEFERRED`, `REJECT`.
- Telegram brief format as legacy output reference.
- Daily run history and logs.

Weak spots to fix during migration:

- Secrets are stored in `config.py` and were also present inline in root crontab. Rotate and move them to `.env` before exposing EAIS externally.
- Kora/Ollama scoring calls to `192.168.5.157:11434` timed out repeatedly in recent logs.
- TikTok and Twitter ingestors are currently producing zero items.
- Many recent items remain untriaged.
- The 3 AM pipeline and 7 AM brief are crontab jobs, not systemd timers.
- The current brief is Telegram-only, not the approved branded HTML email.

## Start Build Recommendation

Do not overwrite `/opt/digest` yet.

Recommended first production step:

```text
/opt/eais
  fresh EAIS app
  imports from /opt/digest/digest.db read-only at first
  own .env
  own database
  own systemd service/timer
```

Use `/opt/digest` as a data/source migration input, not the production app directory.

## First Implementation Checklist

Completed:

- Created `/opt/eais` on CT 301.
- Cloned `makeway4j/eais-dashboard` into `/opt/eais`.
- Installed production npm dependencies with `npm install --omit=dev`.
- Added server-only `.env` with dry-run defaults.
- Ran `npm test` successfully on CT 301.
- Ran `npm run dry-run` successfully on CT 301.
- Generated `/opt/eais/dist/daily-update.html` with 24 live items and no email send.
- Added EAIS SQLite database at `/opt/eais/data/eais.db`.
- Imported 2,967 legacy digest items from `/opt/digest/digest.db` into EAIS.
- Recorded one successful `import-digest` run in EAIS `run_history`.
- Added and installed `eais-dashboard.service` on CT 301.
- Started the EAIS web/API service on `127.0.0.1:8788`.
- Verified `/api/health`, `/api/summary`, `/api/items`, and dashboard HTML through a local SSH tunnel.

Remaining:

1. Add dashboard API hydration for more views beyond Today.
2. Add a systemd timer for the 6 AM daily briefing.
3. Keep old `/opt/digest` cron enabled until EAIS can produce a confirmed daily brief.
4. After EAIS sends a verified email and saves to Joplin, disable or archive the old digest cron.

## Security Blockers Before External Access

- Rotate Gemini key.
- Rotate Telegram bot token if it will keep being used.
- Rotate Twitter/X bearer token if still active.
- Move all secrets out of crontab and source files.
- Add authentication before Cloudflare exposure.
- Confirm no `.env`, tokens, or internal service URLs are exposed in dashboard responses.

## Immediate Next Command Set

Initial build start completed:

```bash
ssh -J root@192.168.5.77 root@192.168.5.156
mkdir -p /opt/eais
cd /opt/eais
git clone https://github.com/makeway4j/eais-dashboard.git .
npm install --omit=dev
npm test
npm run dry-run
npm run eais:init-db
npm run eais:import-digest
npm run eais:summary
bash scripts/install-eais-dashboard-systemd.sh
```

Then add production service files after the app skeleton is ready.
