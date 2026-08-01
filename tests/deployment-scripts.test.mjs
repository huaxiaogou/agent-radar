import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const nginxScriptUrl = new URL("../scripts/configure-nginx.sh", import.meta.url);

test("Nginx deployment configures HTTPS and protects sibling sites", async () => {
  const source = await readFile(nginxScriptUrl, "utf8");

  assert.match(source, /listen 443 ssl;/u);
  assert.match(source, /return 301 https:\/\/\\\$host\\\$request_uri;/u);
  assert.match(source, /openssl x509[\s\S]*-checkhost "\$\{DOMAIN\}"/u);
  assert.match(source, /key_matches_certificate/u);
  assert.match(source, /127\.0\.0\.1:3000/u);
  assert.match(source, /LoanRisk Coursebook/u);
  assert.match(source, /127\.0\.0\.1:3001\/api\/health/u);
  assert.match(source, /127\.0\.0\.1:\$\{APP_PORT\}\/api\/health/u);
  assert.match(source, /"service":"agent-engineering-coursebook"/u);
  assert.match(source, /"service":"agent-radar"/u);
  assert.match(source, /rollback_config/u);
  assert.match(source, /for attempt in \{1\.\.10\}/u);
  assert.match(source, /最后 HTTP 状态/u);
  assert.match(
    source,
    /verify_https_identity "agent\.jayjp\.com" "\/api\/health"[\s\S]*"Agent 课程站"/u,
  );
  assert.match(
    source,
    /verify_https_identity "lona\.jayjp\.com" "\/"[\s\S]*"金融站"/u,
  );
});
