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

test("canonical URLs remove trackers and reject local targets", () => {
  assert.equal(
    canonicalizeUrl("/post?utm_source=test&id=7#section", "https://example.com/blog/"),
    "https://example.com/post?id=7",
  );
  assert.equal(canonicalizeUrl("http://127.0.0.1/private", "https://example.com"), null);
  assert.equal(cleanText("<p>Agent <b>Harness</b></p>"), "Agent Harness");
});

test("relevance rejects adjacent AI news and keeps agent engineering", () => {
  const source = { focus: "AI Coding", alwaysRelevant: false };
  assert.ok(scoreRelevance({ title: "Building a durable multi-agent harness", excerpt: "workflow checkpoints and approvals" }, source) >= 5);
  assert.ok(scoreRelevance({ title: "AI is eating Finance", excerpt: "earnings and markets" }, source) < 5);
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
    relevanceScore: 10, signalSlug, conceptSlug: "agent-harness", title: "Agent Harness",
    summary: "A sufficiently long evidence summary for the test.", implication: "A sufficiently long engineering implication for the test.",
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
  assert.deepEqual(snapshot.signals[0].sources, [{ name: "Test", href: "https://example.com/agent" }]);
  database.close();
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
    const hrefs = new Set(signal.sources.map((sourceItem) => sourceItem.href));
    assert.equal(hrefs.has("https://latest.example.com/evidence-1"), false, "最旧来源必须被淘汰");
    for (let index = 2; index <= 9; index += 1) {
      assert.equal(hrefs.has(`https://latest.example.com/evidence-${index}`), true, `缺少第 ${index} 条较新来源`);
    }
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
