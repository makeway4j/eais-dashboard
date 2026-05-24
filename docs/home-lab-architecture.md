# Home-Lab Architecture

## First System

Run the daily digest on the always-on home lab at 6:00 AM local time.

```text
Windows Task Scheduler
  -> scripts/run-daily.ps1
  -> npm run daily
  -> fetch sources
  -> rank and summarize
  -> render HTML
  -> send email
```

## Phases

1. Generate a polished sample email locally.
2. Add live source ingestion.
3. Add OpenAI summarization, dedupe, and ranking.
4. Add email sending.
5. Add local logs and failure notifications.
6. Add a simple dashboard for reviewing recent digests.
7. Add social draft generation for LinkedIn and X/Twitter.
8. Add job recommendation collection and scoring.

## Root Homelab Alignment

Root `C:\JCW_3\CLAUDE.md` already lists a related TODO: upgrade the morning digest `brief.py` to an HTML email via Gmail SMTP, styled like Google "Your day ahead." No `brief.py` was found under `C:\JCW_3` during this setup, so this project should serve as the new implementation unless that legacy script is later located on another host.

The first production sender should be Gmail SMTP because it matches the existing homelab TODO and is cheapest for one personal daily email.

## Internal Modules

Keep these systems separate:

- Daily digest: source intelligence and email.
- Social publisher: drafts, approval, and posting.
- Job recommendations: job ingestion, fit scoring, and application tracking.
- Dashboard: internal review UI and logs.

The digest can feed the other modules, but those modules should not make the digest job fragile.
