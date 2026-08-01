#!/usr/bin/env bash

set -Eeuo pipefail

MARKER="# managed-by: agent-radar"
SERVICE_NAME="agent-radar-ingest.service"
TIMER_NAME="agent-radar-ingest.timer"
SYSTEMD_DIR="/etc/systemd/system"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=()
else
  command -v sudo >/dev/null 2>&1 || {
    echo "错误：请使用 root 或安装 sudo。" >&2
    exit 1
  }
  SUDO=(sudo)
fi

command -v systemctl >/dev/null 2>&1 || {
  echo "错误：服务器不是 systemd 环境，无法安装定时器。" >&2
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo "错误：当前环境找不到 Node.js。" >&2
  exit 1
}
[[ -f "${APP_DIR}/scripts/ingest.mjs" ]] || {
  echo "错误：未找到采集入口。" >&2
  exit 1
}

NODE_BIN="$(command -v node)"
APP_USER="$(stat -c '%U' "${APP_DIR}")"
APP_GROUP="$(stat -c '%G' "${APP_DIR}")"
SERVICE_FILE="${SYSTEMD_DIR}/${SERVICE_NAME}"
TIMER_FILE="${SYSTEMD_DIR}/${TIMER_NAME}"

for unit in "${SERVICE_FILE}" "${TIMER_FILE}"; do
  if "${SUDO[@]}" test -f "${unit}" && [[ "$("${SUDO[@]}" head -n 1 "${unit}")" != "${MARKER}" ]]; then
    echo "错误：拒绝覆盖非 Agent Radar 管理的 unit：${unit}" >&2
    exit 1
  fi
done

SERVICE_TEMP="$(mktemp)"
TIMER_TEMP="$(mktemp)"
trap 'rm -f "${SERVICE_TEMP}" "${TIMER_TEMP}"' EXIT

cat >"${SERVICE_TEMP}" <<EOF
${MARKER}
[Unit]
Description=Agent Radar source ingestion
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
EnvironmentFile=-${APP_DIR}/.env.production
ExecStart=${NODE_BIN} ${APP_DIR}/scripts/ingest.mjs --trigger systemd
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${APP_DIR}/.data ${APP_DIR}/.run
TimeoutStartSec=20min
EOF

cat >"${TIMER_TEMP}" <<EOF
${MARKER}
[Unit]
Description=Run Agent Radar ingestion every four hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=4h
RandomizedDelaySec=10min
Persistent=true
Unit=${SERVICE_NAME}

[Install]
WantedBy=timers.target
EOF

mkdir -p "${APP_DIR}/.data" "${APP_DIR}/.run"
chmod 700 "${APP_DIR}/.data" "${APP_DIR}/.run"
"${SUDO[@]}" install -m 0644 "${SERVICE_TEMP}" "${SERVICE_FILE}"
"${SUDO[@]}" install -m 0644 "${TIMER_TEMP}" "${TIMER_FILE}"
"${SUDO[@]}" systemctl daemon-reload
"${SUDO[@]}" systemctl enable --now "${TIMER_NAME}"

echo "定时采集已启用：每 4 小时执行一次，并带 0-10 分钟随机延迟。"
"${SUDO[@]}" systemctl list-timers "${TIMER_NAME}" --no-pager
echo "手工执行：sudo systemctl start ${SERVICE_NAME}"
echo "查看日志：sudo journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
