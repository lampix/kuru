#!/usr/bin/env bash
# Kuru — runs inside the new LXC (started by ct/kuru.sh through the community-scripts engine).
# Copyright (c) 2026 The Kuru contributors
# License: MIT | https://github.com/lampix/kuru/raw/main/LICENSE
# Source: https://github.com/lampix/kuru
#
# Layout:
#   /opt/kuru        release bundle (replaced on every update)
#   /opt/kuru-data   database and media (KURU_DATA_DIR)
#   /opt/kuru.env    settings for both services

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

NODE_VERSION="24" setup_nodejs
PYTHON_VERSION="3.14" setup_uv
fetch_and_deploy_gh_release "kuru" "lampix/kuru" "prebuild" "latest" "/opt/kuru" "kuru-*-linux-$(dpkg --print-architecture).tar.gz"

msg_info "Installing Backend Dependencies"
$STD uv sync --directory /opt/kuru/backend --locked --no-dev --no-editable --python 3.14
msg_ok "Installed Backend Dependencies"

msg_info "Configuring Kuru"
mkdir -p /opt/kuru-data
TIMEZONE="$(timedatectl show -p Timezone --value 2>/dev/null || true)"
cat <<EOF >/opt/kuru.env
# Kuru settings — restart after changes: systemctl restart kuru-backend kuru-frontend
# All backend settings: https://github.com/lampix/kuru/blob/main/backend/README.md
KURU_DATA_DIR=/opt/kuru-data
# Require this token to sign in (leave empty for an open single-user instance).
KURU_ACCESS_TOKEN=
# Study-day timezone of the initial user (the app adopts the device timezone).
KURU_DEFAULT_TIMEZONE=${TIMEZONE:-UTC}
KURU_MAX_UPLOAD_MB=2048
# Port of the web app.
PORT=3000
EOF
chmod 600 /opt/kuru.env
msg_ok "Configured Kuru"

msg_info "Creating Services"
cat <<EOF >/etc/systemd/system/kuru-backend.service
[Unit]
Description=Kuru backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/kuru-data
EnvironmentFile=/opt/kuru.env
Environment=PYTHONUNBUFFERED=1
# A single worker: import progress is tracked in-process. Only the frontend talks to it.
ExecStart=/opt/kuru/backend/.venv/bin/uvicorn kuru.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips 127.0.0.1
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
cat <<EOF >/etc/systemd/system/kuru-frontend.service
[Unit]
Description=Kuru web app
After=network.target kuru-backend.service
Wants=kuru-backend.service

[Service]
Type=simple
WorkingDirectory=/opt/kuru/frontend
EnvironmentFile=/opt/kuru.env
Environment=NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl enable -q --now kuru-backend kuru-frontend
msg_ok "Created Services"

motd_ssh
customize
cleanup_lxc
