import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
  const article = {
    url: "https://example.com/agent", sourceId: "test-source", sourceName: "Test", sourceClass: "一手工程",
    independentGroup: "test", originalTitle: "Agent Harness", originalExcerpt: "Evidence", contentText: "Evidence",
    publishedAt: "2026-08-01T00:00:00.000Z", discoveredAt: "2026-08-01T01:00:00.000Z", contentHash: "hash",
    relevanceScore: 10, signalSlug: "agent-harness-test", conceptSlug: "agent-harness", title: "Agent Harness",
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
  database.close();
});
