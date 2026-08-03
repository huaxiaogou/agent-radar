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

node_bin_error() {
  echo "错误：找不到兼容的 Node.js；NODE_BIN 必须是绝对路径、普通可执行文件，并满足 Node.js >=22.13.0 且可加载 node:sqlite。" >&2
  echo "修复示例：sudo env NODE_BIN=/usr/local/bin/node ${APP_DIR}/scripts/install-scheduler.sh" >&2
  exit 1
}

NODE_BIN="${NODE_BIN:-}"
if [[ -z "${NODE_BIN}" ]]; then
  NODE_BIN="$(command -v node || true)"
fi
[[ "${NODE_BIN}" == /* ]] || node_bin_error
[[ -f "${NODE_BIN}" ]] || node_bin_error
[[ -x "${NODE_BIN}" ]] || node_bin_error

[[ -f "${APP_DIR}/scripts/ingest.mjs" ]] || {
  echo "错误：未找到采集入口。" >&2
  exit 1
}

APP_USER="$(stat -c '%U' "${APP_DIR}")"
APP_GROUP="$(stat -c '%G' "${APP_DIR}")"
NODE_CAPABILITY_PROBE='const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1); await import("node:sqlite");'

if [[ "$(id -un)" == "${APP_USER}" ]]; then
  "${NODE_BIN}" --version >/dev/null 2>&1 || node_bin_error
  "${NODE_BIN}" --input-type=module --eval "${NODE_CAPABILITY_PROBE}" >/dev/null 2>&1 || node_bin_error
elif command -v runuser >/dev/null 2>&1; then
  "${SUDO[@]}" runuser -u "${APP_USER}" -- test -x "${NODE_BIN}" >/dev/null 2>&1 || node_bin_error
  "${SUDO[@]}" runuser -u "${APP_USER}" -- "${NODE_BIN}" --version >/dev/null 2>&1 || node_bin_error
  "${SUDO[@]}" runuser -u "${APP_USER}" -- "${NODE_BIN}" --input-type=module --eval "${NODE_CAPABILITY_PROBE}" >/dev/null 2>&1 || node_bin_error
elif command -v sudo >/dev/null 2>&1; then
  sudo -u "${APP_USER}" -- test -x "${NODE_BIN}" >/dev/null 2>&1 || node_bin_error
  sudo -u "${APP_USER}" -- "${NODE_BIN}" --version >/dev/null 2>&1 || node_bin_error
  sudo -u "${APP_USER}" -- "${NODE_BIN}" --input-type=module --eval "${NODE_CAPABILITY_PROBE}" >/dev/null 2>&1 || node_bin_error
else
  echo "错误：无法切换到 systemd 服务用户 ${APP_USER} 验证 Node.js。" >&2
  exit 1
fi

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
TimeoutStartSec=2h
EOF

cat >"${TIMER_TEMP}" <<EOF
${MARKER}
[Unit]
Description=Wake Agent Radar ingestion every hour

[Timer]
OnBootSec=5min
OnUnitActiveSec=1h
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

echo "定时采集已启用：每 1 小时唤醒一次，并带 0-10 分钟随机延迟；每个来源仍按自身 cadence 判断是否采集。"
"${SUDO[@]}" systemctl list-timers "${TIMER_NAME}" --no-pager
echo "按各来源 cadence 唤醒、只处理到期来源：sudo systemctl start ${SERVICE_NAME}"
echo "强制全量扫描（跳过来源 cadence）：cd ${APP_DIR} && npm run ingest"
echo "查看日志：sudo journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
