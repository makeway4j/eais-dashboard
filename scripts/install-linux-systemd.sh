#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="html-dailyupdate"
NODE_PATH="$(command -v node)"
NPM_PATH="$(command -v npm)"

cat >/etc/systemd/system/${SERVICE_NAME}.service <<UNIT
[Unit]
Description=HTML Daily AI Update
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${PROJECT_ROOT}
Environment=PATH=$(dirname "$NODE_PATH"):$(dirname "$NPM_PATH"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=${NPM_PATH} run daily
StandardOutput=append:${PROJECT_ROOT}/logs/systemd.log
StandardError=append:${PROJECT_ROOT}/logs/systemd-error.log
UNIT

cat >/etc/systemd/system/${SERVICE_NAME}.timer <<UNIT
[Unit]
Description=Run HTML Daily AI Update every morning

[Timer]
OnCalendar=*-*-* 06:00:00
Persistent=true
Unit=${SERVICE_NAME}.service

[Install]
WantedBy=timers.target
UNIT

mkdir -p "${PROJECT_ROOT}/logs"
systemctl daemon-reload
systemctl enable --now ${SERVICE_NAME}.timer
systemctl list-timers ${SERVICE_NAME}.timer
