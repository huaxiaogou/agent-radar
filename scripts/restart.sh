#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"

node --no-warnings "${APP_DIR}/scripts/check-editorial-readiness.mjs"
"${SCRIPT_DIR}/stop.sh"
BUILD=1 "${SCRIPT_DIR}/start.sh"
