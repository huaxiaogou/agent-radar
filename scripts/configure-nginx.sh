#!/usr/bin/env bash

set -Eeuo pipefail

DOMAIN="radar.jayjp.com"
APP_PORT="3002"
MARKER="# managed-by: agent-radar"
AGENT_HEALTH_URL="http://127.0.0.1:3001/api/health"
RADAR_HEALTH_URL="http://127.0.0.1:${APP_PORT}/api/health"
FINANCE_URL="http://127.0.0.1:3000/"

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=()
else
  command -v sudo >/dev/null 2>&1 || {
    echo "错误：请使用 root 或安装 sudo。" >&2
    exit 1
  }
  SUDO=(sudo)
fi

for required_command in curl nginx openssl; do
  command -v "${required_command}" >/dev/null 2>&1 || {
    echo "错误：服务器缺少 ${required_command}。" >&2
    exit 1
  }
done

check_identity() {
  local url="$1"
  local identity="$2"
  local label="$3"
  local response

  if ! response="$(
    curl --fail --silent --show-error --max-time 5 --noproxy "*" "${url}"
  )" || ! grep -Fq "${identity}" <<<"${response}"; then
    echo "错误：${label} 健康检查失败：${url}" >&2
    return 1
  fi
}

echo ">>> 检查三个本地上游，异常时不修改 Nginx..."
check_identity "${FINANCE_URL}" "LoanRisk Coursebook" "金融站（3000）"
check_identity "${AGENT_HEALTH_URL}" '"service":"agent-engineering-coursebook"' \
  "Agent 站（3001）"
check_identity "${RADAR_HEALTH_URL}" '"service":"agent-radar"' \
  "Agent Radar（3002）"

if [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]]; then
  TARGET_FILE="/etc/nginx/sites-available/${DOMAIN}.conf"
  ENABLED_FILE="/etc/nginx/sites-enabled/${DOMAIN}.conf"
else
  TARGET_FILE="/etc/nginx/conf.d/${DOMAIN}.conf"
  ENABLED_FILE=""
fi

if "${SUDO[@]}" test -f "${TARGET_FILE}" &&
  [[ "$("${SUDO[@]}" head -n 1 "${TARGET_FILE}")" != "${MARKER}" ]]; then
  echo "错误：拒绝覆盖非 Agent Radar 管理的配置：${TARGET_FILE}" >&2
  exit 1
fi

if ! NGINX_DUMP="$("${SUDO[@]}" nginx -T 2>&1)"; then
  echo "错误：无法读取当前生效的 Nginx 配置；未做任何修改。" >&2
  exit 1
fi
RADAR_CONFIG_OWNERS="$(awk '
  /^# configuration file / {
    current = $4
    sub(/:$/, "", current)
  }
  /server_name[[:space:]]+radar\.jayjp\.com([[:space:];]|$)/ {
    if (current != "") print current
  }
' <<<"${NGINX_DUMP}" | sort -u)"

while IFS= read -r owner; do
  [[ -n "${owner}" ]] || continue
  if [[ "${owner}" != "${TARGET_FILE}" &&
    ( -z "${ENABLED_FILE}" || "${owner}" != "${ENABLED_FILE}" ) ]]; then
    echo "错误：radar.jayjp.com 已由其他配置处理：${owner}" >&2
    exit 1
  fi
done <<<"${RADAR_CONFIG_OWNERS}"

certificate_matches_domain() {
  local certificate="$1"

  "${SUDO[@]}" test -r "${certificate}" &&
    "${SUDO[@]}" openssl x509 -in "${certificate}" -noout \
      -checkhost "${DOMAIN}" >/dev/null 2>&1
}

key_matches_certificate() {
  local certificate="$1"
  local private_key="$2"
  local certificate_hash
  local private_key_hash

  "${SUDO[@]}" test -r "${private_key}" || return 1
  certificate_hash="$(
    "${SUDO[@]}" openssl x509 -in "${certificate}" -pubkey -noout 2>/dev/null |
      openssl pkey -pubin -outform DER 2>/dev/null |
      openssl dgst -sha256 2>/dev/null
  )"
  private_key_hash="$(
    "${SUDO[@]}" openssl pkey -in "${private_key}" -pubout -outform DER 2>/dev/null |
      openssl dgst -sha256 2>/dev/null
  )"
  [[ -n "${certificate_hash}" && "${certificate_hash}" == "${private_key_hash}" ]]
}

validate_tls_path() {
  local path="$1"
  [[ "${path}" =~ ^/[A-Za-z0-9._/@+-]+$ ]]
}

SSL_CERTIFICATE="${SSL_CERTIFICATE:-}"
SSL_CERTIFICATE_KEY="${SSL_CERTIFICATE_KEY:-}"

if [[ -n "${SSL_CERTIFICATE}" || -n "${SSL_CERTIFICATE_KEY}" ]]; then
  if [[ -z "${SSL_CERTIFICATE}" || -z "${SSL_CERTIFICATE_KEY}" ]] ||
    ! validate_tls_path "${SSL_CERTIFICATE}" ||
    ! validate_tls_path "${SSL_CERTIFICATE_KEY}" ||
    ! certificate_matches_domain "${SSL_CERTIFICATE}" ||
    ! key_matches_certificate "${SSL_CERTIFICATE}" "${SSL_CERTIFICATE_KEY}"; then
    echo "错误：SSL_CERTIFICATE/SSL_CERTIFICATE_KEY 不完整、不可读、不匹配或证书不覆盖 ${DOMAIN}。" >&2
    exit 1
  fi
else
  CERTIFICATE_CANDIDATES=()
  KEY_CANDIDATES=()

  while IFS= read -r candidate; do
    [[ -n "${candidate}" ]] && CERTIFICATE_CANDIDATES+=("${candidate}")
  done < <(awk '
    $1 == "ssl_certificate" {
      path = $2
      sub(/;$/, "", path)
      if (path ~ /^\// && !seen[path]++) print path
    }
  ' <<<"${NGINX_DUMP}")

  while IFS= read -r candidate; do
    [[ -n "${candidate}" ]] && KEY_CANDIDATES+=("${candidate}")
  done < <(awk '
    $1 == "ssl_certificate_key" {
      path = $2
      sub(/;$/, "", path)
      if (path ~ /^\// && !seen[path]++) print path
    }
  ' <<<"${NGINX_DUMP}")

  for certificate_candidate in "${CERTIFICATE_CANDIDATES[@]}"; do
    validate_tls_path "${certificate_candidate}" || continue
    certificate_matches_domain "${certificate_candidate}" || continue
    for key_candidate in "${KEY_CANDIDATES[@]}"; do
      validate_tls_path "${key_candidate}" || continue
      if key_matches_certificate "${certificate_candidate}" "${key_candidate}"; then
        SSL_CERTIFICATE="${certificate_candidate}"
        SSL_CERTIFICATE_KEY="${key_candidate}"
        break 2
      fi
    done
  done
fi

if [[ -z "${SSL_CERTIFICATE}" || -z "${SSL_CERTIFICATE_KEY}" ]]; then
  echo "错误：未找到覆盖 ${DOMAIN} 的现有证书和匹配私钥。" >&2
  echo "请显式执行：sudo env SSL_CERTIFICATE=/证书路径 SSL_CERTIFICATE_KEY=/私钥路径 $0" >&2
  exit 1
fi

TEMP_FILE="$(mktemp)"
BACKUP_FILE=""
CREATED_ENABLED=0
trap 'rm -f "${TEMP_FILE}"' EXIT

cat >"${TEMP_FILE}" <<NGINX
# managed-by: agent-radar
server {
    listen 80;
    listen [::]:80;
    server_name radar.jayjp.com;

    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name radar.jayjp.com;

    ssl_certificate ${SSL_CERTIFICATE};
    ssl_certificate_key ${SSL_CERTIFICATE_KEY};
    ssl_protocols TLSv1.2 TLSv1.3;

    access_log /var/log/nginx/radar.jayjp.com.access.log;
    error_log /var/log/nginx/radar.jayjp.com.error.log;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
NGINX

if "${SUDO[@]}" test -f "${TARGET_FILE}"; then
  BACKUP_FILE="${TARGET_FILE}.bak.$(date -u +%Y%m%d%H%M%S)"
  "${SUDO[@]}" cp "${TARGET_FILE}" "${BACKUP_FILE}"
fi

"${SUDO[@]}" install -m 0644 "${TEMP_FILE}" "${TARGET_FILE}"
if [[ -n "${ENABLED_FILE}" && ! -e "${ENABLED_FILE}" ]]; then
  "${SUDO[@]}" ln -s "${TARGET_FILE}" "${ENABLED_FILE}"
  CREATED_ENABLED=1
fi

reload_nginx() {
  if command -v systemctl >/dev/null 2>&1 &&
    "${SUDO[@]}" systemctl is-active nginx >/dev/null 2>&1; then
    "${SUDO[@]}" systemctl reload nginx
  else
    "${SUDO[@]}" nginx -s reload
  fi
}

rollback_config() {
  echo "正在恢复修改前的 Radar Nginx 配置..." >&2
  if [[ -n "${BACKUP_FILE}" ]]; then
    "${SUDO[@]}" cp "${BACKUP_FILE}" "${TARGET_FILE}"
  else
    "${SUDO[@]}" rm -f "${TARGET_FILE}"
    if [[ "${CREATED_ENABLED}" == "1" && -n "${ENABLED_FILE}" ]]; then
      "${SUDO[@]}" rm -f "${ENABLED_FILE}"
    fi
  fi
  "${SUDO[@]}" nginx -t >/dev/null 2>&1 && reload_nginx >/dev/null 2>&1 || true
}

if ! "${SUDO[@]}" nginx -t; then
  rollback_config
  echo "错误：Nginx 校验失败，已恢复原配置。" >&2
  exit 1
fi

if ! reload_nginx; then
  rollback_config
  echo "错误：Nginx reload 失败，已恢复原配置。" >&2
  exit 1
fi

verify_https_identity() {
  local domain="$1"
  local path="$2"
  local identity="$3"
  local label="$4"
  local response_file
  local status="000"
  local attempt

  response_file="$(mktemp)"
  for attempt in {1..10}; do
    status="000"
    status="$(
      curl --fail --silent --max-time 8 --noproxy "*" \
        --output "${response_file}" --write-out "%{http_code}" \
        --resolve "${domain}:443:127.0.0.1" \
        "https://${domain}${path}" || true
    )"
    if [[ "${status}" == "200" ]] && grep -Fq "${identity}" "${response_file}"; then
      rm -f "${response_file}"
      echo "HTTPS 身份验证通过：${label}（${domain}）"
      return 0
    fi
    [[ "${attempt}" == "10" ]] || sleep 1
  done

  rm -f "${response_file}"
  echo "错误：${label} HTTPS 身份验证失败：${domain}${path}，最后 HTTP 状态 ${status}。" >&2
  return 1
}

if ! verify_https_identity "${DOMAIN}" "/api/health" '"service":"agent-radar"' \
  "Agent Radar" ||
  ! verify_https_identity "agent.jayjp.com" "/api/health" \
    '"service":"agent-engineering-coursebook"' "Agent 课程站" ||
  ! verify_https_identity "lona.jayjp.com" "/" "LoanRisk Coursebook" \
    "金融站"; then
  rollback_config
  echo "错误：HTTPS 身份回归失败，已恢复 Radar 修改；未修改 Agent 或金融站配置。" >&2
  exit 1
fi

echo "配置成功：https://${DOMAIN} -> http://127.0.0.1:${APP_PORT}"
echo "已验证：Radar、Agent、金融三个 HTTPS 域名均保持各自身份。"
