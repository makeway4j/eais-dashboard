# HTML Daily Update

Home-lab automation for a daily 6:00 AM HTML email briefing covering AI news, AI governance, major AI vendors, data centers, AI infrastructure, and related tech news.

## Quick Start

```powershell
cd C:\JCW_3\projects\html-dailyupdate
npm run generate
npm test
```

Open the generated preview:

```powershell
start .\dist\daily-update.html
```

Run a production-safe live dry run:

```powershell
npm run dry-run
```

## Current Status

Working now:

- Sample digest generation.
- Rich HTML email template.
- Topic and source configuration.
- Live RSS ingestion.
- Local classification, ranking, and dedupe.
- Optional OpenAI summarization hook.
- Gmail/Brevo SMTP sender in dry-run or send mode.
- Daily logs.
- Home-lab scheduling helper.
- AI agent review workflow.

Not wired yet:

- Gmail credentials in local `.env`.
- LinkedIn/X posting.
- Job recommendations.

## Home-Lab Plan

Run the daily digest from an always-on homelab host at 6:00 AM local time.

EAIS dashboard planning is now captured in [docs/eais-production-spec.md](docs/eais-production-spec.md). Treat that file as the approved product spec for the production dashboard build.

This project also maps to the root homelab TODO in `C:\JCW_3\CLAUDE.md`: upgrade the morning digest to an HTML email via Gmail SMTP, styled like Google "Your day ahead."

The initial Windows scheduled task was disabled because the desktop may turn off overnight. Production should move to a Linux host with systemd. See [docs/homelab-deployment.md](docs/homelab-deployment.md).

Windows-only helper, not the preferred production path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-task.ps1
```

The scheduled task runs:

```powershell
powershell -ExecutionPolicy Bypass -File C:\JCW_3\projects\html-dailyupdate\scripts\run-daily.ps1
```

Read [docs/production-runbook.md](docs/production-runbook.md) before enabling send mode.

## Architecture

```text
sources -> fetch -> classify/dedupe/rank -> summarize -> render HTML -> send email
                                                        -> future social drafts
                                                        -> future job recs
```

The daily digest stays as the core product. Social posting and job recommendations should become separate modules that can reuse the same source intelligence.

## API Keys

For live OpenAI summarization, this project will need an `OPENAI_API_KEY` in `.env`. A ChatGPT subscription does not automatically cover API usage.

For email sending, start with Gmail/SMTP if you are only emailing yourself. Use Brevo/Resend/SendGrid if you want cleaner transactional-email delivery, logs, and future scaling.
