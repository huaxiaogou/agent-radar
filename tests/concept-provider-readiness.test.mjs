import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { analyzeConceptKnowledgeArticle } from "../radar/concept-analyze.mjs";
import {
  applyConceptKnowledgeRevision,
  CONCEPT_ANALYZER_VERSION,
  CONCEPT_KNOWLEDGE_SCHEMA_VERSION,
  conceptArticleInputContractHash,
} from "../radar/concept-knowledge.mjs";
import { insertArticle, openDatabase, upsertSourceCatalog } from "../radar/database.mjs";

const projectPath = fileURLToPath(new URL("../", import.meta.url));
const temporaryDirectories = new Set();
const originalDataDirectory = process.env.RADAR_DATA_DIR;

afterEach(async () => {
  if (originalDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
  else process.env.RADAR_DATA_DIR = originalDataDirectory;
  await Promise.all([...temporaryDirectories].map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
    temporaryDirectories.delete(directory);
  }));
});

function source(id, layer) {
  return {
    id,
    name: `${id} source`,
    homepage: `https://${id}.example.com`,
    class: layer === "official" ? "一手工程" : "独立实践者",
    family: layer,
    layer,
    priority: "P0",
    cadence: "4h",
    focus: "概念知识运维",
    independentGroup: id,
    language: "zh",
  };
}

function insertEvidence(database, sourceValue, suffix) {
  const url = `${sourceValue.homepage}/${suffix}`;
  const originalTitle = `${suffix} original evidence`;
  insertArticle(database, {
    url,
    sourceId: sourceValue.id,
    sourceName: sourceValue.name,
    sourceClass: sourceValue.class,
    sourceLayer: sourceValue.layer,
    sourceLanguage: sourceValue.language,
    independentGroup: sourceValue.independentGroup,
    originalTitle,
    originalExcerpt: "概念知识运维证据。",
    contentText: "材料描述了检查点、恢复、权限和验收边界。",
    publishedAt: "2026-08-03T01:00:00.000Z",
    discoveredAt: "2026-08-03T01:05:00.000Z",
    contentHash: `${sourceValue.id}:${suffix}`,
    relevanceScore: 10,
    signalSlug: `${sourceValue.id}-${suffix}`,
    conceptSlug: "provider-readiness",
    title: `${suffix} 的中文工程结论`,
    summary: "材料给出了可以回到原始来源核验的工程机制与边界。",
    implication: "需要用持久状态与验收证据验证恢复路径。",
    topic: "概念",
    stage: "Emerging",
    accent: "engineering",
    tags: ["concept-readiness"],
    analysisMode: "openai",
    publishDecision: "publish",
    editorialScore: 88,
    aiRelevanceScore: 90,
    noveltyScore: 82,
    evidenceScore: 84,
    eventKey: `${sourceValue.id}:${suffix}`,
    candidateConcept: "",
  });
  return {
    url,
    originalTitle,
    sourceName: sourceValue.name,
    sourceLayer: sourceValue.layer,
    independentGroup: sourceValue.independentGroup,
    publishedAt: "2026-08-03T01:00:00.000Z",
  };
}

const CITED_FIELDS = [
  "definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta",
  "aliases", "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs",
  "failureModes", "securityRisks", "operationalConcerns", "applicability", "nonApplicability", "controversies",
];

function knowledgePayload({ slug = "provider-readiness", evidence }) {
  const claimKey = `${slug}-claim`;
  const evidenceUrls = evidence.map((item) => item.url);
  return {
    identityDecision: {
      action: "create-new",
      canonicalSlug: slug,
      confidence: 0.91,
      reason: "该就绪契约在测试中首次建立为具有独立运维问题和机制的规范概念。",
      comparedSlugs: [],
    },
    concept: {
      slug,
      canonicalName: "概念供应商就绪契约",
      aliases: ["供应商就绪契约", "Provider Readiness"],
      stage: "emerging",
      heat: 58,
      maturity: 52,
      definition: "概念供应商就绪契约用结构化输出、证据绑定和可恢复检查保护权威知识。",
      nonDefinition: "它不是只判断接口返回成功，也不是忽略损坏知识的宽松健康检查。",
      problem: "模型输出和持久知识都可能损坏，导致概念知识静默丢失或错误公开。",
      whyNow: "多供应商概念分析进入定时主链路后，需要稳定请求契约与可观测恢复语义。",
      origin: "当前命名来自概念知识运维需求，更早的术语来源仍需按证据继续核验。",
      evolution: ["从单次模型调用演进为带校验、纠错与恢复状态的知识发布链。"],
      mechanism: "适配器要求严格结构化响应，持久层保留追加式修订，并在当前载荷损坏时读取最后有效版本。",
      architecture: "供应商适配器、确定性校验器、SQLite 修订账本和 readiness 检查共同形成发布门禁。",
      designConstraints: ["纠错请求不得重新注入上次模型生成的不可信原值。"],
      implementationPatterns: ["用严格 JSON Schema 和最后有效修订回退保护知识连续性。"],
      antiPatterns: ["只检查正式概念数量而忽略损坏状态和公开证据质量。"],
      tradeoffs: ["增加校验与审计成本，换取供应商切换和数据损坏时的可恢复性。"],
      failureModes: ["当前载荷与修订同时损坏时，正式概念将无法安全投影。"],
      securityRisks: ["把恶意模型输出原样放入纠错提示会形成二次提示注入。"],
      operationalConcerns: ["需要分别暴露健康、已恢复、不可恢复与公开质量失败计数。"],
      applicability: ["适用于定时吸收多来源证据并由模型生成概念知识的服务。"],
      nonApplicability: ["不适用于没有持久知识或公开投影的一次性离线试验。"],
      controversies: ["恢复状态可以继续服务，但不能伪装成完全健康状态。"],
      dailyDelta: "本次增加 OpenAI 严格响应契约与概念损坏恢复的运维边界。",
      lastMeaningfulChange: "2026-08-03T02:00:00.000Z",
    },
    claims: [{
      key: claimKey,
      text: "概念分析必须使用严格输出契约，并让损坏恢复状态可被运维检查识别。",
      kind: "constraint",
      confidence: 0.9,
    }],
    evidence: evidence.map((item) => ({
      ...item,
      supports: [claimKey],
      stance: "support",
    })),
    citations: CITED_FIELDS.map((field) => ({ field, evidenceUrls })),
    relations: [],
  };
}

async function isolatedDatabase(prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.add(directory);
  process.env.RADAR_DATA_DIR = directory;
  const database = openDatabase();
  if (originalDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
  else process.env.RADAR_DATA_DIR = originalDataDirectory;
  return { database, directory };
}

function markBackfillCompleted(database, evidence, slug) {
  const statement = database.prepare(`
    INSERT INTO concept_backfill
      (article_url, content_hash, input_contract_hash, knowledge_schema_version, analyzer_version,
       status, attempted_at, completed_at, last_error, concept_slug, revision)
    VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, NULL, ?, 1)
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
      slug,
    );
  }
}

function seedFormalKnowledge(database, slug = "provider-readiness") {
  const official = source(`${slug}-official`, "official");
  const practitioner = source(`${slug}-practitioner`, "practitioner");
  upsertSourceCatalog(database, [official, practitioner]);
  const evidence = [
    insertEvidence(database, official, "official-evidence"),
    insertEvidence(database, practitioner, "practitioner-evidence"),
  ];
  applyConceptKnowledgeRevision(database, knowledgePayload({ slug, evidence }), {
    provider: "readiness-test",
    model: "readiness-test-model",
    analyzedAt: "2026-08-03T02:00:00.000Z",
    reason: "建立概念 readiness 测试知识",
  });
  markBackfillCompleted(database, evidence, slug);
  return evidence;
}

function runConceptCheck(directory, { environment = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", "scripts/check-concepts.mjs"], {
      cwd: projectPath,
      env: { ...process.env, RADAR_DATA_DIR: directory, NO_COLOR: "1", FORCE_COLOR: "0", ...environment },
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

function parseCheckReport(result) {
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const start = output.indexOf("{");
  assert.notEqual(start, -1, `concepts:check 必须输出机器可读 JSON：\n${output}`);
  return JSON.parse(output.slice(start));
}

test("OpenAI concept adapter uses strict Responses JSON Schema and sanitizes correction retries", async () => {
  const article = {
    url: "https://trusted.example.com/concept-provider-readiness",
    sourceId: "trusted-openai-adapter",
    sourceName: "Trusted OpenAI Adapter Evidence",
    sourceClass: "一手工程",
    sourceLayer: "official",
    independentGroup: "trusted-openai-adapter",
    sourceLanguage: "en",
    originalTitle: "Evidence-bound concept provider readiness",
    originalExcerpt: "Strict structured output and safe correction retries.",
    contentText: "The source describes strict output, evidence binding and correction boundaries.",
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
  const hostileMarker = "DO_NOT_REINJECT_RAW_MODEL_VALUE";
  const hostileUrl = `https://attacker.invalid/${hostileMarker}`;
  const hostile = structuredClone(valid);
  hostile.evidence[0].url = hostileUrl;
  for (const citation of hostile.citations) citation.evidenceUrls = [hostileUrl];
  const requests = [];

  const analyzed = await analyzeConceptKnowledgeArticle(article, {
    provider: "openai",
    environment: {
      OPENAI_API_KEY: "concept-provider-test-key",
      RADAR_OPENAI_CONCEPT_MODEL: "gpt-concept-provider-contract",
      RADAR_OPENAI_CONCEPT_MAX_TOKENS: "4321",
      RADAR_OPENAI_CONCEPT_TIMEOUT_MS: "1000",
    },
    maxAttempts: 2,
    fetchImpl: async (input, init) => {
      const body = JSON.parse(init.body);
      requests.push({ input: String(input), init, body });
      const payload = requests.length === 1 ? hostile : valid;
      return new Response(JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ concepts: [payload] }) }] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.ok(Array.isArray(analyzed));
  assert.equal(analyzed[0].concept.slug, "provider-readiness");
  assert.equal(requests.length, 2, "伪造证据必须触发一次纠错重试");
  const first = requests[0];
  assert.equal(first.input, "https://api.openai.com/v1/responses");
  assert.equal(first.init.method, "POST");
  assert.equal(first.body.model, "gpt-concept-provider-contract");
  assert.equal(first.body.max_output_tokens, 4321);
  assert.equal(first.body.store, false);
  assert.equal(first.body.text?.format?.type, "json_schema");
  assert.equal(first.body.text?.format?.strict, true);
  assert.equal(first.body.text?.format?.additionalProperties, undefined);
  assert.equal(first.body.text?.format?.schema?.additionalProperties, false);
  assert.deepEqual(first.body.text?.format?.schema?.required, ["concepts"]);
  assert.deepEqual(
    first.body.text?.format?.schema?.properties?.concepts?.items?.required,
    ["identityDecision", "concept", "claims", "evidence", "citations", "relations"],
  );

  const correction = String(requests[1].body.instructions || "");
  assert.match(correction, /固定错误类别|evidence-binding|安全字段/u);
  assert.doesNotMatch(correction, new RegExp(hostileMarker, "u"));
  assert.doesNotMatch(correction, /https?:\/\//iu, "纠错说明不得携带模型生成或其他可执行 URL");
  assert.equal(requests[1].body.input, first.body.input, "重试只能复用原始可信输入，不能拼接首轮模型输出");
});

test("concept readiness reports a recoverable current payload as an explicit warning", async () => {
  const { database, directory } = await isolatedDatabase("agent-radar-provider-recovered-");
  seedFormalKnowledge(database, "recoverable-provider-readiness");
  database.prepare("UPDATE concept_knowledge SET payload_json = ? WHERE slug = ?")
    .run("{corrupt-current-payload", "recoverable-provider-readiness");
  database.close();

  const result = await runConceptCheck(directory);
  assert.equal(result.code, 0, `存在最后有效修订时应带告警通过：\n${result.stdout}\n${result.stderr}`);
  const report = parseCheckReport(result);
  assert.equal(report.status, "warning", "自动回退不能伪装为完全健康的 ok");
  assert.equal(report.recoveredConceptCount, 1);
  assert.equal(report.corruptConceptCount, 0);
  assert.ok(Array.isArray(report.warnings) && report.warnings.length > 0, "恢复必须进入机器可读 warnings");
});

test("concept readiness exits nonzero and counts irrecoverable and public-quality failures", async () => {
  const { database, directory } = await isolatedDatabase("agent-radar-provider-corrupt-");
  const evidence = seedFormalKnowledge(database, "unreachable-provider-readiness");
  database.prepare("UPDATE articles SET publish_decision = 'reject' WHERE url IN (?, ?)")
    .run(evidence[0].url, evidence[1].url);
  database.prepare(`
    INSERT INTO concept_knowledge
      (slug, canonical_name, stage, heat, maturity, current_revision, payload_json, updated_at)
    VALUES (?, ?, 'emerging', 50, 50, 1, ?, ?)
  `).run(
    "irrecoverable-provider-readiness",
    "不可恢复供应商就绪知识",
    "{invalid-payload",
    "2026-08-03T03:00:00.000Z",
  );
  database.close();

  const result = await runConceptCheck(directory);
  assert.notEqual(result.code, 0, "不可恢复知识或无可达公开证据必须阻断 readiness");
  const report = parseCheckReport(result);
  assert.equal(report.status, "not-ready");
  assert.equal(report.corruptConceptCount, 1);
  assert.equal(report.qualityFailureCount, 1, "正式概念失去公开证据、主张或引文时必须计入质量失败");
});

test("concept readiness turns a SQLite exception into a safe actionable machine-readable failure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-provider-database-error-"));
  temporaryDirectories.add(directory);
  await writeFile(
    path.join(directory, "agent-radar.sqlite"),
    "this is intentionally not a SQLite database",
    "utf8",
  );
  const deepseekSecret = "deepseek-readiness-secret-must-not-leak";
  const openaiSecret = "openai-readiness-secret-must-not-leak";

  const result = await runConceptCheck(directory, {
    environment: {
      DEEPSEEK_API_KEY: deepseekSecret,
      OPENAI_API_KEY: openaiSecret,
    },
  });
  assert.notEqual(result.code, 0, "SQLite 打开或校验异常必须阻断 readiness，而不是以成功退出掩盖故障");
  const report = parseCheckReport(result);
  assert.equal(report.status, "not-ready");
  const readinessFailure = report.issues?.find((issue) => issue.code === "READINESS_CHECK_FAILED");
  assert.ok(readinessFailure, "数据库异常仍必须保留稳定 READINESS_CHECK_FAILED 机器码");
  const diagnostic = [
    readinessFailure.error,
    readinessFailure.message,
    report.error,
    report.message,
  ].find((value) => typeof value === "string" && value.trim());
  assert.equal(
    typeof diagnostic,
    "string",
    "READINESS_CHECK_FAILED 不能是唯一信息；必须额外输出安全、明确、可操作的 error/message 字段",
  );
  assert.match(diagnostic, /数据库|SQLite|数据目录|存储/u, "诊断必须明确故障属于数据库或 SQLite，而不是泛化为未知失败");
  assert.match(diagnostic, /检查|确认|修复|权限|路径|完整性|重试/u, "诊断必须给出下一步检查或修复方向");

  const output = `${result.stdout}\n${result.stderr}`;
  for (const sensitive of [deepseekSecret, openaiSecret, "DEEPSEEK_API_KEY", "OPENAI_API_KEY", directory]) {
    assert.doesNotMatch(output, new RegExp(sensitive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), "诊断不得泄露密钥、环境变量名或内部绝对数据路径");
  }
});
