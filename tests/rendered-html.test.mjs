import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const projectRoot = new URL("../", import.meta.url);
const projectPath = fileURLToPath(projectRoot);
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
let serverProcess;
let baseUrl;
let serverOutput = "";
let dataDirectory;

const conceptFixture = {
  conceptSlug: "agent-harness",
  sourceName: "Agent Harness Official",
  sourceUrl: "https://example.com/official-agent-harness",
  secondSourceUrl: "https://example.com/official-agent-harness-telemetry",
};

async function createProductionSnapshotFixture() {
  dataDirectory = await mkdtemp(`${os.tmpdir()}/agent-radar-rendered-`);
  process.env.RADAR_DATA_DIR = dataDirectory;

  const { chooseSignalSlug } = await import("../radar/analyze.mjs");
  const {
    beginRun,
    finishRun,
    insertArticle,
    openDatabase,
    updateSourceHealth,
    upsertSourceCatalog,
  } = await import("../radar/database.mjs");
  const { buildSnapshot, writeSnapshotAtomic } = await import("../radar/snapshot.mjs");

  const database = openDatabase();
  try {
    const source = {
      id: "agent-harness-official",
      name: conceptFixture.sourceName,
      homepage: "https://example.com/agent-harness",
      class: "一手工程",
      priority: "P0",
      cadence: "4h",
      focus: "Agent Harness",
      independentGroup: "agent-harness-official",
    };
    upsertSourceCatalog(database, [source]);
    const signalSlug = chooseSignalSlug(
      { title: "Agent Harness adds durable approvals" },
      { conceptSlug: conceptFixture.conceptSlug, tags: ["agent-harness", "durable-execution"] },
      [],
    );
    const secondSignalSlug = chooseSignalSlug(
      { title: "Agent Harness exposes auditable tool telemetry" },
      { conceptSlug: conceptFixture.conceptSlug, tags: ["agent-harness", "observability"] },
      [],
    );
    assert.match(signalSlug, /^agent-harness-[a-f0-9]{10}$/);
    assert.match(secondSignalSlug, /^agent-harness-[a-f0-9]{10}$/);
    assert.notEqual(secondSignalSlug, signalSlug);
    const collectedAt = "2026-08-01T08:00:00.000Z";
    assert.equal(insertArticle(database, {
      url: conceptFixture.sourceUrl,
      sourceId: source.id,
      sourceName: source.name,
      sourceClass: source.class,
      independentGroup: source.independentGroup,
      originalTitle: "Agent Harness adds durable approvals",
      originalExcerpt: "Official evidence for approvals, checkpoints and telemetry.",
      contentText: "Official evidence for approvals, checkpoints and telemetry.",
      publishedAt: "2026-08-01T07:00:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "agent-harness-rendered-fixture",
      relevanceScore: 10,
      signalSlug,
      conceptSlug: conceptFixture.conceptSlug,
      title: "Agent Harness：把审批与恢复放进运行时",
      summary: "官方实现把审批、检查点和遥测纳入 Agent 运行时。",
      implication: "验证审批边界、恢复语义和运行证据，而不只看一次回答。",
      topic: "工程",
      stage: "Validated",
      accent: "engineering",
      tags: ["agent-harness", "durable-execution"],
      analysisMode: "deepseek",
    }), true);
    assert.equal(insertArticle(database, {
      url: conceptFixture.secondSourceUrl,
      sourceId: source.id,
      sourceName: source.name,
      sourceClass: source.class,
      independentGroup: source.independentGroup,
      originalTitle: "Agent Harness exposes auditable tool telemetry",
      originalExcerpt: "Official evidence for auditable tool-loop telemetry.",
      contentText: "Official evidence for auditable tool-loop telemetry.",
      publishedAt: "2026-08-01T07:30:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "agent-harness-telemetry-rendered-fixture",
      relevanceScore: 9,
      signalSlug: secondSignalSlug,
      conceptSlug: conceptFixture.conceptSlug,
      title: "Agent Harness：遥测让工具循环可审计",
      summary: "第二条中文分析说明工具调用、失败和审批轨迹如何被统一记录。",
      implication: "把每次工具调用的输入、输出、权限决策与错误原因写入可查询 trace。",
      topic: "工程",
      stage: "Validated",
      accent: "evidence",
      tags: ["agent-harness", "observability"],
      analysisMode: "deepseek",
    }), true);
    const runId = beginRun(database, "test", collectedAt, "deepseek");
    finishRun(database, runId, {
      finishedAt: collectedAt,
      status: "success",
      fetchedCount: 2,
      acceptedCount: 2,
      skippedCount: 0,
      errorCount: 0,
      analysisMode: "deepseek",
      message: "production-reachable rendered fixture",
    });
    updateSourceHealth(database, source, {
      attemptedAt: collectedAt,
      status: "success",
      error: null,
      itemCount: 2,
    });
    const snapshot = await buildSnapshot(database);
    const oldSnapshotSignal = snapshot.signals.find((item) => item.slug === secondSignalSlug);
    assert.ok(oldSnapshotSignal);
    delete oldSnapshotSignal.conceptSlug;
    oldSnapshotSignal.sources.push({ name: "旧快照重复引用", href: conceptFixture.sourceUrl });
    oldSnapshotSignal.sources.push({ name: "单条信号内重复引用", href: conceptFixture.secondSourceUrl });
    await writeSnapshotAtomic(snapshot);
  } finally {
    database.close();
  }
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

before(async () => {
  await createProductionSnapshotFixture();
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const serverEnv = {
    ...process.env,
    NODE_ENV: "production",
    RADAR_AI_PROVIDER: "rules",
    RADAR_DISABLE_AI: "1",
    RADAR_DISABLE_OPENAI: "",
  };
  delete serverEnv.OPENAI_API_KEY;
  delete serverEnv.DEEPSEEK_API_KEY;
  serverProcess = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectPath,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.on("data", (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.on("data", (chunk) => { serverOutput += chunk; });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready:\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js did not become ready:\n${serverOutput}`);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => serverProcess.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
  }
  delete process.env.RADAR_DATA_DIR;
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
});

async function render(path = "/") {
  return fetch(`${baseUrl}${path}`, { headers: { accept: "text/html" } });
}

test("server-renders the Agent Radar experience and social metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Agent Radar — AI Coding 技术情报<\/title>/i);
  assert.match(html, /今天，不追新闻/);
  assert.match(html, /LIVE INGESTION/);
  assert.doesNotMatch(html, /V1 真实来源回放|实时采集尚未启用/);
  assert.match(html, /href="\/today"/);
  assert.match(html, /href="\/concepts"/);
  assert.match(html, /href="\/models"/);
  assert.match(html, /name="theme-color" content="#f2f6f8"/);
  assert.match(html, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/og.png"/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("primary routes render with a heading and skip link", async () => {
  const routes = ["/today", "/signals", "/concepts", "/concepts/graph-engineering", "/graph", "/models", "/playbooks", "/sources", "/digests", "/search"];
  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /<h1[ >]/i, route);
    assert.match(html, /跳到主要内容/, route);
  }
});

test("model atlas compares coding, everyday capability and price with evidence instead of one leaderboard", async () => {
  const response = await render("/models");
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  const mainText = $("main").text().replace(/\s+/g, " ");

  assert.equal($("h1").first().text().trim(), "模型坐标");
  assert.match(mainText, /编程能力/);
  assert.match(mainText, /日常能力/);
  assert.match(mainText, /输入价/);
  assert.match(mainText, /输出价/);
  assert.match(mainText, /不是.{0,12}(?:单一|总)排行|不做.{0,12}(?:单一|总)排行/);
  assert.match(mainText, /证据口径/);
  assert.ok($("time[datetime]").length >= 1, "模型数据应暴露机器可读的核验时间");

  const comparison = $("table").first();
  assert.equal(comparison.length, 1, "可视化必须有精确表格作为无障碍兜底");
  assert.ok(comparison.find("caption").text().trim(), "模型对比表需要 caption");
  const headers = comparison.find("th").text().replace(/\s+/g, " ");
  for (const heading of ["模型", "编程能力", "日常能力", "输入价", "输出价", "证据"]) {
    assert.match(headers, new RegExp(heading));
  }
  assert.equal(comparison.find("tbody tr").length, 8, "当前核验目录必须完整展示八个模型");
  const modelNames = comparison.find("tbody tr th[scope='row'] b").toArray().map((node) => $(node).text().trim());
  assert.deepEqual(modelNames, [
    "GPT-5.6 Sol",
    "GPT-5.6 Terra",
    "Claude Fable 5",
    "Claude Opus 5",
    "Claude Sonnet 5",
    "Gemini 3.6 Flash",
    "DeepSeek V4 Pro",
    "DeepSeek V4 Flash",
  ]);
  assert.equal($(".model-verification time[datetime='2026-08-01T22:20:00+08:00']").length, 1, "页面级数据核验时间应唯一位于模型页头");
  assert.equal($(".model-note time[datetime='2026-08-01T22:20:00+08:00']").length, 8, "八个模型判断必须分别暴露可核验的评估时间");
  const modelNotes = $(".model-note");
  assert.equal(modelNotes.length, 8);
  modelNotes.each((_index, note) => {
    const noteText = $(note).text();
    assert.match(noteText, /编程档依据/);
    assert.match(noteText, /日常档依据/);
    assert.ok($(note).find("a.model-assessment-source[href^='https://']").length === 1, "每个模型判断必须显示证据链接");
    assert.ok($(note).find("time[datetime]").text().trim(), "每个模型判断必须显示评估时间");
  });

  const officialHosts = new Set(
    $("a[href^='https://']")
      .toArray()
      .map((node) => new URL($(node).attr("href")).hostname)
      .filter((host) => /(?:openai\.com|anthropic\.com|ai\.google\.dev|deepseek\.com)$/.test(host)),
  );
  assert.ok(officialHosts.size >= 3, "至少用三个厂商的官方页面支撑模型与价格信息");
  for (const host of ["developers.openai.com", "platform.claude.com", "ai.google.dev", "api-docs.deepseek.com"]) {
    assert.ok($("a[href^='https://']").toArray().some((node) => new URL($(node).attr("href")).hostname === host), `缺少 ${host} 官方链接`);
  }
  assert.ok($("[aria-label*='模型'][aria-label*='能力']").length >= 1, "能力图需要可访问名称");
  assert.equal($("a[href='/models'][aria-current='page']").length, 1, "模型导航必须精确标记当前页");
  assert.doesNotMatch(mainText, /RADAR ACTIVE|本站当前分析模型/, "没有任何运行时 API key 时，旧 DeepSeek 快照不能冒充当前 active provider");
});

test("concept detail binds a hashed live signal to its concept and renders the original source", async () => {
  const response = await render(`/concepts/${conceptFixture.conceptSlug}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  const mainText = $("main").text();

  assert.equal($("a[href='https://example.com/official-agent-harness']").length, 2, "同一原文属于两条信号时，两处都必须保留可点击引用");
  assert.equal($("a[href='https://example.com/official-agent-harness-telemetry']").length, 1);
  const relatedArticles = $(".related-signal-list article");
  assert.equal(relatedArticles.length, 2);
  const approvalArticle = relatedArticles.filter((_index, article) => $(article).text().includes("把审批与恢复放进运行时"));
  const telemetryArticle = relatedArticles.filter((_index, article) => $(article).text().includes("遥测让工具循环可审计"));
  assert.equal(approvalArticle.find(`a[href='${conceptFixture.sourceUrl}']`).length, 1, "第一条中文结论必须就地绑定其原文");
  assert.equal(telemetryArticle.find(`a[href='${conceptFixture.secondSourceUrl}']`).length, 1, "第二条中文结论必须就地绑定其原文");
  assert.equal(telemetryArticle.find(`a[href='${conceptFixture.sourceUrl}']`).length, 1, "跨信号重复 URL 仍必须在第二条信号内可点击");
  assert.doesNotMatch(telemetryArticle.text(), /同页已引用/);
  for (const expected of [
    "把审批与恢复放进运行时",
    "官方实现把审批、检查点和遥测纳入 Agent 运行时",
    "验证审批边界、恢复语义和运行证据",
    "遥测让工具循环可审计",
    "第二条中文分析说明工具调用、失败和审批轨迹如何被统一记录",
    "把每次工具调用的输入、输出、权限决策与错误原因写入可查询 trace",
  ]) {
    assert.match(mainText, new RegExp(expected));
  }
  assert.doesNotMatch(mainText, /只有定义回放，等待加入绑定证据/);
  assert.doesNotMatch(mainText, /LABEL NOVELTY|MECHANISM NOVELTY|ADOPTION NOVELTY/);
  assert.doesNotMatch(mainText, /长任务、多阶段状态、并行执行|一次工具调用即可完成、没有持久状态/);
});

test("concept graph renders relations in one responsive SVG coordinate system", async () => {
  const response = await render("/graph");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /class="concept-graph"/);
  assert.match(html, /data-graph-node=/);
  assert.match(html, /data-graph-edge=/);
  assert.doesNotMatch(html, /graph-line line-a|node-manager/);
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

test("health endpoint identifies this service", async () => {
  const response = await render("/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: "agent-radar", status: "ok" });
});

test("public status endpoint exposes ingestion health without a login", async () => {
  const response = await render("/api/status");
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.service, "agent-radar");
  assert.ok(["live", "seed"].includes(status.mode));
  assert.equal(typeof status.sourceCount, "number");
  assert.ok(Array.isArray(status.sources));
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});
