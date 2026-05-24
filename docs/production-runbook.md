# Production Runbook

## Current Production Shape

The production path is now:

```text
Windows Task Scheduler at 6:00 AM
  -> scripts/run-daily.ps1
  -> npm run daily
  -> live RSS feeds
  -> local classification and ranking
  -> optional OpenAI summarization
  -> HTML render
  -> dry-run or Gmail SMTP send
  -> logs/YYYY-MM-DD.log
```

## Safe Verification

Run these from the VS Code terminal:

```powershell
cd C:\JCW_3\projects\html-dailyupdate
npm run generate
npm test
npm run dry-run
```

`npm run dry-run` fetches live sources and writes `dist/daily-update.html`, but does not send email.

## Enable Gmail Sending

Create a local `.env` file from `.env.example` and fill in:

```env
EMAIL_SEND_MODE=send
EMAIL_PROVIDER=gmail_smtp
EMAIL_FROM="AI Daily <your-gmail-address@gmail.com>"
EMAIL_TO="your-gmail-address@gmail.com"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=your-google-app-password
SMTP_SECURE=false
```

Then test one manual send:

```powershell
npm run send
```

Only install the scheduled task after one manual send succeeds.

## Enable OpenAI Summaries

Add these to `.env`:

```env
ENABLE_OPENAI_SUMMARY=true
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4.1-mini
```

If the API call fails, the job falls back to local summaries and logs the error.

## Install 6 AM Schedule

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-task.ps1
```

## Logs

Logs are written to:

```text
logs/YYYY-MM-DD.log
```

The logs include source fetch counts, skipped send state, OpenAI summary state, and final item count.

## Known Source Notes

Anthropic did not expose a working official RSS feed at common URLs during setup on 2026-05-24. Anthropic items are currently expected to arrive through reputable news feeds until a direct website monitor is added.
