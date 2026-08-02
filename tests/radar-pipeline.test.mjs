import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import {
  analyzeItem,
  chooseSignalSlug,
  deepSeekAnalysis,
  resolveAnalysisProvider,
  ruleAnalysis,
  scoreRelevance,
} from "../radar/analyze.mjs";
import { canonicalizeUrl, cleanText } from "../radar/fetch.mjs";

let dataDirectory;

before(async () => {
  dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-test-"));
  process.env.RADAR_DATA_DIR = dataDirectory;
});

after(async () => {
  delete process.env.RADAR_DATA_DIR;
  await rm(dataDirectory, { recursive: true, force: true });
});

const PIPELINE_TEST_ENV_KEYS = [
  "RADAR_AI_PROVIDER", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "RADAR_DISABLE_AI", "RADAR_DISABLE_OPENAI",
  "RADAR_MAX_NEW_ITEMS", "RADAR_MAX_AI_ITEMS", "RADAR_SOURCE_CONCURRENCY", "RADAR_FETCH_CONCURRENCY",
  "RADAR_ANALYSIS_CONCURRENCY", "RADAR_MAX_ITEM_AGE_DAYS", "RADAR_SNAPSHOT_ARTICLES",
];

function configurePipelineTestEnvironment(isolatedDataDirectory, overrides = {}) {
  const previous = Object.fromEntries(PIPELINE_TEST_ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  process.env.RADAR_AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  delete process.env.OPENAI_API_KEY;
  delete process.env.RADAR_DISABLE_AI;
  delete process.env.RADAR_DISABLE_OPENAI;
  process.env.RADAR_MAX_NEW_ITEMS = "4";
  process.env.RADAR_MAX_AI_ITEMS = "4";
  process.env.RADAR_SOURCE_CONCURRENCY = "40";
  process.env.RADAR_FETCH_CONCURRENCY = "2";
  process.env.RADAR_ANALYSIS_CONCURRENCY = "1";
  process.env.RADAR_MAX_ITEM_AGE_DAYS = "365";
  for (const [key, value] of Object.entries(overrides)) process.env[key] = String(value);
  return () => {
    for (const key of PIPELINE_TEST_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function isolatedCatalogFetch({ feedUrl, feedBody, articleUrl, articleHtml, analyses }) {
  const emptyFeed = "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>Empty Radar Feed</title></channel></rss>";
  const state = { deepSeekCalls: 0 };
  const deepSeekFetchImpl = async (input) => {
    const url = String(input);
    if (!url.includes("api.deepseek.com") || !url.endsWith("/chat/completions")) throw new Error(`DeepSeek mock 不允许来源抓取：${url}`);
    const analysis = analyses[Math.min(state.deepSeekCalls, analyses.length - 1)];
    state.deepSeekCalls += 1;
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url === articleUrl) {
      return new Response(articleHtml, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url === feedUrl) {
      return new Response(feedBody, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    if (url.includes("hn.algolia.com")) {
      return new Response(JSON.stringify({ hits: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("bsky.app") || url.includes("bluesky")) {
      return new Response(JSON.stringify({ posts: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (/\.xml(?:\?|$)|\.rss(?:\?|$)|\.atom(?:\?|$)|\/feed\/?(?:\?|$)|\/rss\.xml(?:\?|$)/i.test(url)) {
      return new Response(emptyFeed, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    return new Response("<html><body><main>No candidate articles</main></body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
  return { fetchImpl, deepSeekFetchImpl, state };
}

function trustedFetchOptions(fetchImpl) {
  return {
    fetchImpl,
    resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
    createDispatcher: () => ({ close: async () => {} }),
  };
}

function deepSeekPublishAnalysis(title, candidateConcept = "") {
  return {
    title,
    summary: "正文提供了与 Agent 工程直接相关的机制、工具调用和恢复验证证据。",
    implication: "应保留原文，并在真实代码库中验证检查点、工具权限和失败恢复。",
    topic: "工程",
    conceptSlug: "agent-harness",
    stage: "Emerging",
    accent: "engineering",
    tags: ["agent-harness", "durable-execution"],
    publishDecision: "publish",
    editorialScore: 82,
    relevanceScore: 90,
    noveltyScore: 76,
    evidenceScore: 50,
    eventKey: "agent-harness:durable-recovery-update",
    candidateConcept,
  };
}

function englishPublishAnalysis(title = "Agent Harness adds durable recovery") {
  return {
    title,
    summary: "The official source documents checkpoint recovery and auditable tool execution for long-running coding agents.",
    implication: "Engineering teams should validate restart safety, tool permissions, and replay behavior before production use.",
    topic: "工程",
    conceptSlug: "agent-harness",
    stage: "Emerging",
    accent: "engineering",
    tags: ["agent-harness", "durable-execution"],
    publishDecision: "publish",
    editorialScore: 82,
    relevanceScore: 90,
    noveltyScore: 76,
    evidenceScore: 88,
    eventKey: "agent-harness:durable-recovery-update",
    candidateConcept: "",
  };
}

function japanesePublishAnalysis() {
  return {
    ...englishPublishAnalysis(),
    title: "Claude Code が復旧可能なタスク実行を追加",
    summary: "公式チームは長時間のコードエージェント向けに、チェックポイント、承認、ツール呼び出しの再実行を追加したと説明しています。",
    implication: "導入前に中断からの復旧、権限境界、ツール呼び出しの安全性を実際のリポジトリで検証する必要があります。",
  };
}

function englishDominantPublishAnalysis() {
  return {
    ...englishPublishAnalysis(),
    title: "Claude Code v2.1 release 增加恢复",
    summary: "This release adds checkpoints, approvals, and tool-call replay. 工程验证需要确认",
    implication: "Teams should validate restart safety and permission boundaries. 团队需要持续验证",
  };
}

function koreanDominantPublishAnalysis() {
  return {
    ...englishPublishAnalysis(),
    title: "복구 가능한 작업 실행 기능 추가 更新",
    summary: "공식 팀은 체크포인트와 승인 및 도구 호출 복구 기능을 추가했다고 설명했습니다. 工程验证需要确认",
    implication: "도입 전에 실제 저장소에서 재시작 안전성과 권한 경계를 검증해야 합니다. 团队需要持续验证",
  };
}

function cyrillicDominantPublishAnalysis() {
  return {
    ...englishPublishAnalysis(),
    title: "Добавлено восстановление длительных задач 更新",
    summary: "Официальная команда описала контрольные точки, подтверждения и повторный запуск инструментов. 工程验证需要确认",
    implication: "Перед внедрением необходимо проверить восстановление и границы разрешений в настоящем репозитории. 团队需要持续验证",
  };
}

function arabicDominantPublishAnalysis() {
  return {
    ...englishPublishAnalysis(),
    title: "إضافة استعادة المهام الطويلة 更新",
    summary: "يشرح الفريق الرسمي نقاط التحقق والموافقات وإعادة تشغيل استدعاءات الأدوات بعد الفشل. 工程验证需要确认",
    implication: "يجب اختبار أمان الاستئناف وحدود الصلاحيات في مستودع حقيقي قبل الاستخدام. 团队需要持续验证",
  };
}

function providerTestItem() {
  return {
    title: "Agent Harness adds durable checkpoint recovery",
    excerpt: "The official release documents tool calls, approvals, checkpoints, and recovery for coding agents.",
    contentText: "The runtime persists checkpoints and replays failed tool calls with explicit approval evidence.",
    sourceName: "Official Engineering",
    sourceClass: "一手工程",
    sourceLayer: "official",
    sourceLanguage: "en",
    relevanceScore: 10,
    url: "https://example.com/agent-harness-recovery",
    publishedAt: "2026-08-02T00:00:00.000Z",
  };
}

function openAIResponse(analysis) {
  return new Response(JSON.stringify({
    status: "completed",
    output: [{ type: "message", content: [{
      type: "output_text",
      text: JSON.stringify(analysis),
    }] }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function providerRawResponse(provider, content) {
  if (provider === "openai") {
    return new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: content }] }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("canonical URLs remove trackers and reject local targets", () => {
  assert.equal(
    canonicalizeUrl("/post?utm_source=test&id=7#section", "https://example.com/blog/"),
    "https://example.com/post?id=7",
  );
  assert.equal(canonicalizeUrl("http://127.0.0.1/private", "https://example.com"), null);
  assert.equal(cleanText("<p>Agent <b>Harness</b></p>"), "Agent Harness");
});

test("public fetch target validation rejects credentials, insecure schemes and local or metadata networks", async () => {
  const { validatePublicTarget } = await import("../radar/fetch.mjs");
  assert.equal(typeof validatePublicTarget, "function", "抓取链必须导出可独立验证的公网目标护栏");
  const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }];

  for (const target of [
    "http://example.com/article",
    "https://user:secret@example.com/article",
    "https://localhost/private",
    "https://127.0.0.1/private",
    "https://10.0.0.1/private",
    "https://172.16.0.1/private",
    "https://192.168.1.1/private",
    "https://192.0.0.1/private",
    "https://192.0.2.1/private",
    "https://169.254.169.254/latest/meta-data",
    "https://100.100.100.200/latest/meta-data",
    "https://[::1]/private",
    "https://[fc00::1]/private",
    "https://[fe80::1]/private",
    "https://[::ffff:7f00:1]/private",
    "https://[::ffff:a9fe:a9fe]/latest/meta-data",
  ]) {
    await assert.rejects(
      validatePublicTarget(target, { resolveHostname: publicResolver }),
      undefined,
      `${target} 不能成为服务器抓取目标`,
    );
  }

  await assert.doesNotReject(validatePublicTarget("https://example.com/article", { resolveHostname: publicResolver }));
  await assert.doesNotReject(
    validatePublicTarget("https://dns-public.example/article", {
      resolveHostname: async () => [{ address: "192.0.66.2", family: 4 }],
    }),
    "192.0.66.2 是公网地址，不能被 192.0.0.0/24 的保留段规则误杀",
  );
  await assert.rejects(
    validatePublicTarget("https://public-looking.example/article", {
      resolveHostname: async () => [{ address: "10.23.4.5", family: 4 }],
    }),
    undefined,
    "公开外观域名解析到 RFC1918 地址时仍必须拒绝",
  );
});

test("public fetch follows redirects manually and validates every hop before requesting it", async () => {
  const { fetchPublicText } = await import("../radar/fetch.mjs");
  assert.equal(typeof fetchPublicText, "function", "重定向安全必须能通过注入 fetch 与 DNS resolver 验证");
  const requested = [];
  const fetchImpl = async (input, init) => {
    const url = String(input);
    requested.push({ url, redirect: init?.redirect });
    if (url === "https://start.example/article") {
      return new Response(null, { status: 302, headers: { location: "https://next.example/article" } });
    }
    if (url === "https://next.example/article") {
      return new Response(null, { status: 302, headers: { location: "https://100.100.100.200/latest/meta-data" } });
    }
    throw new Error(`不应请求已被拒绝的重定向目标：${url}`);
  };

  await assert.rejects(fetchPublicText("https://start.example/article", {
    fetchImpl,
    resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
  }));
  assert.deepEqual(requested, [
    { url: "https://start.example/article", redirect: "manual" },
    { url: "https://next.example/article", redirect: "manual" },
  ], "每一跳只能在公网校验通过后发起，metadata Location 不得被请求");
});

test("public fetch pins the validated DNS answer into the actual connection", async () => {
  const { fetchPublicText } = await import("../radar/fetch.mjs");
  let resolverCalls = 0;
  let dispatcherCalls = 0;
  const pinnedDispatcher = { close: async () => {} };
  const fetchImpl = async (_input, init) => {
    assert.equal(init?.dispatcher, pinnedDispatcher, "实际连接必须使用由已校验地址创建的 pinned dispatcher");
    return new Response("safe body", { status: 200, headers: { "content-type": "text/plain" } });
  };

  const result = await fetchPublicText("https://rebind.example/article", {
    fetchImpl,
    resolveHostname: async () => {
      resolverCalls += 1;
      return [{ address: resolverCalls === 1 ? "93.184.216.34" : "10.0.0.8", family: 4 }];
    },
    createDispatcher: ({ hostname, addresses }) => {
      dispatcherCalls += 1;
      assert.equal(hostname, "rebind.example");
      assert.deepEqual(addresses, [{ address: "93.184.216.34", family: 4 }]);
      return pinnedDispatcher;
    },
  });

  assert.equal(result.body, "safe body");
  assert.equal(resolverCalls, 1, "校验后不得让连接阶段再次按 hostname 解析 DNS");
  assert.equal(dispatcherCalls, 1);
});

test("public fetch gives a mixed validated DNS set to transport in IPv4-first order", async () => {
  const { fetchPublicText } = await import("../radar/fetch.mjs");
  const dnsAnswers = [
    { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    { address: "93.184.216.34", family: 4 },
  ];
  const expectedTransportAnswers = [dnsAnswers[1], dnsAnswers[0]];
  const pinnedDispatcher = { close: async () => {} };
  let transportAnswers = null;
  let resolverCalls = 0;

  const result = await fetchPublicText("https://dual-stack.example/article", {
    fetchImpl: async (_input, init) => {
      assert.equal(init?.dispatcher, pinnedDispatcher);
      return new Response("dual-stack body", { status: 200, headers: { "content-type": "text/plain" } });
    },
    resolveHostname: async () => {
      resolverCalls += 1;
      return dnsAnswers;
    },
    createDispatcher: ({ hostname, addresses }) => {
      assert.equal(hostname, "dual-stack.example");
      transportAnswers = addresses;
      return pinnedDispatcher;
    },
  });

  assert.equal(result.body, "dual-stack body");
  assert.equal(resolverCalls, 1, "IPv4 优先不能通过二次 DNS 解析实现");
  assert.deepEqual(
    transportAnswers,
    expectedTransportAnswers,
    "transport 必须先尝试已验证 IPv4，再保留已验证 IPv6 作为后备；不得添加 DNS 未返回的地址",
  );
});

test("transport family policy preserves fallback for every multi-address verified DNS set", async () => {
  const { transportFamilyPolicy } = await import("../radar/fetch.mjs");
  assert.equal(typeof transportFamilyPolicy, "function", "默认 transport 策略必须可独立验证");

  for (const addresses of [
    [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ],
    [
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 },
    ],
  ]) {
    const policy = transportFamilyPolicy(addresses);
    assert.equal(policy.autoSelectFamily, true, "两个及以上已验证地址必须保留 transport fallback");
    assert.equal(policy.family, undefined, "多地址策略不得 hard-lock 到 family=4 或 family=6");
  }

  assert.deepEqual(
    transportFamilyPolicy([{ address: "93.184.216.34", family: 4 }]),
    { autoSelectFamily: false, family: 4 },
    "恰好一个 IPv4 地址时才允许稳定锁定 IPv4",
  );
  assert.deepEqual(
    transportFamilyPolicy([{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }]),
    { autoSelectFamily: false, family: 6 },
    "恰好一个 IPv6 地址时才允许稳定锁定 IPv6",
  );
});

test("custom fetch cannot fabricate a public DNS answer when no resolver is supplied", async () => {
  const { fetchPublicText } = await import("../radar/fetch.mjs");
  let fetchCalls = 0;
  await assert.rejects(fetchPublicText("https://unresolved.example/article", {
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response("must not be reached", { status: 200 });
    },
  }), /resolver|dns|解析/i);
  assert.equal(fetchCalls, 0, "缺少可信 resolver 时不得发起自定义网络请求");
});

for (const scenario of [
  { name: "HTTP error", status: 503, ok: false, headers: {}, error: /HTTP 503/ },
  {
    name: "declared oversize",
    status: 200,
    ok: true,
    headers: { "content-length": String(5 * 1024 * 1024 + 1) },
    error: /响应过大/,
  },
]) {
  test(`public fetch cancels ${scenario.name} response bodies before reading text`, async () => {
    const { fetchPublicText } = await import("../radar/fetch.mjs");
    let cancelCalls = 0;
    let textCalls = 0;
    const response = {
      status: scenario.status,
      ok: scenario.ok,
      headers: new Headers(scenario.headers),
      body: { cancel: async () => { cancelCalls += 1; } },
      text: async () => {
        textCalls += 1;
        return "must not be read";
      },
    };
    await assert.rejects(fetchPublicText(`https://${scenario.name.replaceAll(" ", "-").toLowerCase()}.example/article`, {
      fetchImpl: async () => response,
      resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
      createDispatcher: () => ({ close: async () => {} }),
    }), scenario.error);
    assert.equal(textCalls, 0, `${scenario.name} 不得调用 response.text()`);
    assert.equal(cancelCalls, 1, `${scenario.name} 必须主动取消未消费的 response body`);
  });
}

test("public fetch bounds chunked bodies while reading and cancels immediately after 5 MiB", async () => {
  const { fetchPublicText } = await import("../radar/fetch.mjs");
  const oneMiB = new Uint8Array(1024 * 1024);
  let pullCalls = 0;
  let cancelCalls = 0;
  let textCalls = 0;
  const body = new ReadableStream({
    pull(controller) {
      pullCalls += 1;
      if (pullCalls <= 6) controller.enqueue(oneMiB);
      else controller.close();
    },
    cancel() {
      cancelCalls += 1;
    },
  });
  const response = {
    status: 200,
    ok: true,
    headers: new Headers({ "content-type": "text/plain" }),
    body,
    text: async () => {
      textCalls += 1;
      return "x".repeat(5 * 1024 * 1024 + 1);
    },
  };

  await assert.rejects(fetchPublicText("https://chunked.example/article", {
    fetchImpl: async () => response,
    resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
    createDispatcher: () => ({ close: async () => {} }),
  }), /响应超过 5 MiB/);
  assert.equal(textCalls, 0, "无 Content-Length 时必须逐块计数，不能调用无界 response.text()");
  assert.equal(cancelCalls, 1, "读取到第一个超限 chunk 后必须立即取消 body");
});

test("relevance rejects adjacent AI news and keeps agent engineering", () => {
  const source = { focus: "AI Coding", alwaysRelevant: false };
  assert.ok(scoreRelevance({ title: "Building a durable multi-agent harness", excerpt: "workflow checkpoints and approvals" }, source) >= 5);
  assert.ok(scoreRelevance({ title: "AI is eating Finance", excerpt: "earnings and markets" }, source) < 5);
});

for (const phrase of ["多智能体编排", "上下文工程", "代码智能体", "MCP 工具协议", "Agent 沙箱", "可恢复执行"]) {
  test(`relevance recalls Chinese agent engineering term: ${phrase}`, () => {
    const source = { focus: "中文 AI Coding 社区", alwaysRelevant: false };
    assert.ok(
      scoreRelevance({ title: `${phrase}的生产实践`, excerpt: "讨论代码仓库、工具调用和工程验证。" }, source) >= 5,
      `${phrase} 应进入候选情报，而不是被英文关键词门槛丢弃`,
    );
  });
}

test("relevance still rejects generic Chinese AI finance and consumer chat", () => {
  const source = { focus: "中文 AI 社区", alwaysRelevant: false };
  assert.ok(scoreRelevance({ title: "某 AI 公司完成新一轮融资", excerpt: "消费聊天应用用户增长。" }, source) < 5);
  assert.ok(scoreRelevance({ title: "AI 陪伴聊天产品发布营销活动", excerpt: "面向普通消费者。" }, source) < 5);
});

test("relevance is recomputed from enriched article content after a weak feed preview", () => {
  const source = { focus: "中文工程社区", alwaysRelevant: false };
  const feedPreview = {
    title: "一次复杂工程复盘",
    excerpt: "本文记录团队最近完成的一次基础设施调整。",
  };
  assert.ok(scoreRelevance(feedPreview, source) < 5, "仅凭模糊 feed 标题和摘要不应直接发布");
  assert.ok(scoreRelevance({
    ...feedPreview,
    contentText: "正文聚焦上下文工程与多智能体编排，包含代码智能体的工具调用和验收边界。",
  }, source) >= 5, "enrichItem 补全正文后，二次评分应召回真实 Agent 工程内容");
});

test("fair enrichment selection samples the first candidate from every due source before later items", async () => {
  const { selectFairly } = await import("../radar/pipeline.mjs");
  assert.equal(typeof selectFairly, "function", "候选公平选择必须可独立验证");
  const candidates = [
    { sourceId: "source-a", url: "https://a.example/first" },
    { sourceId: "source-a", url: "https://a.example/second" },
    { sourceId: "source-b", url: "https://b.example/first" },
    { sourceId: "source-c", url: "https://c.example/first" },
    { sourceId: "source-d", url: "https://d.example/first" },
  ];

  const selected = selectFairly(candidates, 2);

  assert.deepEqual(
    selected.map((candidate) => candidate.url),
    [
      "https://a.example/first",
      "https://b.example/first",
      "https://c.example/first",
      "https://d.example/first",
    ],
    "即使发布上限小于到期来源数，也必须先让每个来源至少一篇进入正文 enrichment；发布数量仍由后续 publish limit 控制",
  );
});

test("runIngestion LLM-analyzes every relevant enriched candidate while only capping final publication", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-fair-source-enrichment-"));
  const originalFetch = globalThis.fetch;
  const restoreEnvironment = configurePipelineTestEnvironment(isolatedDataDirectory, {
    RADAR_MAX_NEW_ITEMS: 2,
    RADAR_MAX_AI_ITEMS: 1,
    RADAR_FETCH_CONCURRENCY: 8,
  });
  const { loadSourceCatalog } = await import("../radar/catalog.mjs");
  const sources = await loadSourceCatalog();
  const feedSources = sources.filter((source) => source.kind === "feed");
  assert.ok(feedSources.length > 2, "测试目录必须有多于发布上限的到期 feed 来源");
  const feedByUrl = new Map(feedSources.map((source) => [source.url, source]));
  const articleByUrl = new Map(feedSources.map((source) => [
    `https://example.com/radar/${source.id}`,
    source,
  ]));
  const enrichedUrls = new Set();
  let deepSeekCalls = 0;
  const sourceFetchImpl = async (input) => {
    const url = String(input);
    const articleSource = articleByUrl.get(url);
    if (articleSource) {
      enrichedUrls.add(url);
      return new Response(`<html><body><article><h1>${articleSource.name} Agent Harness update</h1><p>Agent coding harness context engineering, tool calls, checkpoints, recovery and acceptance tests.</p></article></body></html>`, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const feedSource = feedByUrl.get(url);
    if (feedSource) {
      const articleUrl = `https://example.com/radar/${feedSource.id}`;
      const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>${feedSource.name}</title><item><title>${feedSource.name} Agent Harness engineering update</title><link>${articleUrl}</link><description>Agent coding harness context engineering, tool calls, checkpoints and recovery.</description><pubDate>${new Date(Date.now() - 3_600_000).toUTCString()}</pubDate></item></channel></rss>`;
      return new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    if (url.includes("hn.algolia.com")) {
      return new Response(JSON.stringify({ hits: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("bsky.app") || url.includes("bluesky")) {
      return new Response(JSON.stringify({ posts: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("<html><body><main>No candidate articles</main></body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (!url.includes("api.deepseek.com") || !url.endsWith("/chat/completions")) {
      throw new Error(`global fetch 只允许 DeepSeek：${url}`);
    }
    deepSeekCalls += 1;
    const analysis = deepSeekPublishAnalysis(`第 ${deepSeekCalls} 个来源的 Agent Harness 更新`);
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const { runIngestion } = await import("../radar/pipeline.mjs");
    const result = await runIngestion({
      trigger: "test",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(sourceFetchImpl),
    });
    const { openDatabase } = await import("../radar/database.mjs");
    const database = openDatabase();
    try {
      const publishedCount = Number(database.prepare("SELECT COUNT(*) AS count FROM articles WHERE publish_decision = 'publish'").get().count);
      assert.equal(enrichedUrls.size, feedSources.length, "正文 enrichment 必须覆盖每个到期且产出候选的 feed 来源");
      assert.equal(result.acceptedCount, 2, "公平 enrichment 不得突破 RADAR_MAX_NEW_ITEMS 发布上限");
      assert.equal(publishedCount, 2, "数据库公开文章数也必须保持发布上限");
      assert.equal(deepSeekCalls, feedSources.length, "所有通过 enrichment 发现阈值的候选都必须进入 LLM，旧 RADAR_MAX_AI_ITEMS 不得降级剩余候选");
      assert.deepEqual(
        database.prepare("SELECT DISTINCT analysis_mode FROM articles WHERE publish_decision = 'publish'").all().map((row) => row.analysis_mode),
        ["deepseek"],
        "最终公开记录不能混入因旧 AI 调用上限产生的 rules 展示文案",
      );
    } finally {
      database.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("one source cannot use the publish limit to skip enrichment or LLM analysis", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-single-source-analysis-"));
  const originalFetch = globalThis.fetch;
  const restoreEnvironment = configurePipelineTestEnvironment(isolatedDataDirectory, {
    RADAR_MAX_NEW_ITEMS: 2,
    RADAR_MAX_AI_ITEMS: 1,
    RADAR_FETCH_CONCURRENCY: 8,
    RADAR_ANALYSIS_CONCURRENCY: 3,
  });
  const { loadSourceCatalog } = await import("../radar/catalog.mjs");
  const sources = await loadSourceCatalog();
  const targetSource = sources.find((source) => source.kind === "feed" && Number(source.maxItems) >= 5);
  assert.ok(targetSource, "测试目录必须有一个能返回至少 5 篇候选的 feed 来源");

  const candidateCount = 5;
  const articleUrls = Array.from(
    { length: candidateCount },
    (_, index) => `https://example.com/single-source/agent-harness-${index + 1}`,
  );
  const enrichedUrls = new Set();
  let deepSeekCalls = 0;
  const emptyFeed = "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>Empty Radar Feed</title></channel></rss>";
  const feedBody = `<?xml version="1.0"?><rss version="2.0"><channel><title>${targetSource.name}</title>${articleUrls.map((articleUrl, index) => `
    <item>
      <title>Agent Harness durable execution update ${index + 1}</title>
      <link>${articleUrl}</link>
      <description>Agent coding harness context engineering, tool calls, checkpoints, recovery and acceptance tests.</description>
      <pubDate>${new Date(Date.now() - (index + 1) * 60_000).toUTCString()}</pubDate>
    </item>`).join("")}</channel></rss>`;

  const sourceFetchImpl = async (input) => {
    const url = String(input);
    if (url === targetSource.url) {
      return new Response(feedBody, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    if (articleUrls.includes(url)) {
      enrichedUrls.add(url);
      return new Response("<html><body><article><h1>Agent Harness durable execution</h1><p>Agent coding harness context engineering, tool calls, checkpoints, recovery and acceptance tests.</p></article></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (url.includes("hn.algolia.com")) {
      return new Response(JSON.stringify({ hits: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("bsky.app") || url.includes("bluesky")) {
      return new Response(JSON.stringify({ posts: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(emptyFeed, { status: 200, headers: { "content-type": "application/rss+xml" } });
  };

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (!url.includes("api.deepseek.com") || !url.endsWith("/chat/completions")) {
      throw new Error(`global fetch 只允许 DeepSeek：${url}`);
    }
    deepSeekCalls += 1;
    const analysis = deepSeekPublishAnalysis(`单一来源第 ${deepSeekCalls} 篇 Agent Harness 更新`);
    analysis.eventKey = `agent-harness:single-source-update-${deepSeekCalls}`;
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const { runIngestion } = await import("../radar/pipeline.mjs");
    const result = await runIngestion({
      trigger: "test",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(sourceFetchImpl),
    });
    const { openDatabase } = await import("../radar/database.mjs");
    const database = openDatabase();
    try {
      const publishedRows = database.prepare("SELECT analysis_mode FROM articles WHERE publish_decision = 'publish'").all();
      assert.equal(enrichedUrls.size, candidateCount, "发布上限只约束最终发布，不得截断同一来源的正文 enrichment");
      assert.equal(deepSeekCalls, candidateCount, "同一来源中所有通过 enrichment 发现阈值的候选都必须调用 LLM");
      assert.equal(result.acceptedCount, 2, "最终发布数量仍必须遵守 RADAR_MAX_NEW_ITEMS");
      assert.equal(publishedRows.length, 2, "数据库公开文章数也必须保持发布上限");
      assert.ok(publishedRows.every((row) => row.analysis_mode === "deepseek"), "最终公开记录必须全部来自 DeepSeek 分析");
    } finally {
      database.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("zero-selection ingestion preserves configured provider and reports no actual article analysis", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-zero-analysis-mode-"));
  const originalFetch = globalThis.fetch;
  const restoreEnvironment = configurePipelineTestEnvironment(isolatedDataDirectory);
  const emptyFeed = "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>Empty Radar Feed</title></channel></rss>";
  let deepSeekCalls = 0;
  const sourceFetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("hn.algolia.com")) {
      return new Response(JSON.stringify({ hits: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("bsky.app") || url.includes("bluesky")) {
      return new Response(JSON.stringify({ posts: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(emptyFeed, { status: 200, headers: { "content-type": "application/rss+xml" } });
  };
  globalThis.fetch = async (input) => {
    deepSeekCalls += 1;
    throw new Error(`0 入选时不应调用 DeepSeek：${String(input)}`);
  };

  try {
    const { runIngestion } = await import("../radar/pipeline.mjs");
    const { getSnapshotPath } = await import("../radar/database.mjs");
    const result = await runIngestion({
      trigger: "systemd",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(sourceFetchImpl),
    });
    const snapshot = JSON.parse(await readFile(getSnapshotPath(), "utf8"));

    assert.equal(result.status, "success", "所有到期来源返回合法空结果时，本轮应成功完成而不是伪造失败");
    assert.equal(result.fetchedCount, 0);
    assert.equal(result.acceptedCount, 0);
    assert.equal(deepSeekCalls, 0, "没有候选文章时不得产生 AI 调用");
    assert.equal(result.configuredProvider, "deepseek", "运行结果必须保留当前进程已解析的 provider");
    assert.equal(result.runAnalysisMode, "none", "0 篇文章实际经过分析时，本轮分析口径必须是 none");
    assert.equal(result.snapshot.configuredProvider, "deepseek", "返回的 snapshot status 必须保留 configured provider");
    assert.equal(result.snapshot.runAnalysisMode, "none", "返回的 snapshot status 必须保留本轮实际分析口径");
    assert.equal(snapshot.status.configuredProvider, "deepseek", "落盘 status 必须保留 configured provider");
    assert.equal(snapshot.status.runAnalysisMode, "none", "落盘 status 不得把 0 入选误报为 rules 分析");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("analysis status label distinguishes configured provider from this run's analysis mode", async () => {
  const { analysisStatusLabel } = await import("../app/lib/radar-data.ts");
  assert.equal(typeof analysisStatusLabel, "function", "分析状态文案必须由可独立验证的纯函数生成");

  const configuredWithoutNewAnalysis = analysisStatusLabel({
    configuredProvider: "deepseek",
    runAnalysisMode: "none",
    analysisMode: "rules",
  });
  assert.equal(configuredWithoutNewAnalysis, "DeepSeek 已配置 · 本轮无新分析");
  assert.doesNotMatch(configuredWithoutNewAnalysis, /DeepSeek 分析/, "0 selection 不能声称本轮使用了 DeepSeek 分析");

  assert.equal(analysisStatusLabel({
    configuredProvider: "deepseek",
    runAnalysisMode: "deepseek",
    analysisMode: "deepseek",
  }), "DeepSeek 分析");

  assert.equal(analysisStatusLabel({
    configuredProvider: "deepseek",
    runAnalysisMode: "rules",
    analysisMode: "rules",
  }), "规则分析 · DeepSeek 已配置");
});

test("source classes map Chinese and English evidence to the same three layers", async () => {
  const { sourceLayerFromClass } = await import("../radar/snapshot.mjs");
  assert.equal(typeof sourceLayerFromClass, "function");
  for (const sourceClass of ["一手工程", "产品原始源", "协议原始源", "项目发布", "更新日志", "中文官方", "官方团队"]) {
    assert.equal(sourceLayerFromClass(sourceClass), "official", sourceClass);
  }
  for (const sourceClass of ["实践者", "概念雷达"]) {
    assert.equal(sourceLayerFromClass(sourceClass), "practitioner", sourceClass);
  }
  for (const sourceClass of ["中文社区", "英文社区", "社区讨论"]) {
    assert.equal(sourceLayerFromClass(sourceClass), "community", sourceClass);
  }
});

test("JSON community parsers normalize GitHub issues, Bluesky search and Hacker News without network", async () => {
  const { parseJsonSource } = await import("../radar/fetch.mjs");
  assert.equal(typeof parseJsonSource, "function");

  const github = parseJsonSource(JSON.stringify([
    {
      title: "Agent sandbox loses approval state",
      body: "A reproducible issue about restoring approval state.",
      html_url: "https://github.com/acme/agent-runtime/issues/42",
      created_at: "2026-07-31T08:00:00Z",
      comments: 7,
    },
    {
      title: "Refactor tool loop",
      body: "This pull request must not become community evidence.",
      html_url: "https://github.com/acme/agent-runtime/pull/43",
      created_at: "2026-07-31T09:00:00Z",
      comments: 2,
      pull_request: { url: "https://api.github.com/repos/acme/agent-runtime/pulls/43" },
    },
  ]), { parser: "github-issues", url: "https://api.github.com/repos/acme/agent-runtime/issues", maxItems: 10 });
  assert.equal(github.length, 1, "GitHub pull requests share the issues API but must be filtered");
  assert.equal(github[0].url, "https://github.com/acme/agent-runtime/issues/42");
  assert.equal(github[0].engagementCount, 7);
  assert.equal(github[0].publishedAt, "2026-07-31T08:00:00.000Z");
  assert.match(github[0].excerpt, /restoring approval state/);

  const bluesky = parseJsonSource(JSON.stringify({ posts: [{
    uri: "at://did:plc:radar/app.bsky.feed.post/3lxyz",
    author: { handle: "agent.engineering" },
    record: { text: "Context engineering for long-running coding agents", createdAt: "2026-07-30T10:30:00Z" },
    replyCount: 2,
    repostCount: 3,
    likeCount: 5,
    quoteCount: 1,
  }] }), { parser: "bluesky-search", url: "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts", maxItems: 10 });
  assert.equal(bluesky[0].url, "https://bsky.app/profile/agent.engineering/post/3lxyz");
  assert.equal(bluesky[0].engagementCount, 11);
  assert.equal(bluesky[0].publishedAt, "2026-07-30T10:30:00.000Z");

  const hackerNews = parseJsonSource(JSON.stringify({ hits: [{
    objectID: "424242",
    title: "Show HN: durable execution for coding agents",
    story_text: "Checkpoints and resumable agent workflows.",
    created_at: "2026-07-29T12:00:00Z",
    points: 42,
    num_comments: 8,
  }] }), { parser: "hacker-news", url: "https://hn.algolia.com/api/v1/search_by_date", maxItems: 10 });
  assert.equal(hackerNews[0].url, "https://news.ycombinator.com/item?id=424242");
  assert.equal(hackerNews[0].engagementCount, 50);
  assert.equal(hackerNews[0].publishedAt, "2026-07-29T12:00:00.000Z");
});

test("rule analysis does not misclassify ordinary releases as migrations", () => {
  const release = ruleAnalysis({
    title: "python-1.13.0",
    excerpt: "Added workflow checkpoints and agent runtime telemetry.",
    contentText: "",
    sourceClass: "项目发布",
    sourceName: "Agent Framework Releases",
  });
  assert.equal(release.topic, "工程");
  assert.equal(release.stage, "Validated");

  const maintenance = ruleAnalysis({
    title: "AutoGen enters maintenance mode",
    excerpt: "New projects should migrate to the successor framework.",
    contentText: "",
    sourceClass: "项目状态",
    sourceName: "AutoGen",
  });
  assert.equal(maintenance.topic, "迁移");
  assert.equal(maintenance.stage, "Cooling");
});

test("editorial guards cap evidence by source layer and recompute the editorial score", async () => {
  const { applyEditorialGuards } = await import("../radar/analyze.mjs");
  assert.equal(typeof applyEditorialGuards, "function", "分析结果必须经过可独立验证的后置编辑护栏");

  const assertedAnalysis = {
    title: "Agent Runtime 已在生产环境完成全面验证",
    summary: "作者声称该方案已由大量团队在生产环境验证。",
    implication: "所有团队都应立即迁移。",
    topic: "工程",
    conceptSlug: "agent-harness",
    stage: "Validated",
    accent: "evidence",
    tags: ["agent-harness", "runtime"],
    publishDecision: "publish",
    editorialScore: 100,
    relevanceScore: 76,
    noveltyScore: 64,
    evidenceScore: 100,
    eventKey: "agent-runtime:self-reported-validation",
    candidateConcept: "",
    analysisMode: "deepseek",
  };
  const expectedEditorialScore = (analysis) => Math.round(
    analysis.relevanceScore * 0.5
      + analysis.evidenceScore * 0.3
      + analysis.noveltyScore * 0.2,
  );

  const community = applyEditorialGuards({
    sourceLayer: "community",
    sourceClass: "中文社区",
    sourceName: "Community post",
  }, { ...assertedAnalysis });
  assert.ok(community.evidenceScore <= 55, "社区单篇自报不能获得高证据分");
  assert.equal(community.stage, "Spark", "社区单篇自报不能把成熟度提升为 Validated");
  assert.equal(community.editorialScore, expectedEditorialScore(community));
  assert.notEqual(community.editorialScore, 100, "编辑总分不能保留模型未经约束的满分");

  const practitioner = applyEditorialGuards({
    sourceLayer: "practitioner",
    sourceClass: "实践者",
    sourceName: "Engineering practitioner",
  }, { ...assertedAnalysis });
  assert.ok(practitioner.evidenceScore <= 80, "实践者文章不能被单篇自述抬到官方证据等级");
  assert.equal(practitioner.editorialScore, expectedEditorialScore(practitioner));

  const official = applyEditorialGuards({
    sourceLayer: "official",
    sourceClass: "一手工程",
    sourceName: "Official engineering",
  }, { ...assertedAnalysis, evidenceScore: 90 });
  assert.equal(official.evidenceScore, 90, "官方原始来源的 90 分证据可以保留");
  assert.equal(official.editorialScore, expectedEditorialScore(official));
});

test("rules analysis applies editorial guards to self-reported community validation", async () => {
  const result = await analyzeItem({
    title: "Agent runtime 1.0 is stable and production-ready",
    excerpt: "社区作者自称已被数百家公司全面生产验证，并要求读者把它视为行业共识。",
    contentText: "This community post claims generally available production validation for a durable agent runtime.",
    sourceLayer: "community",
    sourceClass: "中文社区",
    sourceName: "Community post",
    relevanceScore: 8,
    url: "https://community.example.com/self-reported-agent-runtime",
    publishedAt: "2026-08-01T00:00:00.000Z",
  }, "rules");

  assert.ok(result.evidenceScore <= 55);
  assert.equal(result.stage, "Spark", "规则降级路径也不能信任社区正文里的成熟度自报");
  assert.equal(
    result.editorialScore,
    Math.round(result.relevanceScore * 0.5 + result.evidenceScore * 0.3 + result.noveltyScore * 0.2),
    "规则路径必须使用受限证据分重算编辑总分",
  );
});

test("clustering merges the same event but keeps different release versions apart", () => {
  const analysis = { conceptSlug: "coding-agent", tags: ["coding-agent", "release"] };
  const candidates = [{
    signal_slug: "coding-agent-existing",
    concept_slug: "coding-agent",
    original_title: "Claude Code v2.1.219 release",
    tags_json: JSON.stringify(["coding-agent", "release"]),
  }];
  assert.equal(
    chooseSignalSlug({ title: "Claude Code v2.1.219 release notes" }, analysis, candidates),
    "coding-agent-existing",
  );
  assert.notEqual(
    chooseSignalSlug({ title: "Claude Code v2.1.220 release notes" }, analysis, candidates),
    "coding-agent-existing",
  );
});

test("version clustering never crosses concept boundaries within one independent source group", () => {
  const item = {
    title: "Runtime v2.1.219 release notes",
    independentGroup: "official-runtime-releases",
  };
  const sameVersionCandidate = [{
    signal_slug: "durable-execution-existing",
    concept_slug: "durable-execution",
    independent_group: "official-runtime-releases",
    original_title: "Runtime v2.1.219 release",
    tags_json: JSON.stringify(["durable-execution", "release"]),
  }];

  assert.notEqual(
    chooseSignalSlug(item, { conceptSlug: "agent-harness", tags: ["agent-harness", "release"] }, sameVersionCandidate),
    "durable-execution-existing",
    "相同版本和来源组不能覆盖模型分析出的不同概念边界",
  );
  assert.equal(
    chooseSignalSlug(item, { conceptSlug: "durable-execution", tags: ["durable-execution", "release"] }, sameVersionCandidate),
    "durable-execution-existing",
    "概念一致时仍按现有同版本策略聚合",
  );
});

test("optional OpenAI analysis uses a strict structured response and remains parseable", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.RADAR_OPENAI_MODEL;
  let requestBody;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.RADAR_OPENAI_MODEL = "gpt-5.6-terra";
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{
        type: "output_text",
        text: JSON.stringify({
          title: "Agent Harness 进入稳定工程层",
          summary: "官方来源发布了包含工具循环、审批与遥测的稳定 Agent Harness。",
          implication: "评估时应将模型与 Harness 分开，并验证权限、恢复和运行 trace。",
          topic: "工程",
          conceptSlug: "agent-harness",
          stage: "Validated",
          accent: "engineering",
          tags: ["agent-harness", "runtime"],
        }),
      }] }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const { openAIAnalysis } = await import("../radar/analyze.mjs");
    const result = await openAIAnalysis({
      title: "Agent Harness release", excerpt: "Stable runtime with approvals and telemetry.", contentText: "",
      sourceName: "Official Engineering", sourceClass: "一手工程", url: "https://example.com/harness", publishedAt: null,
    });
    assert.equal(result.analysisMode, "openai");
    assert.equal(result.conceptSlug, "agent-harness");
    assert.equal(requestBody.model, "gpt-5.6-terra");
    assert.equal(requestBody.store, false);
    assert.equal(requestBody.text.format.strict, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.RADAR_OPENAI_MODEL;
    else process.env.RADAR_OPENAI_MODEL = originalModel;
  }
});

for (const provider of ["deepseek", "openai"]) {
  test(`${provider} retries English editorial fields and accepts the next Chinese edit`, async () => {
    const originalFetch = globalThis.fetch;
    const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    let attempts = 0;
    const analyses = [
      englishPublishAnalysis(),
      deepSeekPublishAnalysis("Agent Harness 增加可恢复检查点"),
    ];
    globalThis.fetch = async () => {
      const analysis = analyses[Math.min(attempts, analyses.length - 1)];
      attempts += 1;
      if (provider === "openai") return openAIResponse(analysis);
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    try {
      const result = await analyzeItem(providerTestItem(), provider);
      assert.equal(attempts, 2, "英文展示字段必须触发一次重试，不能直接进入公开信号");
      assert.equal(result.analysisMode, provider);
      assert.equal(result.title, "Agent Harness 增加可恢复检查点");
      for (const field of ["title", "summary", "implication"]) {
        assert.match(result[field], /[\u3400-\u9fff]/, `${field} 必须是中文编辑结果`);
      }
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
      if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });

  test(`${provider} retry explains the failed Chinese title gate and requests a Chinese-led rewrite`, async () => {
    const originalFetch = globalThis.fetch;
    const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    const requestBodies = [];
    const analyses = [
      deepSeekPublishAnalysis("Agent Skills for .NET is now released 正式发布"),
      deepSeekPublishAnalysis(".NET Agent Skills 正式发布并纳入智能体技能框架"),
    ];
    globalThis.fetch = async (_url, init) => {
      const requestBody = JSON.parse(init.body);
      requestBodies.push(requestBody);
      const analysis = analyses[Math.min(requestBodies.length - 1, analyses.length - 1)];
      if (provider === "openai") return openAIResponse(analysis);
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    try {
      const result = await analyzeItem(providerTestItem(), provider);
      assert.equal(requestBodies.length, 2, "中文标题校验失败后只能追加一次修复请求");
      assert.equal(result.analysisMode, provider);
      assert.equal(result.title, ".NET Agent Skills 正式发布并纳入智能体技能框架");

      const firstRequest = JSON.stringify(requestBodies[0]);
      const retryRequest = JSON.stringify(requestBodies[1]);
      assert.doesNotMatch(firstRequest, /title 不是中文主导内容|15%/, "首次请求不能伪装成重试或携带不存在的失败原因");
      assert.match(retryRequest, /中文编辑校验失败/, "重试必须说明失败来自公开中文编辑门禁");
      assert.match(retryRequest, /title 不是中文主导内容/, "重试必须携带本次真实校验失败原因");
      assert.match(retryRequest, /15%/, "重试不能丢失失败门槛，避免模型重复给出同类标题");
      assert.match(
        retryRequest,
        /(?:title|标题).{0,30}(?:以中文(?:表达|叙述)?为主体|中文主导)/,
        "重试必须明确要求标题以中文为主体",
      );
      assert.match(
        retryRequest,
        /(?:不要|不得|禁止).{0,12}照抄英文(?:原题|原标题)/,
        "重试必须明确禁止照抄英文原标题",
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
      if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });

  test(`${provider} malformed JSON retry uses a fixed local reason without replaying model output`, async () => {
    const originalFetch = globalThis.fetch;
    const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    const requestBodies = [];
    globalThis.fetch = async (_url, init) => {
      requestBodies.push(JSON.parse(init.body));
      const content = requestBodies.length === 1
        ? '{"private":"PRIVATE_MODEL_OUTPUT"'
        : JSON.stringify(deepSeekPublishAnalysis("Agent Harness 已生成有效中文分析"));
      return providerRawResponse(provider, content);
    };

    try {
      const result = await analyzeItem(providerTestItem(), provider);
      assert.equal(requestBodies.length, 2, "无效 JSON 只能触发一次有界重试");
      assert.equal(result.analysisMode, provider);
      const retryRequest = JSON.stringify(requestBodies[1]);
      assert.match(retryRequest, /模型输出不是有效 JSON/, "解析失败只能回传固定、可行动的本地原因");
      assert.doesNotMatch(retryRequest, /PRIVATE_MODEL_OUTPUT/, "模型原始输出不得回灌进下一次提示词");
      assert.doesNotMatch(retryRequest, /Unexpected|position\s+\d+|JSON 无效/, "JSON 解析器原始错误片段不得回灌进下一次提示词");
      assert.doesNotMatch(retryRequest, /中文编辑校验失败/, "JSON 语法错误不能伪装成中文编辑门禁失败");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
      if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });

  test(`${provider} HTTP 400 is terminal and never consumes the retry budget`, async () => {
    const originalFetch = globalThis.fetch;
    const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      return new Response("invalid request", { status: 400, headers: { "content-type": "text/plain" } });
    };

    try {
      const result = await analyzeItem(providerTestItem(), provider);
      assert.equal(attempts, 1, "HTTP 400 是不可重试的请求错误，不能发起第二次调用");
      assert.equal(result.analysisMode, "rules");
      assert.match(result.analysisError, /HTTP 400/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
      if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });

  test(`${provider} HTTP 503 retry preserves the original prompt without model-output correction`, async () => {
    const originalFetch = globalThis.fetch;
    const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    const requestBodies = [];
    globalThis.fetch = async (_url, init) => {
      requestBodies.push(JSON.parse(init.body));
      if (requestBodies.length === 1) {
        return new Response("PRIVATE_HTTP_BODY temporary unavailable", { status: 503, headers: { "content-type": "text/plain" } });
      }
      return providerRawResponse(provider, JSON.stringify(deepSeekPublishAnalysis("Agent Harness 已从瞬时故障恢复")));
    };

    try {
      const result = await analyzeItem(providerTestItem(), provider);
      assert.equal(requestBodies.length, 2, "HTTP 503 允许且只允许一次重试");
      assert.equal(result.analysisMode, provider);
      assert.deepEqual(requestBodies[1], requestBodies[0], "瞬时上游错误重试必须保持原始 prompt 语义和请求结构");
      const retryRequest = JSON.stringify(requestBodies[1]);
      assert.doesNotMatch(retryRequest, /中文编辑校验失败|模型输出不是有效 JSON|PRIVATE_HTTP_BODY/, "HTTP 错误不得注入模型输出纠错提示");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
      if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });

  test(`${provider} final English failure falls back without publishing English source prose`, async () => {
    const originalFetch = globalThis.fetch;
    const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      const analysis = englishPublishAnalysis();
      if (provider === "openai") return openAIResponse(analysis);
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    try {
      const result = await analyzeItem(providerTestItem(), provider);
      assert.equal(attempts, 2, "中英文校验失败必须完成一次有界重试");
      assert.equal(result.analysisMode, "rules");
      assert.notEqual(result.publishDecision, "publish", "规则降级不得把英文原文作为公开展示文案发布");
      assert.match(result.analysisError, /中文|语言/i);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
      if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });

  for (const [invalidLanguage, invalidAnalysis] of [
    ["Japanese", japanesePublishAnalysis()],
    ["English-dominant mixed", englishDominantPublishAnalysis()],
    ["Korean-dominant mixed", koreanDominantPublishAnalysis()],
    ["Cyrillic-dominant mixed", cyrillicDominantPublishAnalysis()],
    ["Arabic-dominant mixed", arabicDominantPublishAnalysis()],
  ]) {
    test(`${provider} rejects ${invalidLanguage} editorial prose even when it contains enough Han characters`, async () => {
      const originalFetch = globalThis.fetch;
      const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
      const originalOpenAIKey = process.env.OPENAI_API_KEY;
      process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
      process.env.OPENAI_API_KEY = "test-openai-key";
      let attempts = 0;
      const analyses = [
        invalidAnalysis,
        deepSeekPublishAnalysis("Claude Code v2.1 增加可恢复任务"),
      ];
      globalThis.fetch = async () => {
        const analysis = analyses[Math.min(attempts, analyses.length - 1)];
        attempts += 1;
        if (provider === "openai") return openAIResponse(analysis);
        return new Response(JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      };

      try {
        const result = await analyzeItem(providerTestItem(), provider);
        assert.equal(attempts, 2, `${invalidLanguage} 展示文案不能凭少量汉字绕过中文编辑门禁`);
        assert.equal(result.analysisMode, provider);
        assert.equal(result.title, "Claude Code v2.1 增加可恢复任务");
      } finally {
        globalThis.fetch = originalFetch;
        if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
        else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
        if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalOpenAIKey;
      }
    });
  }

  test(`${provider} accepts Chinese editorial prose with product names and versions`, async () => {
    const originalFetch = globalThis.fetch;
    const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    let attempts = 0;
    const analysis = deepSeekPublishAnalysis("Claude Code v2.1 增加可恢复任务");
    globalThis.fetch = async () => {
      attempts += 1;
      if (provider === "openai") return openAIResponse(analysis);
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    try {
      const result = await analyzeItem(providerTestItem(), provider);
      assert.equal(attempts, 1, "产品专名和版本号较多但主体为中文时不能误触发重试");
      assert.equal(result.analysisMode, provider);
      assert.equal(result.title, "Claude Code v2.1 增加可恢复任务");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
      if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });
}

test("analysis provider selection is explicit and preserves existing OpenAI deployments", () => {
  assert.equal(resolveAnalysisProvider({}), "rules");
  assert.equal(resolveAnalysisProvider({ DEEPSEEK_API_KEY: "deepseek-key" }), "deepseek");
  assert.equal(resolveAnalysisProvider({ OPENAI_API_KEY: "openai-key", DEEPSEEK_API_KEY: "deepseek-key" }), "openai");
  assert.equal(resolveAnalysisProvider({ RADAR_AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "deepseek-key" }), "deepseek");
  assert.equal(resolveAnalysisProvider({ RADAR_AI_PROVIDER: "rules", OPENAI_API_KEY: "openai-key" }), "rules");
  assert.equal(resolveAnalysisProvider({ RADAR_DISABLE_AI: "1", DEEPSEEK_API_KEY: "deepseek-key" }), "rules");
  assert.equal(resolveAnalysisProvider({ RADAR_DISABLE_OPENAI: "1", OPENAI_API_KEY: "openai-key", DEEPSEEK_API_KEY: "deepseek-key" }), "deepseek");
  assert.throws(() => resolveAnalysisProvider({ RADAR_AI_PROVIDER: "unknown" }), /RADAR_AI_PROVIDER/);
});

test("systemd source scheduling enforces catalog cadence while manual runs bypass it", async () => {
  const { isSourceDue } = await import("../radar/pipeline.mjs");
  assert.equal(typeof isSourceDue, "function");
  const now = "2026-08-02T12:00:00.000Z";

  assert.equal(isSourceDue(
    { cadence: "24h" },
    { trigger: "manual", lastAttemptAt: "2026-08-02T11:59:59.000Z", now },
  ), true, "手工采集必须允许立即重跑所有来源");
  assert.equal(isSourceDue(
    { cadence: "4h" },
    { trigger: "systemd", lastAttemptAt: null, now },
  ), true, "从未尝试的来源必须在下一次 systemd 运行中采集");

  for (const hours of [4, 8, 12, 24]) {
    const dueAt = new Date(new Date(now).getTime() - hours * 3_600_000).toISOString();
    const oneMinuteEarly = new Date(new Date(now).getTime() - (hours * 60 - 1) * 60_000).toISOString();
    assert.equal(
      isSourceDue({ cadence: `${hours}h` }, { trigger: "systemd", lastAttemptAt: dueAt, now }),
      true,
      `${hours}h 来源到达边界时应采集`,
    );
    assert.equal(
      isSourceDue({ cadence: `${hours}h` }, { trigger: "systemd", lastAttemptAt: oneMinuteEarly, now }),
      false,
      `${hours}h 来源尚差一分钟时不应采集`,
    );
  }

  assert.throws(
    () => isSourceDue({ cadence: "sometimes" }, { trigger: "systemd", lastAttemptAt: null, now }),
    /cadence|频率|周期/i,
    "无效 cadence 必须显式失败，不能退化成每轮抓取",
  );
});

test("DeepSeek analysis uses JSON Output and records the real provider", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.RADAR_DEEPSEEK_MODEL;
  const originalBaseUrl = process.env.RADAR_DEEPSEEK_BASE_URL;
  let requestUrl;
  let requestBody;
  let requestHeaders;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  process.env.RADAR_DEEPSEEK_MODEL = "deepseek-v4-flash";
  delete process.env.RADAR_DEEPSEEK_BASE_URL;
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestBody = JSON.parse(init.body);
    requestHeaders = init.headers;
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            title: "Agent Harness 进入稳定工程层",
            summary: "官方来源发布了包含工具循环、审批与遥测的稳定 Agent Harness。",
            implication: "评估时应将模型与 Harness 分开，并验证权限、恢复和运行 trace。",
            topic: "工程",
            conceptSlug: "agent-harness",
            stage: "Validated",
            accent: "engineering",
            tags: ["agent-harness", "runtime"],
          }),
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await deepSeekAnalysis({
      title: "Agent Harness release", excerpt: "Stable runtime with approvals and telemetry.", contentText: "",
      sourceName: "Official Engineering", sourceClass: "一手工程", url: "https://example.com/harness", publishedAt: null,
    });
    assert.equal(result.analysisMode, "deepseek");
    assert.equal(result.conceptSlug, "agent-harness");
    assert.equal(requestUrl, "https://api.deepseek.com/chat/completions");
    assert.equal(requestHeaders.authorization, "Bearer test-deepseek-key");
    assert.equal(requestBody.model, "deepseek-v4-flash");
    assert.deepEqual(requestBody.response_format, { type: "json_object" });
    assert.deepEqual(requestBody.thinking, { type: "disabled" });
    assert.match(requestBody.messages[0].content, /JSON/);
    assert.match(requestBody.messages[0].content, /conceptSlug 只能是/);
    assert.match(requestBody.messages[0].content, /coding-agent/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.RADAR_DEEPSEEK_MODEL;
    else process.env.RADAR_DEEPSEEK_MODEL = originalModel;
    if (originalBaseUrl === undefined) delete process.env.RADAR_DEEPSEEK_BASE_URL;
    else process.env.RADAR_DEEPSEEK_BASE_URL = originalBaseUrl;
  }
});

test("provider instructions demand concise Chinese editing instead of full translation", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  let systemPrompt = "";
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    systemPrompt = request.messages?.[0]?.content || "";
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: { content: JSON.stringify(deepSeekPublishAnalysis("Agent Harness 增加可恢复检查点")) },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await deepSeekAnalysis(providerTestItem());
    assert.match(systemPrompt, /(?:不是|不要|禁止).{0,12}(?:全文|逐句).{0,4}翻译/, "提示词必须明确要求编辑提炼而不是全文翻译");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("DeepSeek keeps valid prose and repairs out-of-contract categorical fields", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  let attempts = 0;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            title: "Agent Harness 发布新的恢复能力",
            summary: "官方版本加入任务恢复能力，但大规模生产采用仍需要更多证据。",
            implication: "团队应验证检查点恢复、幂等重试和运行时可观测性。",
            topic: "技术趋势",
            conceptSlug: "agent-runtime-management",
            stage: "Mature",
            accent: "runtime",
            tags: ["agent-harness", "runtime"],
          }),
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await deepSeekAnalysis({
      title: "Agent Harness release", excerpt: "Stable agent runtime with checkpoints, approvals and telemetry.", contentText: "",
      sourceName: "Official Engineering", sourceClass: "一手工程", url: "https://example.com/harness", publishedAt: null,
    });
    assert.equal(attempts, 1);
    assert.equal(result.analysisMode, "deepseek");
    assert.equal(result.title, "Agent Harness 发布新的恢复能力");
    assert.equal(result.conceptSlug, "agent-harness");
    assert.equal(result.topic, "工程");
    assert.equal(result.stage, "Validated");
    assert.equal(result.accent, "engineering");
    assert.match(result.analysisWarning, /conceptSlug/);
    assert.match(result.analysisWarning, /topic/);
    assert.match(result.analysisWarning, /stage/);
    assert.match(result.analysisWarning, /accent/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("DeepSeek empty responses retry once and then fall back to rules", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  let attempts = 0;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "" } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await analyzeItem({
      title: "Agent Harness release", excerpt: "Stable runtime with approvals and telemetry.", contentText: "",
      sourceName: "Official Engineering", sourceClass: "一手工程", url: "https://example.com/harness", publishedAt: null,
    }, "deepseek");
    assert.equal(attempts, 2);
    assert.equal(result.analysisMode, "rules");
    assert.match(result.analysisError, /空内容/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("runIngestion retains watched LLM concept candidates without publishing them as signals", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-watch-candidate-"));
  const originalFetch = globalThis.fetch;
  const environmentKeys = [
    "RADAR_AI_PROVIDER",
    "DEEPSEEK_API_KEY",
    "OPENAI_API_KEY",
    "RADAR_DISABLE_AI",
    "RADAR_DISABLE_OPENAI",
    "RADAR_MAX_NEW_ITEMS",
    "RADAR_MAX_AI_ITEMS",
    "RADAR_SOURCE_CONCURRENCY",
    "RADAR_FETCH_CONCURRENCY",
    "RADAR_ANALYSIS_CONCURRENCY",
    "RADAR_MAX_ITEM_AGE_DAYS",
  ];
  const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  const candidateName = "Agent Reliability Engineering";
  const candidateUrl = "https://www.v2ex.com/t/999999";
  let deepSeekCalls = 0;

  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  process.env.RADAR_AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  delete process.env.OPENAI_API_KEY;
  delete process.env.RADAR_DISABLE_AI;
  delete process.env.RADAR_DISABLE_OPENAI;
  process.env.RADAR_MAX_NEW_ITEMS = "1";
  process.env.RADAR_MAX_AI_ITEMS = "1";
  process.env.RADAR_SOURCE_CONCURRENCY = "40";
  process.env.RADAR_FETCH_CONCURRENCY = "1";
  process.env.RADAR_ANALYSIS_CONCURRENCY = "1";
  process.env.RADAR_MAX_ITEM_AGE_DAYS = "365";

  const emptyFeed = "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>Empty Radar Feed</title></channel></rss>";
  const candidateFeed = `<?xml version="1.0"?><rss version="2.0"><channel><title>Agent Engineering</title><item><title>Agent Reliability Engineering for long-running coding agents</title><link>${candidateUrl}</link><description>Context engineering, tool calls, checkpoints and recovery for coding agents.</description><pubDate>Sun, 02 Aug 2026 02:00:00 GMT</pubDate></item></channel></rss>`;

  const combinedFetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("api.deepseek.com") && url.endsWith("/chat/completions")) {
      deepSeekCalls += 1;
      return new Response(JSON.stringify({
        choices: [{
          finish_reason: "stop",
          message: { content: JSON.stringify({
            title: `${candidateName} 成为待验证的新概念候选`,
            summary: "社区原文提出一种面向长任务 Agent 的可靠性工程方法，但证据尚不足以公开发布为正式信号。",
            implication: "保留候选名称与原始证据，等待实践者或官方材料交叉验证。",
            topic: "概念",
            conceptSlug: "coding-agent",
            stage: "Spark",
            accent: "signal",
            tags: ["coding-agent", "reliability"],
            publishDecision: "watch",
            editorialScore: 68,
            relevanceScore: 84,
            noveltyScore: 80,
            evidenceScore: 50,
            eventKey: "agent-reliability-engineering:origin",
            candidateConcept: candidateName,
          }) },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === candidateUrl) {
      return new Response("<html><body><article><h1>Agent Reliability Engineering</h1><p>Context engineering, durable checkpoints, recovery tests and tool-call acceptance evidence for long-running coding agents.</p></article></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (url === "https://www.v2ex.com/feed/programmer.xml") {
      return new Response(candidateFeed, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    if (url.includes("hn.algolia.com")) {
      return new Response(JSON.stringify({ hits: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("bsky.app") || url.includes("bluesky")) {
      return new Response(JSON.stringify({ posts: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (/\.xml(?:\?|$)|\.rss(?:\?|$)|\.atom(?:\?|$)|\/feed\/?(?:\?|$)|\/rss\.xml(?:\?|$)/i.test(url)) {
      return new Response(emptyFeed, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    return new Response("<html><body><main>No candidate articles</main></body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
  const sourceFetchImpl = async (input, init) => {
    const url = String(input);
    if (url.includes("api.deepseek.com")) throw new Error(`来源 fetchOptions 不得承接 DeepSeek：${url}`);
    return combinedFetchImpl(input, init);
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.includes("api.deepseek.com") || !url.endsWith("/chat/completions")) throw new Error(`global fetch 只允许 DeepSeek：${url}`);
    return combinedFetchImpl(input, init);
  };

  try {
    const { runIngestion } = await import("../radar/pipeline.mjs");
    const { getSnapshotPath } = await import("../radar/database.mjs");
    const result = await runIngestion({
      trigger: "test",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(sourceFetchImpl),
    });
    const snapshot = JSON.parse(await readFile(getSnapshotPath(), "utf8"));

    assert.equal(deepSeekCalls, 1, "候选文章必须真实经过一次 DeepSeek 分析");
    assert.equal(result.acceptedCount, 0, "watch 只进入候选池，不能计入公开发布 acceptedCount");
    assert.equal(snapshot.status.signalCount, 0, "watch 不能抬高公开信号计数");
    assert.deepEqual(snapshot.signals, [], "watch 不能出现在公开 signals 中");
    const candidate = snapshot.candidateConcepts.find((item) => item.name === candidateName);
    assert.ok(candidate, "DeepSeek 返回的 watch candidateConcept 必须留存在候选池");
    assert.equal(candidate.signalCount, 0, "未公开的 watch 候选不能伪装成公开信号");
    assert.equal(candidate.evidenceCount, 1);
    assert.equal(candidate.sources.some((source) => source.href === candidateUrl), true, "watch 候选必须保留原文链接");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    for (const key of environmentKeys) {
      const value = previousEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("runIngestion recalls a weak feed preview when enriched article content is strongly relevant", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-enriched-recall-"));
  const originalFetch = globalThis.fetch;
  const restoreEnvironment = configurePipelineTestEnvironment(isolatedDataDirectory);
  const feedUrl = "https://www.v2ex.com/feed/programmer.xml";
  const articleUrl = "https://www.v2ex.com/t/999998";
  const publishedAt = new Date(Date.now() - 3_600_000).toUTCString();
  const feedBody = `<?xml version="1.0"?><rss version="2.0"><channel><title>Engineering</title><item><title>一次复杂工程复盘</title><link>${articleUrl}</link><description>本文记录团队最近完成的一次基础设施调整。</description><pubDate>${publishedAt}</pubDate></item></channel></rss>`;
  const { fetchImpl, deepSeekFetchImpl, state } = isolatedCatalogFetch({
    feedUrl,
    feedBody,
    articleUrl,
    articleHtml: "<html><body><article><h1>一次复杂工程复盘</h1><p>正文聚焦上下文工程与多智能体编排，包含代码智能体的工具调用、检查点恢复和验收边界。</p></article></body></html>",
    analyses: [deepSeekPublishAnalysis("正文揭示多智能体 Agent Harness 的恢复机制")],
  });
  globalThis.fetch = deepSeekFetchImpl;

  try {
    const { runIngestion } = await import("../radar/pipeline.mjs");
    const { getSnapshotPath } = await import("../radar/database.mjs");
    const result = await runIngestion({
      trigger: "test",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(fetchImpl),
    });
    const snapshot = JSON.parse(await readFile(getSnapshotPath(), "utf8"));

    assert.equal(state.deepSeekCalls, 1, "弱 feed 摘要不能在正文抓取前被永久丢弃");
    assert.equal(result.acceptedCount, 1);
    assert.equal(snapshot.status.signalCount, 1);
    assert.equal(snapshot.signals[0].sources.some((source) => source.href === articleUrl), true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("runIngestion preserves foreign-language source evidence while publishing Chinese LLM edits", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-multilingual-evidence-"));
  const originalFetch = globalThis.fetch;
  const restoreEnvironment = configurePipelineTestEnvironment(isolatedDataDirectory, {
    RADAR_MAX_NEW_ITEMS: 1,
    RADAR_MAX_AI_ITEMS: 1,
  });
  const feedUrl = "https://www.v2ex.com/feed/programmer.xml";
  const articleUrl = "https://www.v2ex.com/t/999995";
  const originalTitle = "Agent Harness の durable checkpoint recovery 実装";
  const originalExcerpt = "長時間 coding agent の tool calls と recovery を検証する公式ノート。";
  const originalContent = "Agent Harness は checkpoints、approvals、tool-call replay を保持し、失敗後の recovery を検証する。";
  const publishedAt = new Date(Date.now() - 3_600_000).toUTCString();
  const feedBody = `<?xml version="1.0"?><rss version="2.0"><channel><title>Engineering</title><item><title>${originalTitle}</title><link>${articleUrl}</link><description>${originalExcerpt}</description><pubDate>${publishedAt}</pubDate></item></channel></rss>`;
  const { fetchImpl, deepSeekFetchImpl, state } = isolatedCatalogFetch({
    feedUrl,
    feedBody,
    articleUrl,
    articleHtml: `<html><body><article>${originalContent}</article></body></html>`,
    analyses: [deepSeekPublishAnalysis("Agent Harness 补充可恢复检查点实现")],
  });
  globalThis.fetch = deepSeekFetchImpl;

  try {
    const { runIngestion } = await import("../radar/pipeline.mjs");
    const { openDatabase } = await import("../radar/database.mjs");
    const result = await runIngestion({
      trigger: "test",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(fetchImpl),
    });
    const database = openDatabase();
    try {
      const row = database.prepare(`
        SELECT url, original_title, original_excerpt, content_text, title, summary, implication
        FROM articles WHERE url = ?
      `).get(articleUrl);
      assert.equal(state.deepSeekCalls, 1);
      assert.equal(result.acceptedCount, 1);
      assert.deepEqual({
        url: row.url,
        originalTitle: row.original_title,
        originalExcerpt: row.original_excerpt,
        contentText: row.content_text,
      }, {
        url: articleUrl,
        originalTitle,
        originalExcerpt,
        contentText: originalContent,
      }, "原始证据字段必须保持来源语言和原始 URL，不能被中文编辑覆盖");
      for (const field of ["title", "summary", "implication"]) {
        assert.match(row[field], /[\u3400-\u9fff]/, `公开 ${field} 必须是中文编辑结果`);
      }
      const { buildSnapshot } = await import("../radar/snapshot.mjs");
      const snapshot = await buildSnapshot(database);
      assert.equal(snapshot.signals[0].title, "Agent Harness 补充可恢复检查点实现");
      assert.equal(snapshot.signals[0].sources[0].href, articleUrl);
      assert.equal(snapshot.signals[0].sources[0].originalTitle, originalTitle);
    } finally {
      database.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("runIngestion can re-evaluate and promote a stored watch URL without creating a duplicate", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-watch-promotion-"));
  const originalFetch = globalThis.fetch;
  const restoreEnvironment = configurePipelineTestEnvironment(isolatedDataDirectory);
  const feedUrl = "https://www.v2ex.com/feed/programmer.xml";
  const articleUrl = "https://www.v2ex.com/t/999997";
  const publishedAt = new Date(Date.now() - 3_600_000).toISOString();
  const source = {
    id: "v2ex-programmer",
    name: "V2EX · 程序员",
    homepage: "https://www.v2ex.com/go/programmer",
    class: "中文社区",
    priority: "P2",
    cadence: "4h",
    focus: "中文 AI Coding · Agent 工具与实践讨论",
    independentGroup: "v2ex",
    layer: "community",
    language: "zh",
  };
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const seedDatabase = openDatabase();
  try {
    upsertSourceCatalog(seedDatabase, [source]);
    assert.equal(insertArticle(seedDatabase, {
      url: articleUrl,
      sourceId: source.id,
      sourceName: source.name,
      sourceClass: source.class,
      independentGroup: source.independentGroup,
      sourceLayer: source.layer,
      sourceLanguage: source.language,
      originalTitle: "Agent Harness durable execution field note",
      originalExcerpt: "Initial evidence is relevant but not yet sufficient.",
      contentText: "Initial evidence is relevant but not yet sufficient.",
      publishedAt,
      discoveredAt: publishedAt,
      contentHash: "watch-before-promotion",
      relevanceScore: 7,
      signalSlug: "agent-harness-watch-before-promotion",
      conceptSlug: "agent-harness",
      title: "Agent Harness 可靠性候选等待验证",
      summary: "初始材料相关，但证据不足，先进入候选池。",
      implication: "等待后续正文和独立证据后重新分析。",
      topic: "工程",
      stage: "Spark",
      accent: "signal",
      tags: ["agent-harness", "durable-execution"],
      analysisMode: "deepseek",
      publishDecision: "watch",
      editorialScore: 62,
      aiRelevanceScore: 72,
      noveltyScore: 74,
      evidenceScore: 50,
      eventKey: "agent-harness:durable-recovery-update",
      candidateConcept: "Agent Reliability Engineering",
    }), true);
  } finally {
    seedDatabase.close();
  }

  const feedBody = `<?xml version="1.0"?><rss version="2.0"><channel><title>Engineering</title><item><title>Agent Harness durable execution update</title><link>${articleUrl}</link><description>Agent Harness now documents checkpoint recovery and tool-call acceptance tests.</description><pubDate>${new Date(publishedAt).toUTCString()}</pubDate></item></channel></rss>`;
  const { fetchImpl, deepSeekFetchImpl, state } = isolatedCatalogFetch({
    feedUrl,
    feedBody,
    articleUrl,
    articleHtml: "<html><body><article><h1>Agent Harness durable execution update</h1><p>Updated evidence documents checkpoint recovery, tool-call acceptance tests and failure replay for coding agents.</p></article></body></html>",
    analyses: [deepSeekPublishAnalysis("Agent Harness 补齐恢复与验收证据")],
  });
  globalThis.fetch = deepSeekFetchImpl;

  try {
    const { runIngestion } = await import("../radar/pipeline.mjs");
    const result = await runIngestion({
      trigger: "test",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(fetchImpl),
    });
    const database = openDatabase();
    try {
      const rows = database.prepare("SELECT url, publish_decision FROM articles WHERE url = ?").all(articleUrl)
        .map((row) => ({ url: row.url, publish_decision: row.publish_decision }));
      assert.equal(state.deepSeekCalls, 1, "已有 watch URL 必须允许再次进入 AI 仲裁");
      assert.equal(result.acceptedCount, 1, "晋级 publish 后应计入本轮公开发布");
      assert.deepEqual(rows, [{ url: articleUrl, publish_decision: "publish" }], "同 URL 必须原位晋级而不是重复或继续 watch");
      const { buildSnapshot } = await import("../radar/snapshot.mjs");
      const snapshot = await buildSnapshot(database);
      assert.equal(snapshot.signals.length, 1);
      assert.equal(snapshot.signals[0].sources.some((item) => item.href === articleUrl), true);
    } finally {
      database.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("runIngestion retires a stored watch candidate when later AI review rejects the same URL", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-watch-rejection-"));
  const originalFetch = globalThis.fetch;
  const restoreEnvironment = configurePipelineTestEnvironment(isolatedDataDirectory);
  const feedUrl = "https://www.v2ex.com/feed/programmer.xml";
  const articleUrl = "https://www.v2ex.com/t/999996";
  const candidateName = "Agent Reliability Engineering";
  const publishedAt = new Date(Math.floor((Date.now() - 3_600_000) / 1000) * 1000).toISOString();
  const reviewedPublishedAt = new Date(Math.floor((Date.now() - 1_800_000) / 1000) * 1000).toISOString();
  const source = {
    id: "v2ex-programmer",
    name: "V2EX · 程序员",
    homepage: "https://www.v2ex.com/go/programmer",
    class: "中文社区",
    priority: "P2",
    cadence: "4h",
    focus: "中文 AI Coding · Agent 工具与实践讨论",
    independentGroup: "v2ex",
    layer: "community",
    language: "zh",
  };
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const seedDatabase = openDatabase();
  try {
    upsertSourceCatalog(seedDatabase, [source]);
    assert.equal(insertArticle(seedDatabase, {
      url: articleUrl,
      sourceId: source.id,
      sourceName: source.name,
      sourceClass: source.class,
      independentGroup: source.independentGroup,
      sourceLayer: source.layer,
      sourceLanguage: source.language,
      originalTitle: "Agent Reliability Engineering field note",
      originalExcerpt: "An early community claim awaiting verification.",
      contentText: "An early community claim awaiting verification.",
      publishedAt,
      discoveredAt: publishedAt,
      contentHash: "watch-before-rejection",
      relevanceScore: 7,
      signalSlug: "agent-reliability-engineering-watch",
      conceptSlug: "coding-agent",
      title: "Agent Reliability Engineering 等待验证",
      summary: "初始社区材料相关，但证据不足，先进入候选池等待复核。",
      implication: "后续应重新读取原文，并允许 AI 仲裁撤回失效候选。",
      topic: "概念",
      stage: "Spark",
      accent: "signal",
      tags: ["coding-agent", "reliability"],
      analysisMode: "deepseek",
      publishDecision: "watch",
      editorialScore: 62,
      aiRelevanceScore: 72,
      noveltyScore: 74,
      evidenceScore: 50,
      eventKey: "agent-reliability-engineering:origin",
      candidateConcept: candidateName,
    }), true);
  } finally {
    seedDatabase.close();
  }

  const feedBody = `<?xml version="1.0"?><rss version="2.0"><channel><title>Engineering</title><item><title>Agent Reliability Engineering claim reviewed</title><link>${articleUrl}</link><description>AI coding agent context engineering and tool-call evidence were reviewed again.</description><pubDate>${new Date(reviewedPublishedAt).toUTCString()}</pubDate></item></channel></rss>`;
  const rejectedAnalysis = {
    ...deepSeekPublishAnalysis("Agent Reliability Engineering 候选经复核不成立"),
    publishDecision: "reject",
    candidateConcept: "",
    editorialScore: 35,
    relevanceScore: 62,
    noveltyScore: 28,
    evidenceScore: 30,
  };
  const { fetchImpl, deepSeekFetchImpl, state } = isolatedCatalogFetch({
    feedUrl,
    feedBody,
    articleUrl,
    articleHtml: "<html><body><article><h1>Agent Reliability Engineering claim reviewed</h1><p>The coding-agent claim was rechecked against context engineering, tool-call and recovery evidence, but it remained an unsupported naming proposal.</p></article></body></html>",
    analyses: [rejectedAnalysis],
  });
  globalThis.fetch = deepSeekFetchImpl;

  try {
    const { runIngestion } = await import("../radar/pipeline.mjs");
    const result = await runIngestion({
      trigger: "test",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(fetchImpl),
    });
    const database = openDatabase();
    try {
      const row = database.prepare(`
        SELECT url, publish_decision, candidate_concept, original_title, original_excerpt,
               content_text, content_hash, relevance_score, published_at
        FROM articles
        WHERE url = ?
      `).get(articleUrl);
      const { buildSnapshot } = await import("../radar/snapshot.mjs");
      const snapshot = await buildSnapshot(database);

      assert.equal(state.deepSeekCalls, 1, "已有 watch URL 必须真实进入下一轮 AI 复核");
      assert.equal(result.acceptedCount, 0, "reject 不能计入公开发布");
      assert.ok(row, "被否决的候选仍须保留一条数据库审计记录");
      assert.equal(row.publish_decision, "reject", "AI 否决必须原位退休旧 watch 状态");
      assert.equal(row.original_title, "Agent Reliability Engineering claim reviewed", "审计行必须保存本轮复核标题");
      assert.match(row.content_text, /unsupported naming proposal/, "审计行必须保存本轮重新抓取的正文");
      assert.equal(row.published_at, reviewedPublishedAt, "审计行必须保存本轮复核材料的发布时间");
      assert.notEqual(row.content_hash, "watch-before-rejection", "审计行内容哈希必须来自本轮复核材料");
      const { contentHash } = await import("../radar/fetch.mjs");
      assert.equal(
        row.content_hash,
        contentHash(row.original_title, row.original_excerpt, row.content_text),
        "审计行内容哈希必须与本轮原始标题、摘要和正文一致",
      );
      assert.notEqual(Number(row.relevance_score), 7, "审计行相关性必须刷新为本轮复核分数");
      assert.equal(
        snapshot.candidateConcepts.some((candidate) => candidate.name === candidateName),
        false,
        "已退休候选不能继续出现在 candidateConcepts",
      );
      assert.deepEqual(snapshot.signals, [], "被否决候选不能出现在公开信号中");
    } finally {
      database.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("reject is terminal for discovery and clustering only considers published evidence", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-terminal-reject-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const {
    articleExists,
    getRecentClusterCandidates,
    insertArticle,
    openDatabase,
    upsertSourceCatalog,
  } = await import("../radar/database.mjs");
  const database = openDatabase();
  const source = {
    id: "terminal-state-source",
    name: "Terminal State Source",
    homepage: "https://example.com/source",
    class: "一手工程",
    priority: "P0",
    cadence: "4h",
    focus: "Agent engineering",
    independentGroup: "terminal-state-source",
  };
  const article = (decision) => ({
    url: `https://example.com/${decision}`,
    sourceId: source.id,
    sourceName: source.name,
    sourceClass: source.class,
    independentGroup: source.independentGroup,
    originalTitle: `${decision} Agent Harness evidence`,
    originalExcerpt: `${decision} evidence excerpt`,
    contentText: `${decision} evidence content`,
    publishedAt: "2026-08-02T00:00:00.000Z",
    discoveredAt: "2026-08-02T01:00:00.000Z",
    contentHash: `${decision}-hash`,
    relevanceScore: 9,
    signalSlug: `terminal-${decision}`,
    conceptSlug: "agent-harness",
    title: `${decision} analysis`,
    summary: "A sufficiently long audit summary for terminal-state testing.",
    implication: "A sufficiently long engineering implication for terminal-state testing.",
    topic: "工程",
    stage: "Emerging",
    accent: "engineering",
    tags: ["agent-harness"],
    analysisMode: "deepseek",
    publishDecision: decision,
    editorialScore: 70,
    aiRelevanceScore: 80,
    noveltyScore: 70,
    evidenceScore: 70,
    eventKey: `terminal:${decision}`,
    candidateConcept: decision === "watch" ? "Pending Agent Pattern" : "",
  });

  try {
    upsertSourceCatalog(database, [source]);
    for (const decision of ["publish", "watch", "reject"]) {
      assert.equal(insertArticle(database, article(decision)), true);
    }

    assert.equal(articleExists(database, "https://example.com/publish"), true, "publish 是终态，不能重复抓取");
    assert.equal(articleExists(database, "https://example.com/reject"), true, "reject 是终态，不能在每轮采集反复送 AI");
    assert.equal(articleExists(database, "https://example.com/watch"), false, "watch 不是终态，必须允许后续复核");
    const terminalSignals = getRecentClusterCandidates(database, "2026-08-01T00:00:00.000Z")
      .map((row) => row.signal_slug)
      .filter((slug) => slug.startsWith("terminal-"));
    assert.deepEqual(terminalSignals, ["terminal-publish"], "聚类只能使用 publish 证据，watch/reject 均不得影响信号归并");
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("SQLite article writes are idempotent", async () => {
  const { beginRun, finishRun, insertArticle, openDatabase, updateSourceHealth, upsertSourceCatalog } = await import("../radar/database.mjs");
  const database = openDatabase();
  upsertSourceCatalog(database, [{
    id: "test-source", name: "Test", homepage: "https://example.com", class: "一手工程",
    priority: "P0", cadence: "4h", focus: "Agent", independentGroup: "test",
  }]);
  const signalSlug = chooseSignalSlug(
    { title: "Agent Harness release" },
    { conceptSlug: "agent-harness", tags: ["agent-harness"] },
    [],
  );
  assert.match(signalSlug, /^agent-harness-[a-f0-9]{10}$/);
  const article = {
    url: "https://example.com/agent", sourceId: "test-source", sourceName: "Test", sourceClass: "一手工程",
    independentGroup: "test", originalTitle: "Agent Harness", originalExcerpt: "Evidence", contentText: "Evidence",
    publishedAt: "2026-08-01T00:00:00.000Z", discoveredAt: "2026-08-01T01:00:00.000Z", contentHash: "hash",
    relevanceScore: 10, signalSlug, conceptSlug: "agent-harness", title: "智能体运行底座新增恢复能力",
    summary: "该工程记录验证了智能体运行底座的核心能力与证据链。", implication: "工程团队应据此评估恢复机制并补充相应运行验证。",
    topic: "工程", stage: "Validated", accent: "engineering", tags: ["agent-harness"], analysisMode: "deepseek",
  };
  assert.equal(insertArticle(database, article), true);
  assert.equal(insertArticle(database, article), false);
  const finishedAt = new Date().toISOString();
  const runId = beginRun(database, "test", "2026-08-01T00:00:00.000Z", "deepseek");
  finishRun(database, runId, {
    finishedAt, status: "success", fetchedCount: 1, acceptedCount: 1,
    skippedCount: 0, errorCount: 0, analysisMode: "deepseek", message: "test",
  });
  updateSourceHealth(database, { id: "test-source" }, {
    attemptedAt: finishedAt, status: "success", error: null, itemCount: 1,
  });
  const { buildSnapshot, writeSnapshotAtomic } = await import("../radar/snapshot.mjs");
  const snapshot = await buildSnapshot(database);
  await writeSnapshotAtomic(snapshot);
  assert.equal(snapshot.status.mode, "live");
  assert.equal(snapshot.status.runStatus, "success");
  assert.equal(snapshot.status.analysisMode, "deepseek");
  assert.equal(snapshot.signals.length, 1);
  assert.equal(snapshot.signals[0].slug, signalSlug);
  assert.equal(snapshot.signals[0].conceptSlug, "agent-harness");
  assert.deepEqual(
    snapshot.signals[0].sources.map(({ name, href }) => ({ name, href })),
    [{ name: "Test", href: "https://example.com/agent" }],
  );
  assert.deepEqual(
    {
      layer: snapshot.signals[0].sources[0].layer,
      language: snapshot.signals[0].sources[0].language,
      originalTitle: snapshot.signals[0].sources[0].originalTitle,
      publishedAt: snapshot.signals[0].sources[0].publishedAt,
    },
    {
      layer: "official",
      language: "en",
      originalTitle: "Agent Harness",
      publishedAt: "2026-08-01T00:00:00.000Z",
    },
  );
  database.close();
});

test("snapshot withholds rules-only English display prose until LLM backfill succeeds", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-english-rules-hidden-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { buildSnapshot } = await import("../radar/snapshot.mjs");
  const database = openDatabase();
  const source = {
    id: "english-rules-official",
    name: "Official Runtime Team",
    homepage: "https://example.com/runtime",
    class: "一手工程",
    priority: "P0",
    cadence: "4h",
    focus: "Agent Harness",
    independentGroup: "english-rules-official",
    layer: "official",
    language: "en",
  };
  try {
    upsertSourceCatalog(database, [source]);
    assert.equal(insertArticle(database, {
      url: "https://example.com/runtime/english-rules",
      sourceId: source.id,
      sourceName: source.name,
      sourceClass: source.class,
      independentGroup: source.independentGroup,
      sourceLayer: source.layer,
      sourceLanguage: source.language,
      originalTitle: "Agent Harness adds durable checkpoint recovery",
      originalExcerpt: "Official evidence for checkpoints and tool-call replay.",
      contentText: "Official evidence for checkpoints and tool-call replay.",
      publishedAt: "2026-08-02T01:00:00.000Z",
      discoveredAt: "2026-08-02T01:05:00.000Z",
      contentHash: "english-rules-only",
      relevanceScore: 10,
      signalSlug: "english-rules-only-signal",
      conceptSlug: "agent-harness",
      title: "Agent Harness adds durable checkpoint recovery",
      summary: "The runtime now persists checkpoints and replays failed tool calls.",
      implication: "Teams should validate restart safety and permission boundaries.",
      topic: "工程",
      stage: "Emerging",
      accent: "engineering",
      tags: ["agent-harness", "durable-execution"],
      analysisMode: "rules",
      publishDecision: "publish",
    }), true);

    const snapshot = await buildSnapshot(database);
    assert.equal(
      snapshot.signals.some((signal) => signal.slug === "english-rules-only-signal"),
      false,
      "尚未完成中文 LLM 编辑的英文 rules 记录不能进入公开信号",
    );
    const row = database.prepare("SELECT original_title, original_excerpt, content_text, url FROM articles WHERE signal_slug = ?").get("english-rules-only-signal");
    assert.equal(row.original_title, "Agent Harness adds durable checkpoint recovery", "隐藏公开展示不能删除原始证据");
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("historical analysis backfill repairs rules and invalid legacy LLM rows without rerunning ready LLM editing", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-legacy-editorial-repair-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { runAnalysisBackfill } = await import("../radar/backfill.mjs");
  const { isLlmEditorialReady } = await import("../radar/editorial.mjs");
  const database = openDatabase();
  const source = {
    id: "legacy-editorial-source",
    name: "Historical Editorial Source",
    homepage: "https://legacy-editorial.example.com",
    class: "一手工程",
    priority: "P0",
    cadence: "4h",
    focus: "Agent Harness",
    independentGroup: "legacy-editorial-source",
    layer: "official",
    language: "en",
  };
  const invalidSummary = "The historical model output copied the English source instead of producing a Chinese editorial synthesis.";
  const invalidImplication = "Engineering teams should validate recovery and permission boundaries before production use.";
  const rows = [
    {
      id: "legacy-rules",
      analysisMode: "rules",
      title: "Agent Skills for .NET is now released 正式发布",
      summary: invalidSummary,
      implication: invalidImplication,
      shouldBackfill: true,
    },
    {
      id: "legacy-invalid-deepseek",
      analysisMode: "deepseek",
      title: "Agent Skills for .NET is now released 正式发布",
      summary: invalidSummary,
      implication: invalidImplication,
      shouldBackfill: true,
    },
    {
      id: "legacy-invalid-openai",
      analysisMode: "openai",
      title: "Agent Framework release analysis remains in English 需要重做",
      summary: invalidSummary,
      implication: invalidImplication,
      shouldBackfill: true,
    },
    {
      id: "legacy-ready-deepseek",
      analysisMode: "deepseek",
      ...deepSeekPublishAnalysis("历史 DeepSeek 中文分析保持有效"),
      shouldBackfill: false,
    },
    {
      id: "legacy-ready-openai",
      analysisMode: "openai",
      ...deepSeekPublishAnalysis("历史 OpenAI 中文分析保持有效"),
      shouldBackfill: false,
    },
  ].map((row, index) => ({
    ...row,
    url: `https://legacy-editorial.example.com/${row.id}`,
    originalTitle: `Original evidence title ${index + 1}`,
    originalExcerpt: `Original evidence excerpt ${index + 1}`,
    contentText: `Original evidence body ${index + 1} with checkpoints, approvals, and tool calls.`,
    contentHash: `legacy-editorial-content-${index + 1}`,
  }));
  try {
    upsertSourceCatalog(database, [source]);
    for (const [index, row] of rows.entries()) {
      assert.equal(insertArticle(database, {
        url: row.url,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        sourceLayer: source.layer,
        sourceLanguage: source.language,
        originalTitle: row.originalTitle,
        originalExcerpt: row.originalExcerpt,
        contentText: row.contentText,
        publishedAt: `2026-08-02T0${index + 1}:00:00.000Z`,
        discoveredAt: `2026-08-02T0${index + 1}:05:00.000Z`,
        contentHash: row.contentHash,
        relevanceScore: 10,
        signalSlug: row.id,
        conceptSlug: "agent-harness",
        title: row.title,
        summary: row.summary,
        implication: row.implication,
        topic: "工程",
        stage: "Emerging",
        accent: "engineering",
        tags: ["agent-harness"],
        analysisMode: row.analysisMode,
        publishDecision: "publish",
      }), true);
    }

    const readyRows = rows.filter((row) => !row.shouldBackfill);
    const readyBefore = new Map(readyRows.map((row) => [
      row.url,
      { ...database.prepare("SELECT * FROM articles WHERE url = ?").get(row.url) },
    ]));

    const analysisCalls = [];
    const result = await runAnalysisBackfill({
      database,
      concurrency: 2,
      logger: { info() {}, warn() {}, error() {} },
      analyze: async (item) => {
        analysisCalls.push(item.url);
        const row = rows.find((candidate) => candidate.url === item.url);
        assert.ok(row?.shouldBackfill, "回填不得调用已经通过当前中文门禁的旧 LLM 记录");
        assert.deepEqual({
          title: item.title,
          excerpt: item.excerpt,
          contentText: item.contentText,
        }, {
          title: row.originalTitle,
          excerpt: row.originalExcerpt,
          contentText: row.contentText,
        }, "重分析输入必须来自原始证据，不能把旧展示文案当作原文");
        return {
          ...deepSeekPublishAnalysis("历史记录已完成中文重新分析"),
          analysisMode: "deepseek",
        };
      },
    });

    const expectedBackfillUrls = rows.filter((row) => row.shouldBackfill).map((row) => row.url);
    assert.deepEqual(new Set(analysisCalls), new Set(expectedBackfillUrls), "候选必须包含 rules 与所有未通过当前中文门禁的旧 LLM 行");
    assert.equal(result.backlogCount, expectedBackfillUrls.length);
    assert.equal(result.updatedCount, expectedBackfillUrls.length);
    assert.equal(result.failedCount, 0);

    for (const row of rows.filter((candidate) => candidate.shouldBackfill)) {
      const stored = database.prepare("SELECT * FROM articles WHERE url = ?").get(row.url);
      assert.equal(isLlmEditorialReady(stored), true, `${row.id} 回填后必须通过当前中文 LLM 门禁`);
      assert.deepEqual({
        originalTitle: stored.original_title,
        originalExcerpt: stored.original_excerpt,
        contentText: stored.content_text,
        contentHash: stored.content_hash,
      }, {
        originalTitle: row.originalTitle,
        originalExcerpt: row.originalExcerpt,
        contentText: row.contentText,
        contentHash: row.contentHash,
      }, `${row.id} 回填只能更新编辑结果，不能覆盖原始证据`);
    }
    for (const row of readyRows) {
      const stored = database.prepare("SELECT * FROM articles WHERE url = ?").get(row.url);
      assert.deepEqual({ ...stored }, readyBefore.get(row.url), `${row.id} 已合格，必须逐字段保持不变`);
    }

    let repeatedCalls = 0;
    const repeated = await runAnalysisBackfill({
      database,
      concurrency: 2,
      logger: { info() {}, warn() {}, error() {} },
      analyze: async () => {
        repeatedCalls += 1;
        return { ...deepSeekPublishAnalysis("幂等复跑不应执行"), analysisMode: "deepseek" };
      },
    });
    assert.equal(repeatedCalls, 0, "全部记录合格后复跑必须保持幂等");
    assert.equal(repeated.backlogCount, 0);
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("snapshot representative prefers Chinese LLM editing without weakening source-layer evidence", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-llm-representative-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { buildSnapshot } = await import("../radar/snapshot.mjs");
  const database = openDatabase();
  const signalSlug = "agent-harness-bilingual-representative";
  const sources = [
    {
      id: "representative-official",
      name: "Official Runtime Team",
      homepage: "https://official.example.com",
      class: "一手工程",
      priority: "P0",
      cadence: "4h",
      focus: "Agent Harness",
      independentGroup: "representative-official",
      layer: "official",
      language: "en",
    },
    {
      id: "representative-community",
      name: "Agent Engineering Community",
      homepage: "https://community.example.com",
      class: "英文社区",
      priority: "P2",
      cadence: "4h",
      focus: "Agent Harness",
      independentGroup: "representative-community",
      layer: "community",
      language: "en",
    },
  ];
  try {
    upsertSourceCatalog(database, sources);
    const base = {
      relevanceScore: 10,
      signalSlug,
      conceptSlug: "agent-harness",
      topic: "工程",
      stage: "Emerging",
      accent: "engineering",
      tags: ["agent-harness", "durable-execution"],
      publishDecision: "publish",
    };
    assert.equal(insertArticle(database, {
      ...base,
      url: "https://official.example.com/runtime-update",
      sourceId: sources[0].id,
      sourceName: sources[0].name,
      sourceClass: sources[0].class,
      independentGroup: sources[0].independentGroup,
      sourceLayer: sources[0].layer,
      sourceLanguage: sources[0].language,
      originalTitle: "Agent Harness adds durable recovery",
      originalExcerpt: "Official implementation evidence.",
      contentText: "Official implementation evidence.",
      publishedAt: "2026-08-02T01:00:00.000Z",
      discoveredAt: "2026-08-02T01:05:00.000Z",
      contentHash: "representative-official-rules",
      title: "Agent Harness adds durable recovery",
      summary: "The official runtime persists checkpoints and replays tool calls.",
      implication: "Teams should verify recovery before deployment.",
      analysisMode: "rules",
      editorialScore: 90,
      evidenceScore: 90,
    }), true);
    assert.equal(insertArticle(database, {
      ...base,
      url: "https://community.example.com/runtime-review",
      sourceId: sources[1].id,
      sourceName: sources[1].name,
      sourceClass: sources[1].class,
      independentGroup: sources[1].independentGroup,
      sourceLayer: sources[1].layer,
      sourceLanguage: sources[1].language,
      originalTitle: "Independent review of Agent Harness recovery",
      originalExcerpt: "Independent review evidence.",
      contentText: "Independent review evidence.",
      publishedAt: "2026-08-02T01:10:00.000Z",
      discoveredAt: "2026-08-02T01:15:00.000Z",
      contentHash: "representative-community-deepseek",
      title: "Agent Harness 补充可恢复执行证据",
      summary: "独立材料说明检查点、工具调用重放与失败恢复机制，但仍需继续验证生产采用情况。",
      implication: "应把中断恢复、幂等重试和权限边界纳入发布前验收。",
      analysisMode: "deepseek",
      editorialScore: 75,
      evidenceScore: 50,
    }), true);

    const snapshot = await buildSnapshot(database);
    const signal = snapshot.signals.find((item) => item.slug === signalSlug);
    assert.ok(signal);
    assert.equal(signal.title, "Agent Harness 补充可恢复执行证据", "官方来源层级不能让 rules 英文展示覆盖 LLM 中文编辑");
    assert.equal(signal.analysisMode, "deepseek");
    assert.deepEqual(signal.sourceMix, { official: 1, practitioner: 0, community: 1 }, "证据层级仍须独立参与可信度计算");
    assert.equal(signal.verificationState, "cross-verified");
    assert.equal(signal.confidence, "较高");
    assert.deepEqual(signal.representativeSource, {
      name: sources[1].name,
      href: "https://community.example.com/runtime-review",
      layer: "community",
      originalTitle: "Independent review of Agent Harness recovery",
      language: "en",
      publishedAt: "2026-08-02T01:10:00.000Z",
    }, "代表文章必须以独立字段绑定生成中文标题、摘要和工程解读的原文");
    assert.equal(signal.sources[0].href, "https://official.example.com/runtime-update", "sources 必须继续按证据权威排序，不能让社区 representative 挤到官方来源前");
    assert.equal(signal.sources[0].layer, "official");
    assert.deepEqual(new Set(signal.sources.map((source) => source.href)), new Set([
      "https://official.example.com/runtime-update",
      "https://community.example.com/runtime-review",
    ]));
    assert.ok(
      signal.sources.some((source) => source.href === "https://official.example.com/runtime-update" && source.layer === "official"),
      "representative 置顶不能删除或降级官方原文证据",
    );
    assert.ok(
      signal.evidence.some((node) => node.label === sources[0].name),
      "官方来源仍必须进入证据节点，而不是依赖 sources[0] 表达可信度",
    );
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("LLM analysis backfill preserves source evidence, resumes failures, and is idempotent", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-analysis-backfill-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const database = openDatabase();
  const source = {
    id: "backfill-official",
    name: "Official Agent Runtime",
    homepage: "https://backfill.example.com",
    class: "一手工程",
    priority: "P0",
    cadence: "4h",
    focus: "Agent Harness",
    independentGroup: "backfill-official",
    layer: "official",
    language: "en",
  };
  const rows = [
    {
      url: "https://backfill.example.com/recovery-a",
      originalTitle: "Agent Harness recovery note A",
      originalExcerpt: "English source excerpt A with checkpoints and tool calls.",
      contentText: "English source body A documents checkpoints, tool calls, approvals, and replay.",
      contentHash: "backfill-source-hash-a",
      signalSlug: "backfill-signal-a",
    },
    {
      url: "https://backfill.example.com/recovery-b",
      originalTitle: "Agent Harness recovery note B",
      originalExcerpt: "English source excerpt B with checkpoints and tool calls.",
      contentText: "English source body B documents checkpoints, tool calls, approvals, and replay.",
      contentHash: "backfill-source-hash-b",
      signalSlug: "backfill-signal-b",
    },
  ];

  try {
    upsertSourceCatalog(database, [source]);
    for (const [index, row] of rows.entries()) {
      assert.equal(insertArticle(database, {
        ...row,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        sourceLayer: source.layer,
        sourceLanguage: source.language,
        publishedAt: `2026-08-02T0${index + 1}:00:00.000Z`,
        discoveredAt: `2026-08-02T0${index + 1}:05:00.000Z`,
        relevanceScore: 10,
        conceptSlug: "agent-harness",
        title: row.originalTitle,
        summary: row.originalExcerpt,
        implication: "Teams should validate recovery before production use.",
        topic: "工程",
        stage: "Emerging",
        accent: "engineering",
        tags: ["agent-harness", "durable-execution"],
        analysisMode: "rules",
        publishDecision: "publish",
        editorialScore: 70,
        aiRelevanceScore: 80,
        noveltyScore: 60,
        evidenceScore: 90,
        eventKey: `backfill:event-${index + 1}`,
        candidateConcept: "",
      }), true);
    }
    const beforeFailure = database.prepare("SELECT * FROM articles WHERE url = ?").get(rows[1].url);
    const { runAnalysisBackfill } = await import("../radar/backfill.mjs");
    assert.equal(typeof runAnalysisBackfill, "function", "历史规则记录必须有显式批量回填入口");
    const firstCalls = [];
    await runAnalysisBackfill({
      database,
      concurrency: 2,
      logger: { info() {}, warn() {}, error() {} },
      analyze: async (item) => {
        firstCalls.push(item.url);
        const sourceRow = rows.find((row) => row.url === item.url);
        assert.ok(sourceRow, "回填只能读取待处理的历史 rules publish 记录");
        assert.deepEqual({
          url: item.url,
          title: item.title,
          excerpt: item.excerpt,
          contentText: item.contentText,
        }, {
          url: sourceRow.url,
          title: sourceRow.originalTitle,
          excerpt: sourceRow.originalExcerpt,
          contentText: sourceRow.contentText,
        }, "LLM 输入必须来自保留的原始证据字段");
        if (item.url === rows[1].url) throw new Error("temporary provider failure");
        return { ...deepSeekPublishAnalysis("Agent Harness 回填可恢复执行分析"), analysisMode: "deepseek" };
      },
    });
    assert.deepEqual(new Set(firstCalls), new Set(rows.map((row) => row.url)), "本轮不能用发布上限截断待回填 LLM 调用");

    const successful = database.prepare("SELECT * FROM articles WHERE url = ?").get(rows[0].url);
    const failed = database.prepare("SELECT * FROM articles WHERE url = ?").get(rows[1].url);
    assert.equal(successful.analysis_mode, "deepseek");
    assert.equal(successful.title, "Agent Harness 回填可恢复执行分析");
    assert.deepEqual({
      url: successful.url,
      originalTitle: successful.original_title,
      originalExcerpt: successful.original_excerpt,
      contentText: successful.content_text,
      contentHash: successful.content_hash,
    }, {
      url: rows[0].url,
      originalTitle: rows[0].originalTitle,
      originalExcerpt: rows[0].originalExcerpt,
      contentText: rows[0].contentText,
      contentHash: rows[0].contentHash,
    }, "成功回填只能更新分析字段，不能改 URL 或原始证据");
    for (const field of ["title", "summary", "implication", "analysis_mode", "original_title", "original_excerpt", "content_text", "content_hash"]) {
      assert.equal(failed[field], beforeFailure[field], `失败回填不得覆盖旧字段 ${field}`);
    }

    const { buildSnapshot } = await import("../radar/snapshot.mjs");
    const firstSnapshot = await buildSnapshot(database);
    const publicSignal = firstSnapshot.signals.find((signal) => signal.slug === rows[0].signalSlug);
    assert.ok(publicSignal, "成功回填后信号必须恢复公开展示");
    assert.equal(publicSignal.title, "Agent Harness 回填可恢复执行分析");
    assert.equal(publicSignal.sources[0].href, rows[0].url, "中文展示必须保留原文跳转链接");
    assert.equal(firstSnapshot.signals.some((signal) => signal.slug === rows[1].signalSlug), false, "失败的英文 rules 记录仍不能公开");

    const resumeCalls = [];
    await runAnalysisBackfill({
      database,
      concurrency: 2,
      logger: { info() {}, warn() {}, error() {} },
      analyze: async (item) => {
        resumeCalls.push(item.url);
        return { ...deepSeekPublishAnalysis("Agent Harness 补齐第二条中文分析"), analysisMode: "deepseek" };
      },
    });
    assert.deepEqual(resumeCalls, [rows[1].url], "恢复执行只能重试失败记录，不能重复消费已成功回填项");

    let thirdRunCalls = 0;
    await runAnalysisBackfill({
      database,
      concurrency: 2,
      logger: { info() {}, warn() {}, error() {} },
      analyze: async () => {
        thirdRunCalls += 1;
        return { ...deepSeekPublishAnalysis("不应执行"), analysisMode: "deepseek" };
      },
    });
    assert.equal(thirdRunCalls, 0, "所有规则记录完成后再次执行必须幂等为空操作");
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("LLM analysis backfill honors configurable concurrency, has no item cap, and rejects parallel reentry", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-backfill-concurrency-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const database = openDatabase();
  const source = {
    id: "backfill-concurrency-source",
    name: "Backfill Source",
    homepage: "https://backfill-concurrency.example.com",
    class: "一手工程",
    priority: "P0",
    cadence: "4h",
    focus: "Agent Harness",
    independentGroup: "backfill-concurrency-source",
  };
  const seedRuleArticle = (index) => insertArticle(database, {
    url: `https://backfill-concurrency.example.com/article-${index}`,
    sourceId: source.id,
    sourceName: source.name,
    sourceClass: source.class,
    independentGroup: source.independentGroup,
    sourceLayer: "official",
    sourceLanguage: "en",
    originalTitle: `Agent Harness backfill article ${index}`,
    originalExcerpt: "English recovery evidence.",
    contentText: "English checkpoint, approval, and tool-call recovery evidence.",
    publishedAt: `2026-08-02T${String(index).padStart(2, "0")}:00:00.000Z`,
    discoveredAt: `2026-08-02T${String(index).padStart(2, "0")}:05:00.000Z`,
    contentHash: `backfill-concurrency-${index}`,
    relevanceScore: 10,
    signalSlug: `backfill-concurrency-signal-${index}`,
    conceptSlug: "agent-harness",
    title: `Agent Harness backfill article ${index}`,
    summary: "English recovery evidence.",
    implication: "Validate recovery before production use.",
    topic: "工程",
    stage: "Emerging",
    accent: "engineering",
    tags: ["agent-harness"],
    analysisMode: "rules",
    publishDecision: "publish",
  });

  try {
    upsertSourceCatalog(database, [source]);
    for (let index = 1; index <= 5; index += 1) assert.equal(seedRuleArticle(index), true);
    const { runAnalysisBackfill } = await import("../radar/backfill.mjs");
    let active = 0;
    let maximumActive = 0;
    let calls = 0;
    await runAnalysisBackfill({
      database,
      concurrency: 2,
      logger: { info() {}, warn() {}, error() {} },
      analyze: async () => {
        calls += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { ...deepSeekPublishAnalysis(`第 ${calls} 条回填中文分析`), analysisMode: "deepseek" };
      },
    });
    assert.equal(calls, 5, "一次显式回填必须处理全部待回填记录，不能套用采集发布上限");
    assert.equal(maximumActive, 2, "回填必须严格遵守可配置并发");

    assert.equal(seedRuleArticle(6), true);
    let releaseFirst;
    let markStarted;
    const firstStarted = new Promise((resolve) => { markStarted = resolve; });
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const running = runAnalysisBackfill({
      database,
      concurrency: 1,
      logger: { info() {}, warn() {}, error() {} },
      analyze: async () => {
        markStarted();
        await firstGate;
        return { ...deepSeekPublishAnalysis("第六条回填中文分析"), analysisMode: "deepseek" };
      },
    });
    await firstStarted;
    try {
      await assert.rejects(runAnalysisBackfill({
        database,
        concurrency: 1,
        logger: { info() {}, warn() {}, error() {} },
        analyze: async () => ({ ...deepSeekPublishAnalysis("并行重入不应执行"), analysisMode: "deepseek" }),
      }), /backfill|回填|运行|重入|lock|busy/i, "同一数据库的回填任务不能并行重入");
    } finally {
      releaseFirst();
    }
    await running;
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

for (const casScenario of [
  {
    name: "raw content hash changes",
    mutate(database, row) {
      database.prepare(`
        UPDATE articles
        SET content_hash = ?, title = ?, summary = ?, implication = ?
        WHERE url = ?
      `).run(
        "cas-content-hash-v2",
        "另一采集流程保留的新标题",
        "另一采集流程已经写入了更新后的中文摘要，旧分析不得覆盖。",
        "应基于新的原始内容重新分析，而不是提交过期分析结果。",
        row.url,
      );
    },
    expected: {
      contentHash: "cas-content-hash-v2",
      title: "另一采集流程保留的新标题",
      analysisMode: "rules",
    },
  },
  {
    name: "editorial fields change without a content hash change",
    mutate(database, row) {
      database.prepare(`
        UPDATE articles
        SET title = ?, summary = ?, implication = ?, analysis_mode = ?
        WHERE url = ?
      `).run(
        "另一模型已经提交可恢复任务分析",
        "另一模型已经基于相同原文提交完整中文摘要，过期回填不得覆盖。",
        "保留先完成的有效编辑结果，避免并发任务发生最后写入者覆盖。",
        "openai",
        row.url,
      );
    },
    expected: {
      contentHash: "cas-content-hash-v1",
      title: "另一模型已经提交可恢复任务分析",
      analysisMode: "openai",
    },
  },
]) {
  test(`analysis backfill CAS rejects stale writes when ${casScenario.name}`, async () => {
    const previousDataDirectory = process.env.RADAR_DATA_DIR;
    const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-backfill-cas-"));
    process.env.RADAR_DATA_DIR = isolatedDataDirectory;
    const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
    const databaseA = openDatabase();
    const databaseB = openDatabase();
    const source = {
      id: "backfill-cas-source",
      name: "Backfill CAS Source",
      homepage: "https://backfill-cas.example.com",
      class: "一手工程",
      priority: "P0",
      cadence: "4h",
      focus: "Agent Harness",
      independentGroup: "backfill-cas-source",
    };
    const row = {
      url: "https://backfill-cas.example.com/recovery",
      contentHash: "cas-content-hash-v1",
    };
    try {
      upsertSourceCatalog(databaseA, [source]);
      assert.equal(insertArticle(databaseA, {
        url: row.url,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        sourceLayer: "official",
        sourceLanguage: "en",
        originalTitle: "Agent Harness recovery note",
        originalExcerpt: "English recovery evidence.",
        contentText: "English checkpoints, approvals, and tool-call replay evidence.",
        publishedAt: "2026-08-02T01:00:00.000Z",
        discoveredAt: "2026-08-02T01:05:00.000Z",
        contentHash: row.contentHash,
        relevanceScore: 10,
        signalSlug: "backfill-cas-signal",
        conceptSlug: "agent-harness",
        title: "Agent Harness recovery note",
        summary: "English recovery evidence.",
        implication: "Validate recovery before production use.",
        topic: "工程",
        stage: "Emerging",
        accent: "engineering",
        tags: ["agent-harness"],
        analysisMode: "rules",
        publishDecision: "publish",
      }), true);

      const { runAnalysisBackfill } = await import("../radar/backfill.mjs");
      let announceStarted;
      let releaseAnalysis;
      const started = new Promise((resolve) => { announceStarted = resolve; });
      const gate = new Promise((resolve) => { releaseAnalysis = resolve; });
      const running = runAnalysisBackfill({
        database: databaseA,
        concurrency: 1,
        logger: { info() {}, warn() {}, error() {} },
        analyze: async () => {
          announceStarted();
          await gate;
          return { ...deepSeekPublishAnalysis("过期回填不应覆盖并发更新"), analysisMode: "deepseek" };
        },
      });
      await started;
      casScenario.mutate(databaseB, row);
      releaseAnalysis();
      const result = await running;

      assert.equal(result.updatedCount, 0, "读取之后发生并发变化时不能提交过期 LLM 结果");
      assert.equal(result.conflictCount, 1, "并发变化必须作为 CAS conflict 明确返回");
      const stored = databaseB.prepare("SELECT content_hash, title, analysis_mode FROM articles WHERE url = ?").get(row.url);
      assert.deepEqual({ ...stored }, {
        content_hash: casScenario.expected.contentHash,
        title: casScenario.expected.title,
        analysis_mode: casScenario.expected.analysisMode,
      }, "CAS 未命中时必须完整保留另一连接已经提交的记录");
    } finally {
      databaseB.close();
      databaseA.close();
      if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
      else process.env.RADAR_DATA_DIR = previousDataDirectory;
      await rm(isolatedDataDirectory, { recursive: true, force: true });
    }
  });
}

test("snapshot source health only includes the current enabled catalog after catalog shrink", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-catalog-shrink-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const { openDatabase, updateSourceHealth, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { buildSnapshot } = await import("../radar/snapshot.mjs");
  const database = openDatabase();
  const legacySource = {
    id: "retired-community-source",
    name: "Retired Community Source",
    homepage: "https://retired.example.com",
    class: "英文社区",
    priority: "P2",
    cadence: "8h",
    focus: "Historical community source",
    independentGroup: "retired-community-source",
    layer: "community",
    language: "en",
  };
  const currentSource = {
    id: "current-official-source",
    name: "Current Official Source",
    homepage: "https://current.example.com",
    class: "一手工程",
    priority: "P0",
    cadence: "4h",
    focus: "Current Agent engineering source",
    independentGroup: "current-official-source",
    layer: "official",
    language: "en",
  };

  try {
    upsertSourceCatalog(database, [legacySource]);
    updateSourceHealth(database, legacySource, {
      attemptedAt: new Date().toISOString(),
      status: "success",
      error: null,
      itemCount: 3,
    });

    upsertSourceCatalog(database, [currentSource]);
    updateSourceHealth(database, currentSource, {
      attemptedAt: new Date().toISOString(),
      status: "success",
      error: null,
      itemCount: 1,
    });

    const snapshot = await buildSnapshot(database);
    assert.deepEqual(
      {
        sourceCount: snapshot.status.sourceCount,
        healthySourceCount: snapshot.status.healthySourceCount,
        sourceIds: snapshot.sources.map((source) => source.id),
      },
      {
        sourceCount: 1,
        healthySourceCount: 1,
        sourceIds: [currentSource.id],
      },
      "来源统计与列表必须精确反映本次启用 catalog，不能受历史健康记录影响",
    );
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("openDatabase repairs NULL configured_provider left by an interrupted migration", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-interrupted-provider-migration-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const { DatabaseSync } = await import("node:sqlite");
  const databasePath = path.join(isolatedDataDirectory, "agent-radar.sqlite");
  const interruptedDatabase = new DatabaseSync(databasePath);
  try {
    interruptedDatabase.exec(`
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        fetched_count INTEGER NOT NULL DEFAULT 0,
        accepted_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        analysis_mode TEXT NOT NULL DEFAULT 'rules',
        configured_provider TEXT,
        message TEXT
      );
      INSERT INTO runs (
        trigger, started_at, finished_at, status, analysis_mode, configured_provider
      ) VALUES (
        'systemd', '2026-08-01T00:00:00.000Z', '2026-08-01T00:01:00.000Z', 'success', 'deepseek', NULL
      );
    `);
  } finally {
    interruptedDatabase.close();
  }

  try {
    const { openDatabase } = await import("../radar/database.mjs");
    const repairedDatabase = openDatabase();
    try {
      const row = repairedDatabase.prepare("SELECT analysis_mode, configured_provider FROM runs WHERE id = 1").get();
      assert.equal(row.analysis_mode, "deepseek");
      assert.equal(row.configured_provider, "deepseek", "列已存在但值为 NULL 时也必须完成幂等回填");
      assert.equal(
        repairedDatabase.prepare("SELECT COUNT(*) AS count FROM runs WHERE configured_provider IS NULL").get().count,
        0,
        "openDatabase 返回前不得遗留 nullable configured_provider",
      );
    } finally {
      repairedDatabase.close();
    }
  } finally {
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("snapshot preserves deduplicated LLM concept candidates without promoting them to established concepts", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-candidate-concepts-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { buildSnapshot } = await import("../radar/snapshot.mjs");
  const database = openDatabase();
  const candidateName = "Agent Reliability Engineering";
  const signalSlug = "agent-reliability-engineering-candidate";
  const sources = [
    {
      id: "candidate-practitioner",
      name: "Independent Agent Engineer",
      homepage: "https://practitioner.example.com",
      class: "实践者",
      priority: "P1",
      cadence: "8h",
      focus: candidateName,
      independentGroup: "candidate-practitioner",
      layer: "practitioner",
      language: "en",
      articleUrl: "https://practitioner.example.com/agent-reliability-engineering",
    },
    {
      id: "candidate-community",
      name: "Agent Engineering Community",
      homepage: "https://community.example.com",
      class: "英文社区",
      priority: "P2",
      cadence: "8h",
      focus: candidateName,
      independentGroup: "candidate-community",
      layer: "community",
      language: "en",
      articleUrl: "https://community.example.com/agent-reliability-engineering",
    },
  ];

  try {
    upsertSourceCatalog(database, sources);
    for (const [index, source] of sources.entries()) {
      assert.equal(insertArticle(database, {
        url: source.articleUrl,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        sourceLayer: source.layer,
        sourceLanguage: source.language,
        originalTitle: `${candidateName} field note ${index + 1}`,
        originalExcerpt: "A traceable observation about reliability practices for long-running agents.",
        contentText: "A traceable observation about reliability practices for long-running agents.",
        publishedAt: `2026-08-02T0${index + 1}:00:00.000Z`,
        discoveredAt: `2026-08-02T0${index + 2}:00:00.000Z`,
        contentHash: `candidate-concept-${index + 1}`,
        relevanceScore: 10,
        signalSlug,
        conceptSlug: "coding-agent",
        title: `${candidateName} 候选信号 ${index + 1}`,
        summary: "该名称由模型提出，仍需追踪定义、起源和独立工程证据。",
        implication: "先保留原文与证据层级，不自动进入已建立概念目录。",
        topic: "概念",
        stage: "Spark",
        accent: "signal",
        tags: ["coding-agent", "reliability"],
        analysisMode: "deepseek",
        publishDecision: "publish",
        editorialScore: 70,
        aiRelevanceScore: 80,
        noveltyScore: 78,
        evidenceScore: source.layer === "practitioner" ? 70 : 50,
        eventKey: "agent-reliability-engineering:origin",
        candidateConcept: candidateName,
      }), true);
    }

    const snapshot = await buildSnapshot(database);
    assert.ok(Array.isArray(snapshot.candidateConcepts), "快照必须显式输出待溯源概念候选");
    assert.equal(snapshot.candidateConcepts.length, 1, "同名候选必须去重");
    const candidate = snapshot.candidateConcepts[0];
    assert.equal(candidate.name, candidateName);
    assert.equal(candidate.signalCount, 1, "同一 signalSlug 的多条证据只计为一个候选信号");
    assert.equal(candidate.evidenceCount, 2, "两篇独立原文必须计为两条候选证据");
    assert.equal(candidate.highestEvidenceLayer, "practitioner");
    assert.deepEqual(
      new Set(candidate.sources.map((source) => source.href)),
      new Set(sources.map((source) => source.articleUrl)),
      "候选必须保留全部原文链接",
    );
    assert.equal(
      snapshot.concepts.some((concept) => concept.name === candidateName),
      false,
      "模型提出的候选不得自动混进已建立概念目录",
    );
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("watch candidates beyond the snapshot limit cannot evict published signals or model pulses", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const previousSnapshotLimit = process.env.RADAR_SNAPSHOT_ARTICLES;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-snapshot-partitions-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  process.env.RADAR_SNAPSHOT_ARTICLES = "2";
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { buildSnapshot } = await import("../radar/snapshot.mjs");
  const database = openDatabase();
  const source = {
    id: "snapshot-partition-source",
    name: "Snapshot Partition Source",
    homepage: "https://partition.example.com",
    class: "一手工程",
    priority: "P0",
    cadence: "4h",
    focus: "DeepSeek V4 Flash Agent engineering",
    independentGroup: "snapshot-partition-source",
    layer: "official",
    language: "en",
  };
  const now = Date.now();

  try {
    upsertSourceCatalog(database, [source]);
    const publishAt = new Date(now - 5 * 3_600_000).toISOString();
    assert.equal(insertArticle(database, {
      url: "https://partition.example.com/deepseek-v4-flash-published",
      sourceId: source.id,
      sourceName: source.name,
      sourceClass: source.class,
      independentGroup: source.independentGroup,
      sourceLayer: source.layer,
      sourceLanguage: source.language,
      originalTitle: "DeepSeek V4 Flash adds coding agent tool telemetry",
      originalExcerpt: "Published engineering evidence for DeepSeek V4 Flash.",
      contentText: "Published engineering evidence for DeepSeek V4 Flash.",
      publishedAt: publishAt,
      discoveredAt: publishAt,
      contentHash: "snapshot-partition-publish",
      relevanceScore: 10,
      signalSlug: "deepseek-v4-flash-published-signal",
      conceptSlug: "coding-agent",
      title: "DeepSeek V4 Flash 增加 Coding Agent 工具遥测",
      summary: "公开信号用于验证 watch 数据不能挤掉正式内容。",
      implication: "公开信号与候选池应使用独立快照容量。",
      topic: "工程",
      stage: "Emerging",
      accent: "engineering",
      tags: ["coding-agent", "deepseek-v4-flash"],
      analysisMode: "deepseek",
      publishDecision: "publish",
      editorialScore: 82,
      aiRelevanceScore: 90,
      noveltyScore: 74,
      evidenceScore: 90,
      eventKey: "deepseek-v4-flash:tool-telemetry",
      candidateConcept: "",
    }), true);

    for (let index = 0; index < 4; index += 1) {
      const watchedAt = new Date(now - index * 60_000).toISOString();
      assert.equal(insertArticle(database, {
        url: `https://partition.example.com/watch-${index}`,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        sourceLayer: "community",
        sourceLanguage: "en",
        originalTitle: `Unverified candidate ${index}`,
        originalExcerpt: "A newer watched candidate that must not consume the public snapshot window.",
        contentText: "A newer watched candidate that must not consume the public snapshot window.",
        publishedAt: watchedAt,
        discoveredAt: watchedAt,
        contentHash: `snapshot-partition-watch-${index}`,
        relevanceScore: 7,
        signalSlug: `watched-candidate-${index}`,
        conceptSlug: "coding-agent",
        title: `待验证候选 ${index}`,
        summary: "候选只进入待溯源队列。",
        implication: "不得占用公开信号与模型脉冲窗口。",
        topic: "概念",
        stage: "Spark",
        accent: "signal",
        tags: ["coding-agent"],
        analysisMode: "deepseek",
        publishDecision: "watch",
        editorialScore: 60,
        aiRelevanceScore: 70,
        noveltyScore: 75,
        evidenceScore: 50,
        eventKey: `unverified-candidate:${index}`,
        candidateConcept: `Unverified Candidate ${index}`,
      }), true);
    }

    const snapshot = await buildSnapshot(database);
    assert.equal(snapshot.signals.some((signal) => signal.slug === "deepseek-v4-flash-published-signal"), true, "watch 洪峰不能挤掉公开信号");
    const pulse = snapshot.modelPulses.find((item) => item.modelId === "deepseek-v4-flash");
    assert.ok(pulse, "watch 洪峰不能挤掉公开模型脉冲");
    assert.equal(pulse.windows.days7.total, 1);
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    if (previousSnapshotLimit === undefined) delete process.env.RADAR_SNAPSHOT_ARTICLES;
    else process.env.RADAR_SNAPSHOT_ARTICLES = previousSnapshotLimit;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("snapshot keeps the latest eight source articles for one signal", async () => {
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { buildSnapshot } = await import("../radar/snapshot.mjs");
  const database = openDatabase();
  const source = {
    id: "latest-source-test",
    name: "Latest Source Test",
    homepage: "https://latest.example.com",
    class: "一手工程",
    priority: "P0",
    cadence: "4h",
    focus: "Agent Harness",
    independentGroup: "latest-source-test",
  };
  upsertSourceCatalog(database, [source]);
  try {
    for (let index = 1; index <= 9; index += 1) {
      const suffix = String(index).padStart(2, "0");
      assert.equal(insertArticle(database, {
        url: `https://latest.example.com/evidence-${index}`,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        originalTitle: `Agent Harness evidence ${index}`,
        originalExcerpt: `Evidence ${index}`,
        contentText: `Evidence ${index}`,
        publishedAt: `2026-08-${suffix}T00:00:00.000Z`,
        discoveredAt: `2026-08-${suffix}T01:00:00.000Z`,
        contentHash: `latest-source-hash-${index}`,
        relevanceScore: 10,
        signalSlug: "agent-harness-latest-eight",
        conceptSlug: "agent-harness",
        title: "Agent Harness 最新来源窗口",
        summary: "验证同一信号只保留最新八篇原始文章。",
        implication: "来源上限必须淘汰最旧证据，而不是丢掉最新变化。",
        topic: "工程",
        stage: "Validated",
        accent: "evidence",
        tags: ["agent-harness"],
        analysisMode: "deepseek",
      }), true);
    }
    const snapshot = await buildSnapshot(database);
    const signal = snapshot.signals.find((item) => item.slug === "agent-harness-latest-eight");
    assert.ok(signal);
    assert.equal(signal.sources.length, 8);
    const expectedIndexes = [9, 8, 7, 6, 5, 4, 3, 2];
    assert.deepEqual(
      signal.sources.map(({ name, href }) => ({ name, href })),
      expectedIndexes.map((index) => ({ name: source.name, href: `https://latest.example.com/evidence-${index}` })),
      "来源应按日期从新到旧保留最新八条",
    );
    assert.equal(new Set(signal.sources.map((sourceItem) => sourceItem.href)).size, 8, "最新八条来源 URL 必须去重");
    for (const [position, sourceItem] of signal.sources.entries()) {
      const index = expectedIndexes[position];
      assert.equal(sourceItem.layer, "official");
      assert.equal(sourceItem.language, "en");
      assert.equal(sourceItem.originalTitle, `Agent Harness evidence ${index}`);
      assert.equal(sourceItem.publishedAt, `2026-08-${String(index).padStart(2, "0")}T00:00:00.000Z`);
    }
  } finally {
    database.close();
  }
});

test("snapshot source cap always preserves the selected representative article URL", async () => {
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { buildSnapshot } = await import("../radar/snapshot.mjs");
  const database = openDatabase();
  const source = {
    id: "representative-source-cap-test",
    name: "Representative Source Cap Test",
    homepage: "https://representative-cap.example.com",
    class: "一手工程",
    priority: "P0",
    cadence: "4h",
    focus: "Agent Harness",
    independentGroup: "representative-source-cap-test",
    layer: "official",
    language: "en",
  };
  const representativeUrl = "https://representative-cap.example.com/evidence-1";
  upsertSourceCatalog(database, [source]);
  try {
    for (let index = 1; index <= 9; index += 1) {
      const suffix = String(index).padStart(2, "0");
      assert.equal(insertArticle(database, {
        url: `https://representative-cap.example.com/evidence-${index}`,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        sourceLayer: source.layer,
        sourceLanguage: source.language,
        originalTitle: `Agent Harness source evidence ${index}`,
        originalExcerpt: `Official evidence ${index}`,
        contentText: `Official evidence ${index}`,
        publishedAt: `2026-09-${suffix}T00:00:00.000Z`,
        discoveredAt: `2026-09-${suffix}T01:00:00.000Z`,
        contentHash: `representative-source-cap-${index}`,
        relevanceScore: 10,
        signalSlug: "agent-harness-representative-source-cap",
        conceptSlug: "agent-harness",
        title: index === 1 ? "被选中的中文代表文章" : `同组中文证据文章 ${index}`,
        summary: "官方材料说明检查点、审批和恢复机制。",
        implication: "团队需要保留原文链接并验证工程边界。",
        topic: "工程",
        stage: "Validated",
        accent: "evidence",
        tags: ["agent-harness"],
        analysisMode: "deepseek",
        publishDecision: "publish",
        editorialScore: index === 1 ? 99 : 10,
      }), true);
    }

    const snapshot = await buildSnapshot(database);
    const signal = snapshot.signals.find((item) => item.slug === "agent-harness-representative-source-cap");
    assert.ok(signal);
    assert.equal(signal.title, "被选中的中文代表文章", "fixture 必须确认最旧文章确实被选为展示代表");
    assert.equal(signal.sources.length, 8, "公开来源仍可维持 8 条上限");
    assert.deepEqual(signal.representativeSource, {
      name: source.name,
      href: representativeUrl,
      layer: "official",
      originalTitle: "Agent Harness source evidence 1",
      language: "en",
      publishedAt: "2026-09-01T00:00:00.000Z",
    }, "来源裁剪之外必须显式保留生成公开文案的 representative 元数据");
    assert.deepEqual(
      signal.sources.map((item) => item.href),
      [9, 8, 7, 6, 5, 4, 3, 1].map((index) => `https://representative-cap.example.com/evidence-${index}`),
      "sources 应保持证据排序；representative 不在前八时只替换最后一项，不能强行置顶",
    );
    assert.ok(signal.sources.some((item) => item.href === representativeUrl), "8 条来源上限仍不能丢失 representative 原文");
    assert.equal(new Set(signal.sources.map((item) => item.href)).size, 8, "代表原文置顶不能产生重复来源或突破上限");
  } finally {
    database.close();
  }
});

test("community-only independent groups cannot self-upgrade to high confidence", async () => {
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { buildSnapshot } = await import("../radar/snapshot.mjs");
  const database = openDatabase();
  const communitySources = [
    { id: "community-cn-a", name: "中文社区 A", class: "中文社区", independentGroup: "community-cn-a" },
    { id: "community-cn-b", name: "中文社区 B", class: "中文社区", independentGroup: "community-cn-b" },
    { id: "community-en-a", name: "English Community A", class: "英文社区", independentGroup: "community-en-a" },
  ].map((source) => ({ ...source, homepage: `https://${source.id}.example.com`, priority: "P1", cadence: "4h", focus: "Agent Engineering" }));
  upsertSourceCatalog(database, communitySources);
  try {
    for (const [index, source] of communitySources.entries()) {
      assert.equal(insertArticle(database, {
        url: `${source.homepage}/discussion-${index}`,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        originalTitle: `Community discussion ${index}`,
        originalExcerpt: "Multi-agent orchestration discussion.",
        contentText: "Multi-agent orchestration discussion.",
        publishedAt: `2026-08-01T0${index}:00:00.000Z`,
        discoveredAt: `2026-08-01T1${index}:00:00.000Z`,
        contentHash: `community-only-${index}`,
        relevanceScore: 10,
        signalSlug: "multi-agent-community-only",
        conceptSlug: "multi-agent-orchestration",
        title: "社区正在讨论多智能体编排",
        summary: "多个社区独立讨论同一工程方向，但尚无官方或实践证据。",
        implication: "社区热度只能进入候选队列，不能单独形成已验证结论。",
        topic: "工程",
        stage: "Spark",
        accent: "signal",
        tags: ["multi-agent-orchestration"],
        analysisMode: "deepseek",
      }), true);
    }
    const snapshot = await buildSnapshot(database);
    const signal = snapshot.signals.find((item) => item.slug === "multi-agent-community-only");
    assert.ok(signal);
    assert.notEqual(signal.confidence, "较高", "社区独立组数量不能替代官方或实践交叉验证");
    assert.deepEqual(signal.sourceMix, { official: 0, practitioner: 0, community: 3 });
    assert.equal(signal.verificationState, "community-only");
  } finally {
    database.close();
  }
});

test("official plus an independent practitioner or community source becomes cross-verified", async () => {
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { buildSnapshot } = await import("../radar/snapshot.mjs");
  const database = openDatabase();
  const sources = [
    { id: "verified-official", name: "Agent Runtime Team", class: "一手工程", independentGroup: "verified-official" },
    { id: "verified-practitioner", name: "Independent Engineer", class: "实践者", independentGroup: "verified-practitioner" },
  ].map((source) => ({ ...source, homepage: `https://${source.id}.example.com`, priority: "P0", cadence: "4h", focus: "Agent Harness" }));
  upsertSourceCatalog(database, sources);
  try {
    for (const [index, source] of sources.entries()) {
      assert.equal(insertArticle(database, {
        url: `${source.homepage}/evidence-${index}`,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        originalTitle: `Verified harness evidence ${index}`,
        originalExcerpt: "Approval and recovery evidence.",
        contentText: "Approval and recovery evidence.",
        publishedAt: `2026-08-01T0${index}:30:00.000Z`,
        discoveredAt: `2026-08-01T1${index}:30:00.000Z`,
        contentHash: `verified-mix-${index}`,
        relevanceScore: 10,
        signalSlug: "agent-harness-cross-verified",
        conceptSlug: "agent-harness",
        title: "Agent Harness 获得官方与独立实践交叉验证",
        summary: "官方实现和独立工程实践共同支持该信号。",
        implication: "可以进入验证阶段，但仍需保留原文与证据层级。",
        topic: "工程",
        stage: "Validated",
        accent: "evidence",
        tags: ["agent-harness"],
        analysisMode: "deepseek",
      }), true);
    }
    const snapshot = await buildSnapshot(database);
    const signal = snapshot.signals.find((item) => item.slug === "agent-harness-cross-verified");
    assert.ok(signal);
    assert.equal(signal.confidence, "较高");
    assert.deepEqual(signal.sourceMix, { official: 1, practitioner: 1, community: 0 });
    assert.equal(signal.verificationState, "cross-verified");
  } finally {
    database.close();
  }
});

test("source catalog covers bilingual official, practitioner and public community layers", async () => {
  const catalog = JSON.parse(await readFile(new URL("../config/sources.json", import.meta.url), "utf8"));
  const enabled = catalog.filter((source) => source.enabled !== false);
  assert.ok(enabled.some((source) => source.language === "zh" && source.layer === "official"), "缺少中文官方或团队来源");
  assert.ok(enabled.some((source) => source.language === "zh" && source.layer === "community"), "缺少中文社区来源");
  assert.ok(enabled.some((source) => source.language === "en" && source.layer === "community"), "缺少英文社区来源");
  assert.ok(enabled.some((source) => source.layer === "practitioner"), "缺少独立实践者来源");
  assert.ok(enabled.some((source) => source.language === "en" && source.layer === "official"), "缺少全球官方来源");

  const communitySources = enabled.filter((source) => source.layer === "community");
  assert.ok(communitySources.length >= 2);
  assert.ok(
    communitySources.some((source) => source.language === "zh" && source.kind === "feed"),
    "至少需要一个公开免登录的中文社区 RSS/Atom feed",
  );
  assert.ok(
    communitySources.some((source) => source.language === "en" && source.kind === "json"),
    "至少需要一个英文社区 JSON 来源",
  );
  for (const source of communitySources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:", `${source.id} 必须使用 HTTPS`);
    assert.equal(url.username, "", `${source.id} 不得在 URL 携带账号`);
    assert.equal(url.password, "", `${source.id} 不得在 URL 携带密码`);
    assert.doesNotMatch(source.url, /(?:login|signin|access_token|api[_-]?key)/i, `${source.id} 必须公开免登录`);
    assert.doesNotMatch(url.hostname, /^(?:x|twitter|weibo|zhihu)\.com$/i, `${source.id} 不应依赖强登录社区`);
    assert.ok(["feed", "json", "html"].includes(source.kind), `${source.id} 应使用公开 feed、JSON 或受限 HTML`);
    if (source.kind === "json") {
      assert.ok(["github-issues", "bluesky-search", "hacker-news"].includes(source.parser), `${source.id} parser 未纳入受测白名单`);
    }
    if (source.kind === "html") {
      assert.ok(
        Array.isArray(source.includeUrlPatterns) && source.includeUrlPatterns.length > 0,
        `${source.id} HTML 社区来源必须用 includeUrlPatterns 限定文章链接`,
      );
      assert.ok(
        source.includeUrlPatterns.every((pattern) => typeof pattern === "string" && pattern.trim()),
        `${source.id} includeUrlPatterns 不能包含空规则`,
      );
      assert.doesNotMatch(source.url, /(?:login|signin)/i, `${source.id} HTML 社区来源不得指向登录页`);
    }
  }
});

test("snapshot creates seven and thirty day model pulses by evidence layer with original links", async () => {
  const { insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
  const { buildSnapshot } = await import("../radar/snapshot.mjs");
  const database = openDatabase();
  const sources = [
    { id: "pulse-official", name: "DeepSeek Team", class: "中文官方", independentGroup: "pulse-official", daysAgo: 2 },
    { id: "pulse-community", name: "中文 Agent 社区", class: "中文社区", independentGroup: "pulse-community", daysAgo: 5 },
    { id: "pulse-practitioner", name: "Agent 工程实践者", class: "实践者", independentGroup: "pulse-practitioner", daysAgo: 15 },
    { id: "pulse-old", name: "Old Community", class: "英文社区", independentGroup: "pulse-old", daysAgo: 35 },
  ].map((source) => ({ ...source, homepage: `https://${source.id}.example.com`, priority: "P1", cadence: "4h", focus: "DeepSeek V4 Flash" }));
  upsertSourceCatalog(database, sources);
  const now = Date.now();
  try {
    for (const [index, source] of sources.entries()) {
      const publishedAt = new Date(now - source.daysAgo * 86_400_000).toISOString();
      assert.equal(insertArticle(database, {
        url: `${source.homepage}/deepseek-v4-flash-${index}`,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        originalTitle: `DeepSeek V4 Flash engineering discussion ${index}`,
        originalExcerpt: "DeepSeek V4 Flash in AI coding workflows.",
        contentText: "DeepSeek V4 Flash in AI coding workflows.",
        publishedAt,
        discoveredAt: publishedAt,
        contentHash: `deepseek-pulse-${index}`,
        relevanceScore: 10,
        signalSlug: `deepseek-v4-flash-pulse-${index}`,
        conceptSlug: "coding-agent",
        title: `DeepSeek V4 Flash 工程脉冲 ${index}`,
        summary: "记录模型在工程与社区中的近期讨论。",
        implication: "按证据层级和时间窗口观察，不把讨论热度当能力分数。",
        topic: "工程",
        stage: "Emerging",
        accent: "signal",
        tags: ["coding-agent", "deepseek-v4-flash"],
        analysisMode: "deepseek",
      }), true);
    }
    const snapshot = await buildSnapshot(database);
    assert.ok(Array.isArray(snapshot.modelPulses));
    const pulse = snapshot.modelPulses.find((item) => item.modelId === "deepseek-v4-flash");
    assert.ok(pulse);
    assert.deepEqual(pulse.windows.days7, { total: 2, official: 1, practitioner: 0, community: 1 });
    assert.deepEqual(pulse.windows.days30, { total: 3, official: 1, practitioner: 1, community: 1 });
    assert.deepEqual(new Set(pulse.sources.map((source) => source.href)), new Set([
      "https://pulse-official.example.com/deepseek-v4-flash-0",
      "https://pulse-community.example.com/deepseek-v4-flash-1",
      "https://pulse-practitioner.example.com/deepseek-v4-flash-2",
    ]));
    assert.deepEqual(new Set(pulse.sources.map((source) => source.layer)), new Set(["official", "community", "practitioner"]));
  } finally {
    database.close();
  }
});

test("every seed signal declares a valid catalog concept", async () => {
  const [{ signals: seedSignals }, catalogText] = await Promise.all([
    import("../app/lib/radar-data.ts"),
    readFile(new URL("../config/concepts.json", import.meta.url), "utf8"),
  ]);
  const validConcepts = new Set(JSON.parse(catalogText).map((concept) => concept.slug));
  assert.ok(seedSignals.length > 0);
  for (const signal of seedSignals) {
    assert.equal(typeof signal.conceptSlug, "string", `${signal.slug} 缺少 conceptSlug`);
    assert.ok(validConcepts.has(signal.conceptSlug), `${signal.slug} 使用了目录外 conceptSlug: ${signal.conceptSlug}`);
  }
});

test("model catalog preserves the verified eight-model price and context contract", async () => {
  const { modelDataVerifiedAt, modelRecords } = await import("../app/lib/model-data.ts");
  assert.equal(modelDataVerifiedAt, "2026-08-01T22:20:00+08:00");

  const catalog = Object.fromEntries(modelRecords.map((model) => [model.name, model]));
  assert.deepEqual(Object.keys(catalog), [
    "GPT-5.6 Sol",
    "GPT-5.6 Terra",
    "Claude Fable 5",
    "Claude Opus 5",
    "Claude Sonnet 5",
    "Gemini 3.6 Flash",
    "DeepSeek V4 Pro",
    "DeepSeek V4 Flash",
  ]);

  const expectedFacts = {
    "GPT-5.6 Sol": { contextTokens: 1_050_000, input: 5, output: 30 },
    "GPT-5.6 Terra": { contextTokens: 1_050_000, input: 2, output: 12 },
    "Claude Fable 5": { contextTokens: 1_000_000, input: 10, output: 50 },
    "Claude Opus 5": { contextTokens: 1_000_000, input: 5, output: 25 },
    "Claude Sonnet 5": { contextTokens: 1_000_000, input: 2, output: 10 },
    "Gemini 3.6 Flash": { contextTokens: 1_000_000, input: 1.5, output: 7.5 },
    "DeepSeek V4 Pro": { contextTokens: 1_000_000, input: 0.435, output: 0.87 },
    "DeepSeek V4 Flash": { contextTokens: 1_000_000, input: 0.14, output: 0.28 },
  };
  for (const [name, facts] of Object.entries(expectedFacts)) {
    assert.equal(catalog[name].contextTokens, facts.contextTokens, `${name} context`);
    assert.equal(catalog[name].price.input, facts.input, `${name} input price`);
    assert.equal(catalog[name].price.output, facts.output, `${name} output price`);
  }

  assert.deepEqual(
    {
      standardInput: catalog["Claude Sonnet 5"].price.standardInput,
      standardOutput: catalog["Claude Sonnet 5"].price.standardOutput,
      promotionEndsAt: catalog["Claude Sonnet 5"].price.promotionEndsAt,
    },
    { standardInput: 3, standardOutput: 15, promotionEndsAt: "2026-08-31T23:59:59+08:00" },
  );
  const providerHosts = Object.fromEntries(["OpenAI", "Anthropic", "Google", "DeepSeek"].map((provider) => [
    provider,
    new Set(modelRecords.filter((model) => model.provider === provider).flatMap((model) => model.sources.map((source) => new URL(source.href).hostname))),
  ]));
  assert.ok(providerHosts.OpenAI.has("developers.openai.com"));
  assert.ok(providerHosts.Anthropic.has("platform.claude.com"));
  assert.ok(providerHosts.Google.has("ai.google.dev"));
  assert.ok(providerHosts.DeepSeek.has("api-docs.deepseek.com"));
  for (const model of modelRecords) {
    assert.ok(model.assessment.codingRationale.trim(), `${model.name} 缺少编程能力判断依据`);
    assert.ok(model.assessment.everydayRationale.trim(), `${model.name} 缺少日常能力判断依据`);
    assert.equal(model.assessment.evaluatedAt, modelDataVerifiedAt, `${model.name} 评估时间与核验版本不一致`);
    assert.doesNotThrow(() => new URL(model.assessment.evidenceHref), `${model.name} assessment evidenceHref 无效`);
  }
});

test("model pulse aliases are a complete one-to-one mapping for the current model catalog", async () => {
  const [{ modelRecords }, aliasesText] = await Promise.all([
    import("../app/lib/model-data.ts"),
    readFile(new URL("../config/model-aliases.json", import.meta.url), "utf8"),
  ]);
  const aliasEntries = JSON.parse(aliasesText);
  const modelIds = modelRecords.map((model) => model.id);
  const aliasModelIds = aliasEntries.map((entry) => entry.modelId);

  assert.equal(new Set(aliasModelIds).size, aliasEntries.length, "每个 modelId 只能有一份 pulse alias 配置");
  assert.deepEqual([...aliasModelIds].sort(), [...modelIds].sort(), "alias 配置必须完整覆盖当前模型且不能包含孤儿 modelId");

  const aliasOwners = new Map();
  for (const entry of aliasEntries) {
    assert.ok(Array.isArray(entry.aliases) && entry.aliases.length > 0, `${entry.modelId} aliases 不能为空`);
    for (const alias of entry.aliases) {
      assert.equal(typeof alias, "string");
      assert.ok(alias.trim(), `${entry.modelId} 包含空 alias`);
      const normalized = alias.trim().toLowerCase();
      const owner = aliasOwners.get(normalized);
      assert.ok(!owner || owner === entry.modelId, `alias ${alias} 同时指向 ${owner} 与 ${entry.modelId}`);
      aliasOwners.set(normalized, entry.modelId);
    }
  }
});

test("active Radar model is resolved from runtime provider configuration", async () => {
  const { resolveActiveRadarModelId } = await import("../app/lib/model-data.ts");
  assert.equal(resolveActiveRadarModelId({ provider: "deepseek" }), null, "显式 DeepSeek 但没有 key 时不能标 active");
  assert.equal(
    resolveActiveRadarModelId({ provider: "auto", analysisMode: "deepseek" }),
    null,
    "旧快照的 analysisMode 不是当前进程 provider 权威状态",
  );
  assert.equal(resolveActiveRadarModelId({
    provider: "auto",
    openaiApiKey: "openai-key",
    deepseekApiKey: "deepseek-key",
  }), "gpt-5-6-terra", "auto 双 key 时 OpenAI 保持现有优先级");
  assert.equal(resolveActiveRadarModelId({
    provider: "auto",
    openaiApiKey: "openai-key",
    deepseekApiKey: "deepseek-key",
    disableAi: true,
  }), null, "全局禁用 AI 时不能标 active");
  assert.equal(resolveActiveRadarModelId({
    provider: "auto",
    openaiApiKey: "openai-key",
    deepseekApiKey: "deepseek-key",
    disableOpenAI: true,
  }), "deepseek-v4-flash", "禁用 OpenAI 后 auto 应选择有 key 的 DeepSeek");
  assert.equal(resolveActiveRadarModelId({ provider: "rules", deepseekApiKey: "deepseek-key" }), null);
});

test("Sonnet promotion resolver switches to standard price immediately after expiry", async () => {
  const { modelRecords, resolveModelPrice } = await import("../app/lib/model-data.ts");
  assert.equal(typeof resolveModelPrice, "function", "model-data 必须导出纯价格解析器");
  const sonnet = modelRecords.find((model) => model.name === "Claude Sonnet 5");
  assert.ok(sonnet);

  const active = resolveModelPrice(sonnet.price, "2026-08-31T23:59:58+08:00");
  assert.deepEqual(
    { input: active.input, output: active.output, isPromotion: active.isPromotion },
    { input: 2, output: 10, isPromotion: true },
  );

  const atDeadline = resolveModelPrice(sonnet.price, "2026-08-31T23:59:59+08:00");
  assert.deepEqual(
    { input: atDeadline.input, output: atDeadline.output, isPromotion: atDeadline.isPromotion },
    { input: 2, output: 10, isPromotion: true },
  );

  const expired = resolveModelPrice(sonnet.price, "2026-09-01T00:00:00+08:00");
  assert.deepEqual(
    { input: expired.input, output: expired.output, isPromotion: expired.isPromotion },
    { input: 3, output: 15, isPromotion: false },
  );
});

test("capability cell layout keeps small groups visible and summarizes dense groups", async () => {
  const { resolveCapabilityCellLayout } = await import("../app/lib/model-data.ts");
  assert.equal(typeof resolveCapabilityCellLayout, "function", "model-data 必须导出纯能力格布局 helper");

  const three = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const smallLayout = resolveCapabilityCellLayout(three);
  assert.deepEqual(smallLayout.visibleRecords, three, "同格三条时必须全部显示");
  assert.equal(smallLayout.overflowCount, 0);

  const five = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
  const denseLayout = resolveCapabilityCellLayout(five);
  assert.deepEqual(denseLayout.visibleRecords, five.slice(0, 2), "同格五条时只显示前两条模型");
  assert.equal(denseLayout.overflowCount, 3, "其余三条必须由 +3 密度标记表达");
});
