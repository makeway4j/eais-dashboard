# Homelab Deployment

## Important Decision

Do not run production from the Windows desktop if that PC turns off at night. The daily briefing should run on an always-on homelab host.

Recommended target:

- CT 301 `creative-workstation` at `192.168.5.156`

Reason:

- It is an always-on Ubuntu 24.04 LTS container.
- It already hosts creative/media services.
- It is a better fit than the Windows desktop for a 6:00 AM unattended job.

## Production Shape

```text
CT 301 /opt/html-dailyupdate
  -> systemd timer at 6:00 AM
  -> npm run daily
  -> dist/daily-update.html
  -> logs/YYYY-MM-DD.log
```

## Local Windows Task

The Windows scheduled task `HTML Daily AI Update` was installed during initial setup, then disabled on 2026-05-24 after confirming the desktop turns off at night.

Production should use the Linux systemd timer instead.

## Target Layout

```text
/opt/html-dailyupdate/
  package.json
  package-lock.json
  src/
  scripts/
  docs/
  prompts/
  data/
  .env
```

Do not copy `dist/`, `logs/`, `.git/`, `.env` from Windows unless explicitly needed.

## Deployment Steps

These steps should be run only after confirming the target host.

```bash
ssh root@192.168.5.156
mkdir -p /opt/html-dailyupdate
cd /opt/html-dailyupdate
npm install --omit=dev
npm run dry-run
bash scripts/install-linux-systemd.sh
```

## Secrets

Create `/opt/html-dailyupdate/.env` on the homelab host.

Minimum dry-run:

```env
EMAIL_SEND_MODE=dry-run
ENABLE_OPENAI_SUMMARY=false
```

To send real email:

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

## Verification

```bash
systemctl status html-dailyupdate.timer
systemctl list-timers html-dailyupdate.timer
systemctl start html-dailyupdate.service
tail -n 50 /opt/html-dailyupdate/logs/systemd.log
```
