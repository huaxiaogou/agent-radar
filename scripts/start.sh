#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
RUN_DIR="${APP_DIR}/.run"
PID_FILE="${RUN_DIR}/agent-radar.pid"
LOG_FILE="${RUN_DIR}/agent-radar.log"
LOCK_DIR="${RUN_DIR}/start.lock"
NEXT_BIN="${APP_DIR}/node_modules/next/dist/bin/next"
HOST="127.0.0.1"
PORT="3002"
BUILD="${BUILD:-0}"

mkdir -p -m 700 "${RUN_DIR}"

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  echo "错误：另一个 Agent Radar 启动操作正在执行。" >&2
  exit 1
fi
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT

process_working_directory() {
  local pid="$1"

  if [[ -e "/proc/${pid}/cwd" ]]; then
    readlink "/proc/${pid}/cwd" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
  fi
}

process_belongs_to_app() {
  local pid="$1"
  local command working_directory

  command="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  working_directory="$(process_working_directory "${pid}")"
  [[ "${working_directory}" == "${APP_DIR}" ]] &&
    { [[ "${command}" == next-server* ]] || [[ "${command}" == *"${NEXT_BIN}"* ]]; }
}

port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn 'sport = :3002' 2>/dev/null | grep -q .
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:3002 -sTCP:LISTEN >/dev/null 2>&1
  else
    (echo >/dev/tcp/127.0.0.1/3002) >/dev/null 2>&1
  fi
}

if [[ -f "${PID_FILE}" ]]; then
  existing_pid="$(tr -dc '0-9' <"${PID_FILE}")"
  if [[ -n "${existing_pid}" ]] && kill -0 "${existing_pid}" 2>/dev/null; then
    if process_belongs_to_app "${existing_pid}"; then
      echo "Agent Radar 已运行：PID ${existing_pid}，http://${HOST}:${PORT}"
      exit 0
    fi
    echo "错误：PID 文件指向其他进程，拒绝覆盖。" >&2
    exit 1
  fi
  rm -f "${PID_FILE}"
fi

if port_in_use; then
  echo "错误：127.0.0.1:${PORT} 已被现有服务占用，拒绝启动。" >&2
  exit 1
fi

[[ -f "${NEXT_BIN}" ]] || {
  echo "错误：依赖未安装，请先执行 npm ci。" >&2
  exit 1
}

cd "${APP_DIR}"
node --no-warnings "${APP_DIR}/scripts/check-editorial-readiness.mjs"
node --no-warnings "${APP_DIR}/scripts/check-concepts.mjs"
if [[ "${BUILD}" == "1" || ! -f "${APP_DIR}/.next/BUILD_ID" ]]; then
  npm run build
fi

: >"${LOG_FILE}"
NODE_ENV=production nohup node "${NEXT_BIN}" start \
  --hostname "${HOST}" \
  --port "${PORT}" \
  >>"${LOG_FILE}" 2>&1 &
app_pid=$!
printf '%s\n' "${app_pid}" >"${PID_FILE}"

for _ in {1..30}; do
  if ! kill -0 "${app_pid}" 2>/dev/null; then
    break
  fi
  if process_belongs_to_app "${app_pid}" &&
    curl --fail --silent --show-error --max-time 2 \
      "http://${HOST}:${PORT}/api/health" | grep -q '"service":"agent-radar"'; then
    echo "启动成功：PID ${app_pid}"
    echo "本地地址：http://${HOST}:${PORT}"
    echo "日志文件：${LOG_FILE}"
    exit 0
  fi
  sleep 1
done

echo "错误：Agent Radar 未能在预期时间内启动。" >&2
tail -n 40 "${LOG_FILE}" >&2 || true
if kill -0 "${app_pid}" 2>/dev/null && process_belongs_to_app "${app_pid}"; then
  kill -TERM "${app_pid}" 2>/dev/null || true
fi
rm -f "${PID_FILE}"
exit 1
