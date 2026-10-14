#!/usr/bin/env bash
# Kuru — Proxmox VE LXC, in the community-scripts.org format. Run on the Proxmox host:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/lampix/kuru/main/proxmox/ct/kuru.sh)"
# Inside the container, `update` re-runs this script, which then calls update_script().
#
# The community-scripts engine fetches install/kuru-install.sh (and later this script, for
# `update`) relative to COMMUNITY_SCRIPTS_URL, so point it at this repository.
export COMMUNITY_SCRIPTS_URL="${COMMUNITY_SCRIPTS_URL:-https://raw.githubusercontent.com/lampix/kuru/main/proxmox}"
source <(curl -fsSL "${COMMUNITY_SCRIPTS_CORE_URL:-https://raw.githubusercontent.com/community-scripts/core/main}/core/build.func")
# Copyright (c) 2026 The Kuru contributors
# License: MIT | https://github.com/lampix/kuru/raw/main/LICENSE
# Source: https://github.com/lampix/kuru

APP="Kuru"
var_tags="${var_tags:-education;flashcards}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-1024}"
var_disk="${var_disk:-8}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_arm64="${var_arm64:-yes}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/kuru ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  if check_for_gh_release "kuru" "lampix/kuru"; then
    msg_info "Stopping Services"
    systemctl stop kuru-frontend kuru-backend
    msg_ok "Stopped Services"

    if [[ -f /opt/kuru-data/kuru.db ]]; then
      msg_info "Backing up Database"
      # SQLite's online backup API: a consistent copy without the sqlite3 CLI.
      /opt/kuru/backend/.venv/bin/python -c 'import sqlite3; sqlite3.connect("/opt/kuru-data/kuru.db").backup(sqlite3.connect("/opt/kuru-data/kuru.db.pre-update"))'
      msg_ok "Backed up Database to /opt/kuru-data/kuru.db.pre-update"
    fi

    CLEAN_INSTALL=1 fetch_and_deploy_gh_release "kuru" "lampix/kuru" "prebuild" "latest" "/opt/kuru" "kuru-*-linux-$(dpkg --print-architecture).tar.gz"
    NODE_VERSION="24" setup_nodejs
    PYTHON_VERSION="3.14" setup_uv

    msg_info "Installing Backend Dependencies"
    $STD uv sync --directory /opt/kuru/backend --locked --no-dev --no-editable --python 3.14
    msg_ok "Installed Backend Dependencies"

    # Database migrations run when the backend starts.
    msg_info "Starting Services"
    systemctl start kuru-backend kuru-frontend
    msg_ok "Started Services"
    msg_ok "Updated successfully!"
  fi
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
echo -e "${GATEWAY}${BGN}http://${IP}:3000${CL}"
echo -e "${INFO}${YW} Offline use and installing the app need HTTPS (reverse proxy), see docs/deployment.md${CL}"
