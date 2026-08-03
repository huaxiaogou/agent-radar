import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  insertArticle,
  openDatabase,
  upsertSourceCatalog,
} from "../radar/database.mjs";
import {
  applyConceptKnowledgeRevision,
  CONCEPT_ANALYZER_VERSION,
  CONCEPT_KNOWLEDGE_SCHEMA_VERSION,
  conceptAnalysisFailureCategory,
  conceptArticleInputContractHash,
  getConceptPublicationReadiness,
  runConceptKnowledgeBackfill,
} from "../radar/concept-knowledge.mjs";
import { analyzeConceptKnowledgeArticle } from "../radar/concept-analyze.mjs";

const projectPath = fileURLToPath(new URL("../", import.meta.url));
const temporaryDirectories = new Set();

const ENVIRONMENT_KEYS = [
  "RADAR_DATA_DIR",
  "RADAR_AI_PROVIDER",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "RADAR_DISABLE_AI",
  "RADAR_DISABLE_OPENAI",
  "RADAR_OPENAI_CONCEPT_MODEL",
  "RADAR_OPENAI_CONCEPT_MAX_TOKENS",
  "RADAR_OPENAI_CONCEPT_TIMEOUT_MS",
  "RADAR_CONCEPT_ANALYSIS_ATTEMPTS",
  "RADAR_CONCEPT_INCREMENTAL_BATCH_SIZE",
  "RADAR_CONCEPT_RETRY_BATCH_SIZE",
  "RADAR_CONCEPT_ANALYSIS_CONCURRENCY",
  "RADAR_SOURCE_CONCURRENCY",
  "RADAR_FETCH_CONCURRENCY",
  "RADAR_ANALYSIS_CONCURRENCY",
];

const originalEnvironment = Object.fromEntries(ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

test("concept failures expose fixed operational categories without returning raw model errors", () => {
  const fixtures = [
    ["关系 targetSlug 不是已知正式概念：https://attacker.invalid/RAW_PROVIDER_SECRET", "relation-contract"],
    ["definition 必须是中文主导内容：RAW_PROVIDER_SECRET", "chinese-editorial"],
    ["证据链接不在允许来源中：https://attacker.invalid/RAW_PROVIDER_SECRET", "evidence-contract"],
    ["概念知识缺少 mechanism：RAW_PROVIDER_SECRET", "schema-contract"],
    ["concept.themes 包含未知工程主题：RAW_PROVIDER_SECRET", "theme-contract"],
    ["概念知识输出不是有效 JSON：RAW_PROVIDER_SECRET", "invalid-json"],
  ];
  assert.deepEqual(
    fixtures.map(([message]) => conceptAnalysisFailureCategory(message)),
    fixtures.map(([, category]) => category),
  );
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await Promise.all([...temporaryDirectories].map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
    temporaryDirectories.delete(directory);
  }));
});

async function temporaryDataDirectory(prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.add(directory);
  return directory;
}

function source(id, { layer = "official" } = {}) {
  return {
    id,
    name: `${id} source`,
    homepage: `https://${id}.example.com`,
    class: layer === "practitioner" ? "独立实践者" : "一手工程",
    family: layer,
    layer,
    priority: "P0",
    cadence: "4h",
    focus: "AI Coding 概念知识",
    independentGroup: id,
    language: "zh",
  };
}

function insertEvidenceArticle(database, sourceValue, suffix, {
  publishDecision = "publish",
  contentHash = `${sourceValue.id}:${suffix}`,
  url = `${sourceValue.homepage}/${suffix}`,
} = {}) {
  const originalTitle = `${suffix} original engineering evidence`;
  assert.equal(insertArticle(database, {
    url,
    sourceId: sourceValue.id,
    sourceName: sourceValue.name,
    sourceClass: sourceValue.class,
    sourceLayer: sourceValue.layer,
    sourceLanguage: sourceValue.language,
    independentGroup: sourceValue.independentGroup,
    originalTitle,
    originalExcerpt: "Agent 工程知识证据。",
    contentText: "来源解释了检查点、恢复、权限和验收边界。",
    publishedAt: "2026-08-03T01:00:00.000Z",
    discoveredAt: "2026-08-03T01:05:00.000Z",
    contentHash,
    relevanceScore: 10,
    signalSlug: `operations-${sourceValue.id}-${suffix}`,
    conceptSlug: "operations-contract",
    title: `${suffix} 的中文工程结论`,
    summary: "材料提供了可以回到原始来源核验的工程机制和边界。",
    implication: "需要用持久状态和验收证据验证恢复路径。",
    topic: "概念",
    stage: "Emerging",
    accent: "engineering",
    tags: ["concept-operations"],
    analysisMode: "openai",
    publishDecision,
    editorialScore: 88,
    aiRelevanceScore: 90,
    noveltyScore: 82,
    evidenceScore: 84,
    eventKey: `${sourceValue.id}:${suffix}`,
    candidateConcept: publishDecision === "watch" ? "待验证运维契约" : "",
  }), true);
  return {
    url,
    originalTitle,
    sourceName: sourceValue.name,
    sourceLayer: sourceValue.layer,
    independentGroup: sourceValue.independentGroup,
    publishedAt: "2026-08-03T01:00:00.000Z",
  };
}

const KNOWLEDGE_FIELDS = [
  "definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta",
  "aliases", "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs",
  "failureModes", "securityRisks", "operationalConcerns", "applicability", "nonApplicability", "controversies",
];

function knowledgePayload({
  slug = "operations-contract",
  canonicalName = "概念运维契约",
  evidence = [],
  claimKey = `${slug}-claim`,
} = {}) {
  const concept = {
    slug,
    canonicalName,
    aliases: [`${canonicalName}别名`, slug],
    stage: "emerging",
    heat: 50,
    maturity: 50,
    definition: "概念运维契约用独立来源、追加式修订和原子公开投影维护高级工程知识。",
    nonDefinition: "它不是没有来源的术语标签，也不是抓取成功后立即公开的文章摘要。",
    problem: "异步知识任务可能失败、重复或损坏，导致线上概念与权威证据链不一致。",
    whyNow: "智能编程知识变化持续加快，需要让回填、合并、恢复和发布都可以验证。",
    origin: "当前命名来自多份工程材料的归纳，更早的命名起源仍按原始证据继续核验。",
    evolution: ["从静态概念列表演进为能够恢复和审计的追加式知识修订账本。"],
    mechanism: "系统先校验来源和主张，再把有效修订写入权威账本，最后生成可回滚的公开快照。",
    architecture: "文章存储、概念修订、证据绑定、重定向和原子快照共同组成知识发布链。",
    designConstraints: ["任何正式公开主张都必须绑定当前仍可发布的原始证据。"],
    implementationPatterns: ["用追加式修订和最后有效版本回退保护知识连续性。"],
    antiPatterns: ["只修改当前载荷而不保留修订、证据和合并原因。"],
    tradeoffs: ["增加审计和存储成本，换取故障恢复与知识变化的可解释性。"],
    failureModes: ["当前载荷损坏或合并中断会使正式概念从公开知识中静默消失。"],
    securityRisks: ["未校验的模型链接可能把伪造来源写进权威知识。"],
    operationalConcerns: ["需要监控积压、公平重试、恢复状态和公开投影质量。"],
    applicability: ["适用于持续吸收多来源工程证据的高级智能编程知识库。"],
    nonApplicability: ["不适用于没有原始来源支撑的一次性术语猜测。"],
    controversies: ["概念正式化之前仍可能需要归一名称或合并重复对象。"],
    dailyDelta: "本次修订补充了重试、合并、恢复与发布之间的运维边界。",
    lastMeaningfulChange: "2026-08-03T02:00:00.000Z",
  };
  const claims = [{
    key: claimKey,
    text: "概念更新必须绑定原始证据并保留可以恢复的最后有效修订。",
    kind: "constraint",
    confidence: 0.88,
  }];
  const normalizedEvidence = evidence.map((item) => ({
    ...item,
    supports: [claimKey],
    stance: "support",
  }));
  return {
    identityDecision: {
      action: "create-new",
      canonicalSlug: slug,
      confidence: 0.91,
      reason: `${canonicalName}在该测试中首次建立为具有独立问题和机制的规范概念。`,
      comparedSlugs: [],
    },
    concept,
    claims,
    evidence: normalizedEvidence,
    citations: KNOWLEDGE_FIELDS.map((field) => ({
      field,
      evidenceUrls: normalizedEvidence.map((item) => item.url),
    })),
    relations: [],
  };
}

function applyKnowledge(database, payload, analyzedAt = "2026-08-03T02:00:00.000Z") {
  return applyConceptKnowledgeRevision(database, payload, {
    provider: "operations-contract-test",
    model: "operations-contract-test-model",
    analyzedAt,
    reason: "建立运维契约测试知识",
  });
}

test("backfill exposes only active workers as running and emits per-article progress", async () => {
  const directory = await temporaryDataDirectory("agent-radar-concept-progress-");
  process.env.RADAR_DATA_DIR = directory;
  const operationsSource = source("concept-progress-source");
  const database = openDatabase();
  upsertSourceCatalog(database, [operationsSource]);
  const firstEvidence = insertEvidenceArticle(database, operationsSource, "progress-first");
  const secondEvidence = insertEvidenceArticle(database, operationsSource, "progress-second");
  const events = [];
  let releaseFirst;
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;

  const running = runConceptKnowledgeBackfill({
    database,
    articleUrls: [firstEvidence.url, secondEvidence.url],
    batchSize: 2,
    concurrency: 1,
    onProgress: (event) => events.push(event),
    analyzeArticle: async (article) => {
      calls += 1;
      if (calls === 1) {
        markFirstStarted();
        await firstGate;
      }
      const evidence = {
        url: article.url,
        originalTitle: article.original_title,
        sourceName: article.source_name,
        sourceLayer: article.source_layer,
        independentGroup: article.independent_group,
        publishedAt: article.published_at,
      };
      return knowledgePayload({
        slug: `progress-concept-${calls}`,
        canonicalName: `进度概念${calls}`,
        evidence: [evidence],
      });
    },
  });
  await firstStarted;

  assert.equal(
    Number(database.prepare("SELECT COUNT(*) AS count FROM concept_backfill_attempts WHERE status = 'running'").get().count),
    1,
    "并发 1 时只有正在调用 provider 的文章可以标记 running，已领取但排队的文章不能伪装成活跃请求",
  );
  assert.equal(
    Number(database.prepare("SELECT COUNT(*) AS count FROM concept_backfill_leases").get().count),
    2,
    "整批租约仍可预先占用以防重叠 worker，但租约与运行状态必须分开",
  );
  assert.deepEqual(events.map((event) => event.phase), ["started"]);

  releaseFirst();
  const result = await running;
  assert.equal(result.processedCount, 2);
  assert.deepEqual(events.map((event) => event.phase), ["started", "completed", "started", "completed"]);
  assert.ok(events.filter((event) => event.phase === "completed").every((event) => Number.isFinite(event.elapsedMs)));
  const attempts = database.prepare(`
    SELECT status, attempted_at, completed_at
    FROM concept_backfill_attempts
    ORDER BY id
  `).all();
  assert.equal(attempts.length, 2);
  assert.ok(attempts.every((attempt) => attempt.status === "completed" && attempt.completed_at >= attempt.attempted_at));
  database.close();
});

function markBackfillCompleted(database, evidence, conceptSlug, revision = 1) {
  const statement = database.prepare(`
    INSERT INTO concept_backfill
      (article_url, content_hash, input_contract_hash, knowledge_schema_version, analyzer_version,
       status, attempted_at, completed_at, last_error, concept_slug, revision)
    VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, NULL, ?, ?)
  `);
  for (const item of evidence) {
    const article = database.prepare("SELECT content_hash, content_roles_json FROM articles WHERE url = ?").get(item.url);
    statement.run(
      item.url,
      article.content_hash,
      conceptArticleInputContractHash(article),
      CONCEPT_KNOWLEDGE_SCHEMA_VERSION,
      CONCEPT_ANALYZER_VERSION,
      "2026-08-03T02:00:00.000Z",
      "2026-08-03T02:00:00.000Z",
      conceptSlug,
      revision,
    );
  }
}

function trustedFetchOptions(fetchImpl) {
  return {
    fetchImpl,
    resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
    createDispatcher: () => ({ close: async () => {} }),
  };
}

function emptySourceResponse(input) {
  const url = String(input);
  if (url.includes("hn.algolia.com")) {
    return new Response(JSON.stringify({ hits: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (/api\.github\.com|api\.bsky|huggingface\.co\/api|api\.openreview|dblp\.org\/search\/publ\/api/iu.test(url)) {
    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(
    "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>Empty operations feed</title></channel></rss>",
    { status: 200, headers: { "content-type": "application/rss+xml" } },
  );
}

function runCommand(command, args, { environment = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectPath,
      env: { ...process.env, ...environment, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function parseCommandJson(result) {
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const start = output.indexOf("{");
  assert.notEqual(start, -1, `命令必须输出机器可读 JSON：\n${output}`);
  return JSON.parse(output.slice(start));
}

function failureLocator(value) {
  return value?.articleUrl || value?.url || value?.articleRef || "";
}

function assertSafeFailureObservable(value, { safePaths, label }) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(
    serialized,
    /api_key|token|signature|ARTICLE_QUERY_SECRET|TOKEN_QUERY_SECRET|SIGNATURE_QUERY_SECRET|RAW_PROVIDER_SECRET/iu,
    `${label} 不得泄漏查询凭据、敏感参数名或原始 provider 错误`,
  );
  const failures = Array.isArray(value) ? value : value?.failures || value?.recentFailures || [];
  assert.deepEqual(
    failures.map(failureLocator).sort(),
    [...safePaths].sort(),
    `${label} 必须保留可定位的 HTTPS host+path，同时删除 query 与 fragment`,
  );
}

test("P1 contract: backfill failure results redact query credentials and raw provider details without mutating authoritative evidence URLs", async (t) => {
  const directory = await temporaryDataDirectory("agent-radar-concept-safe-backfill-output-");
  process.env.RADAR_DATA_DIR = directory;
  const operationsSource = source("safe-backfill-output-source");
  const database = openDatabase();
  t.after(() => database.close());
  upsertSourceCatalog(database, [operationsSource]);
  const credentialUrl = `${operationsSource.homepage}/failed-credential-evidence?api_key=ARTICLE_QUERY_SECRET&token=TOKEN_QUERY_SECRET&signature=SIGNATURE_QUERY_SECRET`;
  const legitimateQueryUrl = `${operationsSource.homepage}/discussion?id=424242&page=2`;
  const credentialEvidence = insertEvidenceArticle(database, operationsSource, "failed-credential-evidence", {
    publishDecision: "watch",
    url: credentialUrl,
  });
  const legitimateQueryEvidence = insertEvidenceArticle(database, operationsSource, "legitimate-query-evidence", {
    publishDecision: "watch",
    url: legitimateQueryUrl,
  });

  const result = await runConceptKnowledgeBackfill({
    database,
    articleUrls: [credentialEvidence.url, legitimateQueryEvidence.url],
    analyzeArticle: async () => {
      throw new Error("provider raw output contained RAW_PROVIDER_SECRET");
    },
    batchSize: 2,
    concurrency: 1,
    now: "2026-08-03T04:00:00.000Z",
  });

  assert.equal(result.failedCount, 2, "fixture 必须通过真实 backfill 失败链产生两个可观测失败");
  assert.deepEqual(
    result.failures.map((failure) => failure.errorCategory),
    ["concept-analysis-failed", "concept-analysis-failed"],
    "backfill 运维投影必须返回固定错误类别，不能回传原始 provider 文本",
  );
  assertSafeFailureObservable(result, {
    safePaths: [
      `${operationsSource.homepage}/failed-credential-evidence`,
      `${operationsSource.homepage}/discussion`,
    ],
    label: "runConceptKnowledgeBackfill 返回值",
  });
  assert.ok(database.prepare("SELECT 1 FROM articles WHERE url = ?").get(legitimateQueryUrl), "合法 id/page query 必须继续保留在 SQLite 权威证据 URL，脱敏只能发生在运维投影");
});

test("P1 contract: readiness exposes only sanitized failure locators", async () => {
  const directory = await temporaryDataDirectory("agent-radar-concept-safe-readiness-output-");
  process.env.RADAR_DATA_DIR = directory;
  const operationsSource = source("safe-readiness-output-source");
  const database = openDatabase();
  upsertSourceCatalog(database, [operationsSource]);
  const credentialUrl = `${operationsSource.homepage}/readiness-failure?api_key=ARTICLE_QUERY_SECRET&token=TOKEN_QUERY_SECRET&signature=SIGNATURE_QUERY_SECRET`;
  const evidence = insertEvidenceArticle(database, operationsSource, "readiness-failure", {
    publishDecision: "watch",
    url: credentialUrl,
  });
  const failed = await runConceptKnowledgeBackfill({
    database,
    articleUrls: [evidence.url],
    analyzeArticle: async () => { throw new Error("RAW_PROVIDER_SECRET must stay internal"); },
    batchSize: 1,
    concurrency: 1,
    now: "2026-08-03T04:05:00.000Z",
  });
  assert.equal(failed.failedCount, 1);
  const readiness = getConceptPublicationReadiness(database, { includeOperationalBacklog: true });
  database.close();

  assertSafeFailureObservable(readiness.recentFailures, {
    safePaths: [`${operationsSource.homepage}/readiness-failure`],
    label: "concept readiness recentFailures",
  });
  assert.equal(readiness.recentFailures[0]?.errorCategory, "concept-analysis-failed");
});

test("P1 contract: concepts:check exposes only sanitized failure locators", async () => {
  const directory = await temporaryDataDirectory("agent-radar-concept-safe-check-output-");
  process.env.RADAR_DATA_DIR = directory;
  const operationsSource = source("safe-check-output-source");
  const database = openDatabase();
  upsertSourceCatalog(database, [operationsSource]);
  const credentialUrl = `${operationsSource.homepage}/check-failure?api_key=ARTICLE_QUERY_SECRET&token=TOKEN_QUERY_SECRET&signature=SIGNATURE_QUERY_SECRET`;
  const evidence = insertEvidenceArticle(database, operationsSource, "check-failure", {
    publishDecision: "watch",
    url: credentialUrl,
  });
  const failed = await runConceptKnowledgeBackfill({
    database,
    articleUrls: [evidence.url],
    analyzeArticle: async () => { throw new Error("RAW_PROVIDER_SECRET must stay internal"); },
    batchSize: 1,
    concurrency: 1,
    now: "2026-08-03T04:10:00.000Z",
  });
  assert.equal(failed.failedCount, 1);
  database.close();

  const command = await runCommand("npm", ["run", "--silent", "concepts:check"], {
    environment: { RADAR_DATA_DIR: directory },
  });
  assert.notEqual(command.code, 0, "当前 failed backlog 必须让 concepts:check 保持 not-ready");
  const report = parseCommandJson(command);
  assert.ok(Array.isArray(report.recentFailures), "concepts:check JSON 必须暴露 recentFailures 数组");
  assertSafeFailureObservable(report.recentFailures, {
    safePaths: [`${operationsSource.homepage}/check-failure`],
    label: "concepts:check JSON",
  });
  assert.doesNotMatch(
    `${command.stdout}\n${command.stderr}`,
    /api_key|token|signature|ARTICLE_QUERY_SECRET|TOKEN_QUERY_SECRET|SIGNATURE_QUERY_SECRET|RAW_PROVIDER_SECRET/iu,
    "concepts:check stdout/stderr 也不得在 JSON 外泄漏敏感值",
  );
});

test("incremental concept retry cannot let permanent failures starve a never-attempted pending article", async () => {
  const directory = await temporaryDataDirectory("agent-radar-concept-retry-fairness-");
  process.env.RADAR_DATA_DIR = directory;
  const operationsSource = source("operations-retry-source");
  const database = openDatabase();
  upsertSourceCatalog(database, [operationsSource]);
  const failedA = insertEvidenceArticle(database, operationsSource, "failed-a", { publishDecision: "watch" });
  const failedB = insertEvidenceArticle(database, operationsSource, "failed-b", { publishDecision: "watch" });
  const pendingQuerySecret = "PIPELINE_PENDING_QUERY_SECRET";
  const pending = insertEvidenceArticle(database, operationsSource, "never-attempted-pending", {
    publishDecision: "watch",
    url: `${operationsSource.homepage}/never-attempted-pending?api_key=${pendingQuerySecret}&token=PIPELINE_TOKEN_SECRET&signature=PIPELINE_SIGNATURE_SECRET`,
  });
  const failedSeed = await runConceptKnowledgeBackfill({
    database,
    analyzeArticle: async () => { throw new Error("permanent concept failure fixture"); },
    articleUrls: [failedA.url, failedB.url],
    batchSize: 2,
    concurrency: 1,
    now: "2026-08-03T02:10:00.000Z",
  });
  assert.equal(failedSeed.failedCount, 2, "fixture 必须通过生产 backfill 链建立足以占满 retry batch 的失败记录");
  database.close();

  process.env.RADAR_AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "operations-openai-key";
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.RADAR_DISABLE_AI;
  delete process.env.RADAR_DISABLE_OPENAI;
  process.env.RADAR_CONCEPT_INCREMENTAL_BATCH_SIZE = "2";
  process.env.RADAR_CONCEPT_RETRY_BATCH_SIZE = "2";
  process.env.RADAR_CONCEPT_ANALYSIS_CONCURRENCY = "1";
  process.env.RADAR_CONCEPT_ANALYSIS_ATTEMPTS = "1";
  process.env.RADAR_SOURCE_CONCURRENCY = "89";
  process.env.RADAR_FETCH_CONCURRENCY = "8";
  process.env.RADAR_ANALYSIS_CONCURRENCY = "1";

  const requestedInputs = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    const request = JSON.parse(init.body);
    requestedInputs.push(String(request.input || ""));
    return new Response(JSON.stringify({ error: { message: "permanent provider failure" } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  };

  const { runIngestion } = await import("../radar/pipeline.mjs");
  const pipelineLogs = [];
  const pipelineResult = await runIngestion({
    trigger: "manual",
    logger: Object.fromEntries(["info", "warn", "error"].map((level) => [level, (...values) => {
      pipelineLogs.push(`${level}: ${values.map(String).join(" ")}`);
    }])),
    fetchOptions: trustedFetchOptions(async (input) => emptySourceResponse(input)),
    modelLandscapeFetcher: async () => [],
  });

  const pipelineObservable = `${pipelineLogs.join("\n")}\n${JSON.stringify(pipelineResult)}`;
  const leakedPipelineSecrets = [
    pendingQuerySecret,
    "PIPELINE_TOKEN_SECRET",
    "PIPELINE_SIGNATURE_SECRET",
  ].filter((secret) => pipelineObservable.includes(secret));
  assert.deepEqual(
    leakedPipelineSecrets,
    [],
    "真实 runIngestion 概念失败链的 logger、run message 和返回状态不得泄漏 article query credential",
  );
  const leakedPipelineCredentialUrls = pipelineObservable.match(
    /https?:\/\/[^\s"']+[?&](?:api_key|token|signature)=[^\s"']*/giu,
  ) || [];
  assert.deepEqual(leakedPipelineCredentialUrls, [], "pipeline observability 中不得出现带敏感 query 参数名的失败 URL");

  assert.equal(requestedInputs.length, 2, "本轮必须严格受总增量预算和 retry batch 约束");
  assert.equal(
    requestedInputs.some((input) => input.includes(pending.url)),
    true,
    "从未处理的 pending 必须在一次无新文章运行中获得机会，不能被永久 failed 队列持续饿死",
  );
  const inspected = openDatabase();
  try {
    assert.ok(
      inspected.prepare("SELECT status FROM concept_backfill WHERE article_url = ?").get(pending.url),
      "pending 被选择后，即使本次供应商仍失败，也必须留下真实 backfill 尝试状态",
    );
  } finally {
    inspected.close();
  }
});

test("OpenAI concept adapter sends a strict Responses schema and honors model, token and timeout configuration", async () => {
  const article = {
    url: "https://openai-adapter.example.com/operations-contract",
    sourceId: "openai-adapter-source",
    sourceName: "OpenAI adapter source",
    sourceClass: "一手工程",
    sourceLayer: "official",
    independentGroup: "openai-adapter-source",
    sourceLanguage: "en",
    originalTitle: "Operational contracts for durable coding agents",
    originalExcerpt: "Checkpoints, recovery and acceptance evidence.",
    contentText: "The source documents checkpoints, recovery, permissions and acceptance evidence.",
    publishedAt: "2026-08-03T01:00:00.000Z",
  };
  const valid = knowledgePayload({
    evidence: [{
      url: article.url,
      originalTitle: article.originalTitle,
      sourceName: article.sourceName,
      sourceLayer: article.sourceLayer,
      independentGroup: article.independentGroup,
      publishedAt: article.publishedAt,
    }],
  });
  const requests = [];
  const environment = {
    OPENAI_API_KEY: "adapter-secret",
    RADAR_OPENAI_CONCEPT_MODEL: "gpt-operations-contract",
    RADAR_OPENAI_CONCEPT_MAX_TOKENS: "4321",
    RADAR_OPENAI_CONCEPT_TIMEOUT_MS: "75",
  };
  const analyzed = await analyzeConceptKnowledgeArticle(article, {
    provider: "openai",
    environment,
    maxAttempts: 1,
    fetchImpl: async (input, init) => {
      requests.push({ input: String(input), init, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ concepts: [valid] }) }] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.ok(Array.isArray(analyzed), "OpenAI strict schema 必须允许一篇文章返回 concepts 数组，而不是锁死单概念对象");
  assert.equal(analyzed[0].concept.slug, "operations-contract");
  assert.deepEqual(analyzed[0].analysisMetadata, {
    provider: "openai",
    model: "gpt-operations-contract",
    analyzedAt: analyzed[0].analysisMetadata.analyzedAt,
    attempt: 1,
  });
  assert.equal(requests.length, 1);
  const [{ input, init, body }] = requests;
  assert.equal(input, "https://api.openai.com/v1/responses");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.authorization, "Bearer adapter-secret");
  assert.equal(body.model, "gpt-operations-contract");
  assert.equal(body.max_output_tokens, 4321);
  assert.equal(body.store, false);
  assert.equal(body.text?.format?.type, "json_schema");
  assert.equal(body.text?.format?.strict, true);
  assert.equal(body.text?.format?.name, "agent_radar_concept_evidence_batch");
  assert.deepEqual(body.text?.format?.schema?.required, ["concepts"]);
  assert.deepEqual(
    body.text?.format?.schema?.properties?.concepts?.items?.required,
    ["identityDecision", "concept", "fields", "claims"],
    "OpenAI batch 必须使用紧凑证据提取契约，权威证据与引文由本地系统组装",
  );
  assert.equal(body.text?.format?.schema?.properties?.concepts?.maxItems, 3);
  assert.ok(init.signal instanceof AbortSignal, "请求必须携带由 RADAR_OPENAI_CONCEPT_TIMEOUT_MS 控制的 AbortSignal");

  const timeoutStartedAt = Date.now();
  await assert.rejects(
    analyzeConceptKnowledgeArticle(article, {
      provider: "openai",
      environment: { ...environment, RADAR_OPENAI_CONCEPT_TIMEOUT_MS: "25" },
      maxAttempts: 1,
      fetchImpl: async (_input, timeoutInit) => new Promise((resolve, reject) => {
        timeoutInit.signal.addEventListener("abort", () => reject(timeoutInit.signal.reason), { once: true });
      }),
    }),
    /概念知识分析失败|timeout|abort|超时/iu,
  );
  assert.ok(Date.now() - timeoutStartedAt < 1_000, "OpenAI 概念请求必须按独立 timeout 配置及时终止");
});

test("OpenAI correction retries with fixed guidance and never re-injects the invalid model value or forged URL", async () => {
  const article = {
    url: "https://openai-correction.example.com/real-source",
    sourceId: "openai-correction-source",
    sourceName: "OpenAI correction source",
    sourceClass: "一手工程",
    sourceLayer: "official",
    independentGroup: "openai-correction-source",
    sourceLanguage: "en",
    originalTitle: "Evidence-bound correction contract",
    originalExcerpt: "A source about evidence-bound correction.",
    contentText: "The article describes a durable correction boundary for coding-agent knowledge.",
    publishedAt: "2026-08-03T01:00:00.000Z",
  };
  const valid = knowledgePayload({
    evidence: [{
      url: article.url,
      originalTitle: article.originalTitle,
      sourceName: article.sourceName,
      sourceLayer: article.sourceLayer,
      independentGroup: article.independentGroup,
      publishedAt: article.publishedAt,
    }],
  });
  const forgedUrl = "https://forged.example.com/DO_NOT_REINJECT_RAW_MODEL_VALUE";
  const invalid = structuredClone(valid);
  invalid.evidence[0].url = forgedUrl;
  for (const citation of invalid.citations) citation.evidenceUrls = [forgedUrl];
  const requests = [];
  let call = 0;
  const result = await analyzeConceptKnowledgeArticle(article, {
    provider: "openai",
    environment: {
      OPENAI_API_KEY: "correction-secret",
      RADAR_OPENAI_CONCEPT_MODEL: "gpt-correction-contract",
      RADAR_OPENAI_CONCEPT_MAX_TOKENS: "4000",
      RADAR_OPENAI_CONCEPT_TIMEOUT_MS: "1000",
    },
    maxAttempts: 2,
    fetchImpl: async (_input, init) => {
      requests.push(JSON.parse(init.body));
      const payload = call === 0 ? invalid : valid;
      call += 1;
      return new Response(JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(result.concept.slug, "operations-contract");
  assert.equal(requests.length, 2, "非法证据 URL 必须触发一次确定性 correction 重试");
  assert.match(requests[1].instructions, /固定错误类别|evidence-binding|安全字段/u);
  assert.doesNotMatch(JSON.stringify(requests[1]), /DO_NOT_REINJECT_RAW_MODEL_VALUE|forged\.example\.com/u);
  assert.equal(requests[1].input, requests[0].input, "correction 只能复用原始可信输入，不能把上次模型输出拼进用户输入");
});

test("concept merge is deployable through npm, validates all required arguments, revises canonical knowledge and publishes redirects", async () => {
  const directory = await temporaryDataDirectory("agent-radar-concept-merge-cli-");
  process.env.RADAR_DATA_DIR = directory;
  const canonicalOfficial = source("merge-canonical-official");
  const canonicalPractitioner = source("merge-canonical-practitioner", { layer: "practitioner" });
  const legacyOfficial = source("merge-legacy-official");
  const legacyPractitioner = source("merge-legacy-practitioner", { layer: "practitioner" });
  const allSources = [canonicalOfficial, canonicalPractitioner, legacyOfficial, legacyPractitioner];
  const database = openDatabase();
  upsertSourceCatalog(database, allSources);
  const canonicalEvidence = [
    insertEvidenceArticle(database, canonicalOfficial, "canonical-official"),
    insertEvidenceArticle(database, canonicalPractitioner, "canonical-practitioner"),
  ];
  const legacyEvidence = [
    insertEvidenceArticle(database, legacyOfficial, "legacy-official"),
    insertEvidenceArticle(database, legacyPractitioner, "legacy-practitioner"),
  ];
  applyKnowledge(database, knowledgePayload({
    slug: "canonical-operations",
    canonicalName: "规范概念运维",
    evidence: canonicalEvidence,
    claimKey: "canonical-operations-boundary",
  }));
  applyKnowledge(database, knowledgePayload({
    slug: "legacy-operations",
    canonicalName: "旧版概念运维",
    evidence: legacyEvidence,
    claimKey: "legacy-operations-boundary",
  }), "2026-08-03T02:10:00.000Z");
  const before = {
    conceptRows: Number(database.prepare("SELECT COUNT(*) AS count FROM concept_knowledge").get().count),
    revisionRows: Number(database.prepare("SELECT COUNT(*) AS count FROM concept_revisions").get().count),
    canonicalRevision: Number(database.prepare("SELECT current_revision FROM concept_knowledge WHERE slug = 'canonical-operations'").get().current_revision),
  };
  database.close();

  const invalid = await runCommand("npm", [
    "run", "--silent", "concepts:merge", "--",
    "--from", "legacy-operations",
  ], { environment: { RADAR_DATA_DIR: directory } });
  assert.notEqual(invalid.code, 0, "缺少 --into 与 --reason 时命令必须非零退出");
  const afterInvalid = openDatabase();
  try {
    assert.deepEqual({
      conceptRows: Number(afterInvalid.prepare("SELECT COUNT(*) AS count FROM concept_knowledge").get().count),
      revisionRows: Number(afterInvalid.prepare("SELECT COUNT(*) AS count FROM concept_revisions").get().count),
      canonicalRevision: Number(afterInvalid.prepare("SELECT current_revision FROM concept_knowledge WHERE slug = 'canonical-operations'").get().current_revision),
    }, before, "参数校验失败必须发生在任何数据库写入之前");
  } finally {
    afterInvalid.close();
  }

  const reason = "名称不同但机制、边界和证据已经归一";
  const merged = await runCommand("npm", [
    "run", "--silent", "concepts:merge", "--",
    "--from", "legacy-operations",
    "--into", "canonical-operations",
    "--reason", reason,
  ], { environment: { RADAR_DATA_DIR: directory } });
  assert.equal(merged.code, 0, `可部署 merge 命令必须成功：\n${merged.stdout}\n${merged.stderr}`);

  const inspected = openDatabase();
  try {
    const canonical = inspected.prepare("SELECT current_revision FROM concept_knowledge WHERE slug = 'canonical-operations'").get();
    const legacy = inspected.prepare("SELECT merged_into, merge_reason FROM concept_knowledge WHERE slug = 'legacy-operations'").get();
    assert.equal(Number(canonical.current_revision), before.canonicalRevision + 1, "merge 必须追加 canonical 权威修订");
    assert.deepEqual({ ...legacy }, {
      merged_into: "canonical-operations",
      merge_reason: reason,
    });
  } finally {
    inspected.close();
  }
  const snapshot = JSON.parse(await readFile(path.join(directory, "radar-snapshot.json"), "utf8"));
  assert.deepEqual(snapshot.conceptRedirects?.["legacy-operations"], {
    redirectTo: "canonical-operations",
    reason,
    mergedAt: snapshot.conceptRedirects?.["legacy-operations"]?.mergedAt,
  }, "成功命令必须在同一次运维操作中发布包含永久 redirect 的新快照");
  assert.equal(
    snapshot.concepts.some((concept) => concept.slug === "canonical-operations" && concept.revision === before.canonicalRevision + 1),
    true,
    "公开快照必须与合并后的 canonical revision 同步",
  );
});

test("concepts:check reports recoverable corruption as an explicit warning with recovery counts", async () => {
  const directory = await temporaryDataDirectory("agent-radar-concept-check-recovery-");
  process.env.RADAR_DATA_DIR = directory;
  const official = source("check-recovery-official");
  const practitioner = source("check-recovery-practitioner", { layer: "practitioner" });
  const database = openDatabase();
  upsertSourceCatalog(database, [official, practitioner]);
  const evidence = [
    insertEvidenceArticle(database, official, "recovery-official"),
    insertEvidenceArticle(database, practitioner, "recovery-practitioner"),
  ];
  applyKnowledge(database, knowledgePayload({
    slug: "recoverable-operations",
    canonicalName: "可恢复概念运维",
    evidence,
    claimKey: "recoverable-operations-boundary",
  }));
  markBackfillCompleted(database, evidence, "recoverable-operations");
  database.prepare("UPDATE concept_knowledge SET payload_json = ? WHERE slug = ?")
    .run("{corrupt-current-payload", "recoverable-operations");
  database.close();

  const result = await runCommand("npm", ["run", "--silent", "concepts:check"], {
    environment: { RADAR_DATA_DIR: directory },
  });
  assert.equal(result.code, 0, `存在 last-good 修订时允许带告警通过：\n${result.stdout}\n${result.stderr}`);
  const report = parseCommandJson(result);
  assert.equal(report.status, "warning", "从 last-good 恢复不能伪装成完全健康的 ok");
  assert.equal(report.recoveredConceptCount, 1);
  assert.equal(report.corruptConceptCount, 0);
  assert.ok(
    report.recoveryStatus === "recovered" || Array.isArray(report.warnings),
    "检查结果必须给运维系统一个明确的恢复状态或 warning 列表",
  );
});

test("concepts:check exits nonzero for irrecoverable knowledge and for formal public knowledge with no reachable evidence", async () => {
  const corruptDirectory = await temporaryDataDirectory("agent-radar-concept-check-corrupt-");
  process.env.RADAR_DATA_DIR = corruptDirectory;
  const corruptDatabase = openDatabase();
  corruptDatabase.prepare(`
    INSERT INTO concept_knowledge
      (slug, canonical_name, stage, heat, maturity, current_revision, payload_json, updated_at)
    VALUES (?, ?, 'emerging', 50, 50, 1, ?, ?)
  `).run("irrecoverable-operations", "不可恢复概念", "{invalid-payload", "2026-08-03T03:00:00.000Z");
  corruptDatabase.close();
  const corruptResult = await runCommand("npm", ["run", "--silent", "concepts:check"], {
    environment: { RADAR_DATA_DIR: corruptDirectory },
  });
  assert.notEqual(corruptResult.code, 0, "没有任何 last-good revision 的正式损坏知识必须阻断发布检查");
  const corruptReport = parseCommandJson(corruptResult);
  assert.equal(corruptReport.corruptConceptCount, 1);

  const evidenceDirectory = await temporaryDataDirectory("agent-radar-concept-check-evidence-");
  process.env.RADAR_DATA_DIR = evidenceDirectory;
  const official = source("check-evidence-official");
  const practitioner = source("check-evidence-practitioner", { layer: "practitioner" });
  const evidenceDatabase = openDatabase();
  upsertSourceCatalog(evidenceDatabase, [official, practitioner]);
  const evidence = [
    insertEvidenceArticle(evidenceDatabase, official, "public-evidence-official"),
    insertEvidenceArticle(evidenceDatabase, practitioner, "public-evidence-practitioner"),
  ];
  applyKnowledge(evidenceDatabase, knowledgePayload({
    slug: "unreachable-evidence-operations",
    canonicalName: "证据失联概念运维",
    evidence,
    claimKey: "unreachable-evidence-boundary",
  }));
  markBackfillCompleted(evidenceDatabase, evidence, "unreachable-evidence-operations");
  evidenceDatabase.prepare("UPDATE articles SET publish_decision = 'reject' WHERE url IN (?, ?)")
    .run(evidence[0].url, evidence[1].url);
  evidenceDatabase.close();

  const evidenceResult = await runCommand("npm", ["run", "--silent", "concepts:check"], {
    environment: { RADAR_DATA_DIR: evidenceDirectory },
  });
  assert.notEqual(
    evidenceResult.code,
    0,
    "正式知识即使 payload JSON 结构有效，只要公开投影已没有可达证据、主张或引文，也必须阻断 readiness",
  );
  const evidenceReport = parseCommandJson(evidenceResult);
  assert.ok(
    Number(evidenceReport.qualityFailureCount || evidenceReport.invalidPublicConceptCount || 0) >= 1,
    "检查结果必须暴露结构/证据质量失败计数，不能只返回 formalConceptCount",
  );
});
