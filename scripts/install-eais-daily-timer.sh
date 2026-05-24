#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${EAIS_APP_DIR:-/opt/eais}
SERVICE_NAME=eais-daily-brief
SERVICE_PATH=/etc/systemd/system/${SERVICE_NAME}.service
TIMER_PATH=/etc/systemd/system/${SERVICE_NAME}.timer
NPM_PATH=${NPM_PATH:-$(command -v npm)}

mkdir -p "$APP_DIR/logs"

cat > "$SERVICE_PATH" <<UNIT
[Unit]
Description=EAIS Daily Morning Briefing
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
EnvironmentFile=-$APP_DIR/.env
ExecStart=$NPM_PATH run daily
StandardOutput=append:$APP_DIR/logs/eais-daily-brief.log
StandardError=append:$APP_DIR/logs/eais-daily-brief-error.log
UNIT

cat > "$TIMER_PATH" <<UNIT
[Unit]
Description=Run EAIS Daily Morning Briefing at 6 AM Central

[Timer]
OnCalendar=*-*-* 06:00:00 America/Chicago
Persistent=true
Unit=${SERVICE_NAME}.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now ${SERVICE_NAME}.timer
systemctl --no-pager list-timers ${SERVICE_NAME}.timer
