#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${EAIS_APP_DIR:-/opt/eais}
SERVICE_PATH=/etc/systemd/system/eais-dashboard.service

cat > "$SERVICE_PATH" <<UNIT
[Unit]
Description=EAIS Dashboard Web/API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=EAIS_HOST=127.0.0.1
Environment=EAIS_PORT=8788
EnvironmentFile=-$APP_DIR/.env
ExecStart=/usr/bin/npm run eais:serve
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable eais-dashboard.service
systemctl restart eais-dashboard.service
systemctl --no-pager status eais-dashboard.service
