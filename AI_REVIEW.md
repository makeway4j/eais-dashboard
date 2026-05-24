# AI Review Log

## Current Task

Set up the home-lab development project for a daily 6:00 AM HTML AI/AI-governance digest.

## Codex Changes

- Files changed:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
  - `.env.example`
  - `.gitignore`
  - `package.json`
  - `src/**`
  - `docs/**`
  - `prompts/**`
  - `data/samples/items.json`
  - `scripts/**`
  - `tests/render-smoke.mjs`
- Summary:
  - Created a dependency-light Node project that renders a sample rich HTML digest.
  - Added home-lab scheduling notes and a Windows Task Scheduler helper.
  - Added provider guidance, source policy, and review workflow docs.
  - Read the root `C:\JCW_3\CLAUDE.md` and aligned this project with the existing homelab morning-digest Gmail SMTP TODO.
  - Added production dry-run path with live RSS ingestion, local classification, optional OpenAI summarization, SMTP sending, and daily logs.
  - Disabled the local Windows scheduled task after confirming the desktop turns off at night.
  - Added Linux systemd deployment scripts and homelab deployment docs.
  - Added a static EAIS dashboard mockup under `mockups/eais-dashboard`.
- Known issues:
  - Gmail credentials are not configured yet.
  - OpenAI summarization is disabled until `OPENAI_API_KEY` and `ENABLE_OPENAI_SUMMARY=true` are set.
  - Anthropic does not currently have a working official RSS feed in the source list.
  - Homelab host deployment is pending target confirmation.
  - Dashboard mockup is static and not connected to `/opt/digest` or live EAIS data yet.
  - LinkedIn/X posting and job recommendations are planned but intentionally separate.

## Claude Review Checklist

- Does the project run from the repo root with the documented commands?
- Are secrets excluded and represented only in `.env.example`?
- Is the daily email pipeline separated from future social/jobs modules?
- Does every generated item preserve source URL and publish date?
- Is any AI-generated content clearly grounded in source material?
- Are errors handled in a way a home-lab scheduled job can report?

## Approved Next Action

Wire the first real integration: either email sending via the chosen provider or live RSS/source ingestion.
