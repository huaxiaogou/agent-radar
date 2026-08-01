#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
RUN_DIR="${APP_DIR}/.run"
PID_FILE="${RUN_DIR}/agent-radar.pid"
NEXT_BIN="${APP_DIR}/node_modules/next/dist/bin/next"

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

if [[ ! -f "${PID_FILE}" ]]; then
  echo "Agent Radar 未运行。"
  exit 0
fi

app_pid="$(tr -dc '0-9' <"${PID_FILE}")"
if [[ -z "${app_pid}" ]] || ! kill -0 "${app_pid}" 2>/dev/null; then
  rm -f "${PID_FILE}"
  echo "Agent Radar 未运行，已清理过期 PID。"
  exit 0
fi

if ! process_belongs_to_app "${app_pid}"; then
  echo "错误：PID ${app_pid} 不属于 Agent Radar，拒绝终止。" >&2
  exit 1
fi

kill -TERM "${app_pid}"
for _ in {1..20}; do
  if ! kill -0 "${app_pid}" 2>/dev/null; then
    rm -f "${PID_FILE}"
    echo "停止成功。"
    exit 0
  fi
  sleep 1
done

if ! process_belongs_to_app "${app_pid}"; then
  echo "错误：等待期间 PID 归属发生变化，拒绝发送 KILL。" >&2
  exit 1
fi
kill -KILL "${app_pid}"
rm -f "${PID_FILE}"
echo "停止成功。"
