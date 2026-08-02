import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const discussionFixture = {
  chineseTitle: "多智能体编排在真实代码库里如何验收？",
  chineseUrl: "https://github.com/example-cn/agent-coding/issues/88",
  englishTitle: "How we debug long-running agent harnesses",
  englishUrl: "https://news.ycombinator.com/item?id=424242",
};

const candidateConceptFixture = {
  name: "Agent Reliability Engineering",
  communityUrl: "https://github.com/example-cn/agent-coding/issues/89",
  practitionerUrl: "https://practitioner.example.com/agent-reliability-engineering",
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
    replaceModelLandscape,
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
    const discussionSources = [
      {
        id: "rendered-chinese-community",
        name: "中文 Agent 社区",
        homepage: "https://github.com/example-cn/agent-coding/issues",
        class: "中文社区",
        priority: "P1",
        cadence: "4h",
        focus: "多智能体编排 · AI Coding",
        independentGroup: "rendered-chinese-community",
      },
      {
        id: "rendered-english-community",
        name: "Hacker News",
        homepage: "https://news.ycombinator.com/",
        class: "英文社区",
        priority: "P1",
        cadence: "4h",
        focus: "Agent Harness · Durable execution",
        independentGroup: "rendered-english-community",
      },
    ];
    const candidatePractitionerSource = {
      id: "rendered-candidate-practitioner",
      name: "Independent Agent Engineer",
      homepage: "https://practitioner.example.com",
      class: "实践者",
      priority: "P1",
      cadence: "8h",
      focus: candidateConceptFixture.name,
      independentGroup: "rendered-candidate-practitioner",
    };
    upsertSourceCatalog(database, [source, ...discussionSources, candidatePractitionerSource]);
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
      summary: "官方实现把审批、检查点和遥测纳入 Agent 运行时…",
      implication: "验证审批边界、恢复语义和运行证据，而不只看一次回答。",
      topic: "工程",
      stage: "Validated",
      accent: "engineering",
      tags: ["agent-harness", "durable-execution"],
      analysisMode: "deepseek",
    }), true);
    assert.equal(insertArticle(database, {
      url: discussionFixture.chineseUrl,
      sourceId: discussionSources[0].id,
      sourceName: discussionSources[0].name,
      sourceClass: discussionSources[0].class,
      independentGroup: discussionSources[0].independentGroup,
      originalTitle: discussionFixture.chineseTitle,
      originalExcerpt: "中文开发者讨论多智能体任务拆分、验收和失败恢复。",
      contentText: "中文开发者讨论多智能体任务拆分、验收和失败恢复。",
      publishedAt: "2026-08-01T06:30:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "rendered-chinese-discussion",
      relevanceScore: 10,
      signalSlug: chooseSignalSlug(
        { title: discussionFixture.chineseTitle },
        { conceptSlug: "multi-agent-orchestration", tags: ["multi-agent-orchestration"] },
        [],
      ),
      conceptSlug: "multi-agent-orchestration",
      title: "中文社区正在验证多智能体编排的验收边界",
      summary: "讨论聚焦真实代码库中的角色拆分、验收责任和失败恢复。",
      implication: "社区讨论只能形成候选脉冲，需要官方或独立实践证据交叉验证。",
      topic: "工程",
      stage: "Spark",
      accent: "signal",
      tags: ["multi-agent-orchestration"],
      analysisMode: "deepseek",
    }), true);
    assert.equal(insertArticle(database, {
      url: discussionFixture.englishUrl,
      sourceId: discussionSources[1].id,
      sourceName: discussionSources[1].name,
      sourceClass: discussionSources[1].class,
      independentGroup: discussionSources[1].independentGroup,
      originalTitle: discussionFixture.englishTitle,
      originalExcerpt: "An English discussion about checkpoints and traces for long-running coding agents.",
      contentText: "An English discussion about checkpoints and traces for long-running coding agents.",
      publishedAt: "2026-08-01T06:45:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "rendered-english-discussion",
      relevanceScore: 9,
      signalSlug: chooseSignalSlug(
        { title: discussionFixture.englishTitle },
        { conceptSlug: "coding-agent", tags: ["coding-agent", "agent-harness"] },
        [],
      ),
      conceptSlug: "coding-agent",
      title: "英文社区讨论长任务 Agent Harness 的调试方法",
      summary: "讨论聚焦检查点、运行 trace 和长任务失败定位。",
      implication: "把讨论沉淀为可重复故障注入和恢复验证，再判断是否具有生产价值。",
      topic: "工程",
      stage: "Spark",
      accent: "signal",
      tags: ["coding-agent", "agent-harness"],
      analysisMode: "deepseek",
    }), true);
    const candidateSignalSlug = "agent-reliability-engineering-candidate";
    assert.equal(insertArticle(database, {
      url: candidateConceptFixture.communityUrl,
      sourceId: discussionSources[0].id,
      sourceName: discussionSources[0].name,
      sourceClass: discussionSources[0].class,
      independentGroup: discussionSources[0].independentGroup,
      sourceLayer: "community",
      sourceLanguage: "zh",
      originalTitle: "社区提出 Agent Reliability Engineering 这一候选名称",
      originalExcerpt: "社区讨论长任务 Agent 的恢复、验收和可靠性工程。",
      contentText: "社区讨论长任务 Agent 的恢复、验收和可靠性工程。",
      publishedAt: "2026-08-01T06:50:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "rendered-candidate-community",
      relevanceScore: 9,
      signalSlug: candidateSignalSlug,
      conceptSlug: "coding-agent",
      title: "Agent Reliability Engineering 成为待溯源概念候选",
      summary: "模型从社区讨论中抽取这一名称，但尚未证明它已形成稳定定义。",
      implication: "保留原文和证据层级，等待独立工程材料交叉验证。",
      topic: "概念",
      stage: "Spark",
      accent: "signal",
      tags: ["coding-agent", "reliability"],
      analysisMode: "deepseek",
      publishDecision: "publish",
      editorialScore: 68,
      aiRelevanceScore: 76,
      noveltyScore: 78,
      evidenceScore: 50,
      eventKey: "agent-reliability-engineering:origin",
      candidateConcept: candidateConceptFixture.name,
    }), true);
    assert.equal(insertArticle(database, {
      url: candidateConceptFixture.practitionerUrl,
      sourceId: candidatePractitionerSource.id,
      sourceName: candidatePractitionerSource.name,
      sourceClass: candidatePractitionerSource.class,
      independentGroup: candidatePractitionerSource.independentGroup,
      sourceLayer: "practitioner",
      sourceLanguage: "en",
      originalTitle: "A field note on Agent Reliability Engineering",
      originalExcerpt: "An independent engineering note on recovery and acceptance evidence.",
      contentText: "An independent engineering note on recovery and acceptance evidence.",
      publishedAt: "2026-08-01T06:55:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "rendered-candidate-practitioner",
      relevanceScore: 10,
      signalSlug: candidateSignalSlug,
      conceptSlug: "coding-agent",
      title: "独立实践者补充 Agent Reliability Engineering 证据",
      summary: "实践文章给出恢复与验收方法，但候选名称仍需继续溯源。",
      implication: "把工程观察作为较高层证据展示，不自动晋升正式概念。",
      topic: "概念",
      stage: "Spark",
      accent: "evidence",
      tags: ["coding-agent", "reliability"],
      analysisMode: "deepseek",
      publishDecision: "publish",
      editorialScore: 74,
      aiRelevanceScore: 82,
      noveltyScore: 76,
      evidenceScore: 70,
      eventKey: "agent-reliability-engineering:origin",
      candidateConcept: candidateConceptFixture.name,
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
      fetchedCount: 6,
      acceptedCount: 6,
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
    for (const discussionSource of discussionSources) {
      updateSourceHealth(database, discussionSource, {
        attemptedAt: collectedAt,
        status: "success",
        error: null,
        itemCount: 1,
      });
    }
    updateSourceHealth(database, candidatePractitionerSource, {
      attemptedAt: collectedAt,
      status: "success",
      error: null,
      itemCount: 1,
    });
    replaceModelLandscape(database, {
      sourceName: "Artificial Analysis",
      sourceUrl: "https://artificialanalysis.ai/models",
      methodologyUrl: "https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-1/",
      attemptedAt: collectedAt,
      models: Array.from({ length: 48 }, (_, index) => ({
        id: `rendered-model-${index}`,
        slug: `rendered-model-${index}`,
        name: `Rendered Model ${index} ${index % 3 === 0 ? "(high)" : ""}`.trim(),
        shortName: `Rendered Model ${index}`,
        providerName: ["OpenAI", "Anthropic", "Google", "DeepSeek", "Alibaba", "Meta", "Mistral", "Amazon", "NVIDIA", "Kimi"][index % 10],
        providerSlug: ["openai", "anthropic", "google", "deepseek", "alibaba", "meta", "mistral", "amazon", "nvidia", "kimi"][index % 10],
        providerColor: null,
        codingIndex: 22 + index,
        intelligenceIndex: 12 + index * .8,
        costPerTask: .008 + index * .035,
        isReasoning: index % 2 === 0,
        isOpenWeights: index % 3 === 0,
        releaseDate: "2026-08-01",
        contextWindowTokens: 128000,
        href: `https://artificialanalysis.ai/models/rendered-model-${index}`,
      })),
    });
    const snapshot = await buildSnapshot(database);
    const oldSnapshotSignal = snapshot.signals.find((item) => item.slug === secondSignalSlug);
    assert.ok(oldSnapshotSignal);
    const representativeSource = oldSnapshotSignal.sources.find((item) => item.href === conceptFixture.secondSourceUrl);
    assert.ok(representativeSource, "fixture 必须找到生成遥测信号文案的代表原文");
    oldSnapshotSignal.representativeSource = { ...representativeSource };
    delete oldSnapshotSignal.conceptSlug;
    oldSnapshotSignal.sources.unshift({
      name: "证据排序优先来源",
      href: conceptFixture.sourceUrl,
      layer: "official",
      language: "en",
      originalTitle: "Agent Harness adds durable approvals",
      publishedAt: "2026-08-01T07:00:00.000Z",
    });
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
  assert.match(html, /href="\/discussions"/);
  assert.match(html, /name="theme-color" content="#f2f6f8"/);
  assert.match(html, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/og.png"/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("primary routes render with a heading and skip link", async () => {
  const routes = ["/today", "/signals", "/concepts", "/concepts/graph-engineering", "/graph", "/models", "/discussions", "/playbooks", "/sources", "/digests", "/search"];
  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /<h1[ >]/i, route);
    assert.match(html, /跳到主要内容/, route);
  }
});

test("signal summaries expose an adjacent accessible analysis or original-source action", async () => {
  const response = await render("/signals");
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  const cards = $(".signal-card");
  assert.ok(cards.length >= 1, "信号页 fixture 必须渲染至少一张真实 SignalCard");

  let originalSourceActionCount = 0;
  cards.each((_index, cardNode) => {
    const card = $(cardNode);
    const summary = card.find(".signal-summary").first();
    assert.equal(summary.length, 1, "每张信号卡必须有唯一摘要");
    const actions = summary.next();
    assert.equal(
      actions.hasClass("signal-summary-actions"),
      true,
      `摘要后必须紧邻明确操作，不能先经过证据图或其他内容：${card.find("h2").text().trim()}`,
    );

    const links = actions.find("a[href]");
    const internalAnalysisLinks = links.filter((_linkIndex, link) => (
      $(link).text().replace(/\s+/g, " ").trim().startsWith("查看完整分析")
    ));
    const originalSourceLinks = links.filter((_linkIndex, link) => (
      $(link).text().replace(/\s+/g, " ").trim().startsWith("阅读原文")
    ));
    assert.ok(
      internalAnalysisLinks.length + originalSourceLinks.length >= 1,
      "邻近操作必须明确命名为“查看完整分析”或“阅读原文”",
    );

    internalAnalysisLinks.each((_linkIndex, link) => {
      const href = $(link).attr("href") || "";
      assert.match(href, /^\/concepts\/[^/?#]+$/, "站内完整分析必须使用真实 concept 路由");
      assert.notEqual($(link).attr("target"), "_blank", "站内分析不得无故打开新窗口");
    });

    const cardSourceHrefs = new Set(
      card.find(".source-links a[href]").toArray().map((link) => $(link).attr("href")),
    );
    originalSourceLinks.each((_linkIndex, link) => {
      originalSourceActionCount += 1;
      const href = $(link).attr("href") || "";
      assert.ok(cardSourceHrefs.has(href), "“阅读原文”必须复用该信号真实来源 href，不能生成占位链接");
      assert.equal($(link).attr("target"), "_blank", "外部原文应明确在新窗口打开");
      assert.match($(link).attr("rel") || "", /\b(?:noopener|noreferrer)\b/, "新窗口原文链接必须提供安全 rel");
    });
  });

  assert.ok(originalSourceActionCount >= 1, "信号页至少应提供一个邻近的真实原文入口");
  const truncatedCard = cards.filter((_index, card) => $(card).text().includes("把审批与恢复放进运行时")).first();
  assert.match(truncatedCard.find(".signal-summary").text().trim(), /(?:…|\.\.\.)$/, "fixture 必须覆盖被截断摘要场景");
  assert.equal(truncatedCard.find(".signal-summary").next().hasClass("signal-summary-actions"), true, "被截断摘要尤其不能成为死路");
  const telemetryCard = cards.filter((_index, card) => $(card).text().includes("遥测让工具循环可审计")).first();
  assert.equal(
    telemetryCard.find(".signal-summary-actions a").filter((_index, link) => $(link).text().includes("阅读原文")).attr("href"),
    conceptFixture.secondSourceUrl,
    "邻近“阅读原文”必须使用 representativeSource.href，不能误用证据排序第一项 sources[0]",
  );
});

test("signal cards keep exactly one internal concept analysis entry", async () => {
  const response = await render("/signals");
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const cards = $(".signal-card");
  assert.ok(cards.length >= 1);

  cards.each((_index, cardNode) => {
    const card = $(cardNode);
    const summaryAnalysisLink = card.find(".signal-summary-actions a[href^='/concepts/']");
    assert.equal(summaryAnalysisLink.length, 1, "摘要邻近区必须保留唯一“查看完整分析”入口");
    const href = summaryAnalysisLink.attr("href");
    assert.equal(card.find(`a[href='${href}']`).length, 1, "每张卡同一 concept 路由只能出现一次");
    assert.equal(card.find("footer a.detail-link").length, 0, "页脚不得再重复渲染“打开分析”");
  });
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

  const landscape = $(".model-landscape-plot");
  assert.equal(landscape.length, 1, "模型页必须提供能力—成本全景图");
  assert.match(landscape.attr("aria-labelledby") || "", /model-landscape-title/);
  const landscapeText = $(".model-landscape-figure").text().replace(/\s+/g, " ");
  for (const term of ["单任务成本", "对数刻度", "编程指数", "通用智能指数"]) assert.match(landscapeText, new RegExp(term));
  assert.equal(landscape.find("[data-model-id]").length, 48, "全景图必须完整绘制定时采集的所有动态模型");
  assert.equal(landscape.find("[data-model-id][role='img'][aria-label]").length, 48, "每个模型点必须有完整的无障碍说明");
  assert.equal($(".model-landscape-picker select[name='landscape-model']").length, 1, "重叠圆点必须提供全量模型定位器");
  assert.equal($(".model-landscape-picker option").length, 49, "定位器必须覆盖全部动态模型并保留空选项");
  assert.ok(landscape.find(".model-market-labels text").length <= 12, "常驻标签必须限制密度，完整数据由交互与表格承载");
  assert.ok(landscape.find(".model-market-labels text").length > 0, "全景图需要保留关键模型的常驻标签");
  assert.equal(landscape.find(".model-market-label-name").length, landscape.find(".model-market-label-value").length, "关键模型名称必须和坐标值成对呈现");
  assert.ok(landscape.find(".model-market-label-value").length > 0, "图内必须直接显示关键模型的编程、通用和成本坐标");
  assert.ok($(".model-landscape-key span").length >= 10, "厂商图例必须覆盖动态清单中的主要厂商");
  assert.equal($(".model-market-data tbody tr").length, 48, "动态 SVG 必须有全量精确数据表作为无障碍兜底");
  assert.equal(landscape.find("marker, [marker-end], [stroke-dasharray]").length, 0, "整体视图不得保留 DeepSeek 竞争范围虚线或箭头");
  assert.doesNotMatch($(".model-landscape-figure").text(), /竞争范围|本站分析模型/, "全景图不能特殊突出 DeepSeek Flash");

  const comparison = $("table.model-table").first();
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
  assert.doesNotMatch(mainText, /O·SOL|O·TER|A·FAB|A·OPU|A·SON|G·FLA|D·PRO|D·FLS/, "可视图必须展示完整模型名，不能要求读者翻译内部代号");
  assert.match(mainText, /能力.{0,8}价格.{0,12}核验日期/);
  assert.match(mainText, /社区讨论脉冲.{0,12}定时采集更新/);
});

test("discussions page exposes bilingual community evidence layers and original links", async () => {
  const response = await render("/discussions");
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  const mainText = $("main").text().replace(/\s+/g, " ");

  assert.match($("h1").first().text(), /社区讨论|Discussions/i);
  assert.equal($("a[href='/discussions'][aria-current='page']").length, 1);
  const chinese = $("[data-discussion-language='zh'][data-source-layer='community']");
  const english = $("[data-discussion-language='en'][data-source-layer='community']");
  assert.ok(chinese.length >= 1, "必须展示中文社区讨论");
  assert.ok(english.length >= 1, "必须展示英文社区讨论");
  assert.match(mainText, new RegExp(discussionFixture.chineseTitle));
  assert.match(mainText, new RegExp(discussionFixture.englishTitle));
  assert.equal(chinese.find(`a[href='${discussionFixture.chineseUrl}']`).length, 1);
  assert.equal(english.find(`a[href='${discussionFixture.englishUrl}']`).length, 1);
  assert.match(mainText, /官方|实践者|社区/);
});

test("concepts page renders traceable candidates separately from the established concept catalog", async () => {
  const response = await render("/concepts");
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  const candidateSection = $("main section").filter((_index, section) => /待溯源概念候选/.test($(section).text())).first();

  assert.equal(candidateSection.length, 1, "概念页必须有独立的“待溯源概念候选”区");
  assert.match(candidateSection.text(), new RegExp(candidateConceptFixture.name));
  assert.equal(candidateSection.find(`a[href='${candidateConceptFixture.communityUrl}']`).length, 1);
  assert.equal(candidateSection.find(`a[href='${candidateConceptFixture.practitionerUrl}']`).length, 1);
  assert.doesNotMatch(
    $(".concept-grid").text(),
    new RegExp(candidateConceptFixture.name),
    "候选不得伪装成已建立概念卡片",
  );
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
  assert.equal(status.modelLandscape.itemCount, 48);
  assert.equal(status.modelLandscape.source, "Artificial Analysis");
  assert.equal(typeof status.modelLandscape.stale, "boolean");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("public status endpoint normalizes legacy snapshots that predate provider and run-mode fields", async () => {
  const snapshotPath = `${dataDirectory}/radar-snapshot.json`;
  const legacySnapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  assert.equal(legacySnapshot.status.analysisMode, "deepseek", "fixture 必须保留旧版可迁移的 analysisMode 权威值");
  delete legacySnapshot.status.configuredProvider;
  delete legacySnapshot.status.runAnalysisMode;
  await writeFile(snapshotPath, `${JSON.stringify(legacySnapshot, null, 2)}\n`, "utf8");

  const response = await render("/api/status");
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.configuredProvider, "rules", "当前服务已禁用 AI，旧快照的历史 DeepSeek 语料口径不得冒充当前 configuredProvider");
  assert.equal(status.runAnalysisMode, "none", "旧快照没有可验证的本轮执行记录，不能把历史文章口径冒充 runAnalysisMode");
});

test("missing corrupt or seed snapshots never expose curated fallback signals in production", async () => {
  const snapshotPath = `${dataDirectory}/radar-snapshot.json`;
  const liveSnapshotText = await readFile(snapshotPath, "utf8");
  const curatedFallbackTitle = "Graph Engineering：把 Agent 工作流变成可审计的执行结构";
  const explicitSeedTitle = "绝不能公开的 CURATED SEED 信号";
  const seedSnapshot = JSON.parse(liveSnapshotText);
  seedSnapshot.status = {
    ...seedSnapshot.status,
    mode: "seed",
    runStatus: "never",
    analysisMode: "curated",
    signalCount: 1,
    stale: true,
  };
  seedSnapshot.signals = [{ ...seedSnapshot.signals[0], title: explicitSeedTitle, analysisMode: "curated" }];
  const scenarios = [
    {
      name: "missing",
      prepare: () => rm(snapshotPath, { force: true }),
    },
    {
      name: "corrupt",
      prepare: () => writeFile(snapshotPath, "{corrupt-json", "utf8"),
    },
    {
      name: "seed",
      prepare: () => writeFile(snapshotPath, `${JSON.stringify(seedSnapshot)}\n`, "utf8"),
    },
  ];

  try {
    for (const scenario of scenarios) {
      await scenario.prepare();
      const todayResponse = await render("/today");
      assert.equal(todayResponse.status, 200, scenario.name);
      const html = await todayResponse.text();
      assert.doesNotMatch(html, new RegExp(curatedFallbackTitle), `${scenario.name} 快照不能回退公开内置 curated signals`);
      assert.doesNotMatch(html, new RegExp(explicitSeedTitle), `${scenario.name} 快照不能公开 seed signals`);
      assert.match(load(html).text(), /0\s*条有效信号/, `${scenario.name} 快照必须以空公开信号失败关闭`);

      const statusResponse = await render("/api/status");
      assert.equal(statusResponse.status, 200, scenario.name);
      const status = await statusResponse.json();
      assert.equal(status.signalCount, 0, `${scenario.name} 数据层不得报告 curated signalCount`);
      assert.equal(status.stale, true, `${scenario.name} 数据层必须标记 stale`);

      await writeFile(snapshotPath, liveSnapshotText, "utf8");
    }
  } finally {
    await writeFile(snapshotPath, liveSnapshotText, "utf8");
  }
});
