import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Agent Radar experience and social metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Agent Radar — AI Coding 技术情报<\/title>/i);
  assert.match(html, /今天，不追新闻/);
  assert.match(html, /V1 真实来源回放/);
  assert.match(html, /href="\/today"/);
  assert.match(html, /href="\/concepts"/);
  assert.match(html, /name="theme-color" content="#f2f6f8"/);
  assert.match(html, /property="og:image" content="http:\/\/localhost(?::3000)?\/og.png"/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("primary routes render with a heading and skip link", async () => {
  const routes = ["/today", "/signals", "/concepts", "/concepts/graph-engineering", "/graph", "/playbooks", "/sources", "/digests", "/search"];
  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /<h1[ >]/i, route);
    assert.match(html, /跳到主要内容/, route);
  }
});

test("starter preview is removed and project assets are present", async () => {
  const [packageJson, layout] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../design-system/agent-radar/MASTER.md", import.meta.url));
  await access(projectRoot);
});
