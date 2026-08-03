import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { afterEach, test } from "node:test";

import { insertArticle, openDatabase, upsertSourceCatalog } from "../radar/database.mjs";
import {
  applyConceptKnowledgeRevision,
  CONCEPT_ANALYZER_VERSION,
  CONCEPT_KNOWLEDGE_SCHEMA_VERSION,
  getConceptKnowledgeStatus,
  getConceptPublicationReadiness,
  runConceptKnowledgeBackfill,
} from "../radar/concept-knowledge.mjs";
import { buildSnapshot, writeSnapshotAtomic } from "../radar/snapshot.mjs";

const originalDataDirectory = process.env.RADAR_DATA_DIR;
const temporaryDirectories = new Set();

const CITABLE_FIELDS = [
  "definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta",
  "aliases", "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs",
  "failureModes", "securityRisks", "operationalConcerns", "applicability", "nonApplicability", "controversies",
];

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
    homepage: `https://${id}.example.test`,
    class: layer === "official" ? "一手工程" : layer === "practitioner" ? "独立实践者" : "中文社区",
    family: layer,
    layer,
    priority: "P0",
    cadence: "4h",
    focus: "概念发布门禁",
    independentGroup: id,
    language: layer === "community" ? "zh" : "en",
  };
}

async function createDatabase(prefix = "agent-radar-concept-publication-gates-") {
  const directory = await mkdtemp(`${os.tmpdir()}/${prefix}`);
  temporaryDirectories.add(directory);
  process.env.RADAR_DATA_DIR = directory;
  const database = openDatabase();
  return { database, directory };
}

function insertEvidence(database, sourceValue, suffix, { publishDecision = "publish" } = {}) {
  const url = `${sourceValue.homepage}/${suffix}`;
  insertArticle(database, {
    url,
    sourceId: sourceValue.id,
    sourceName: sourceValue.name,
    sourceClass: sourceValue.class,
    sourceLayer: sourceValue.layer,
    sourceLanguage: sourceValue.language,
    independentGroup: sourceValue.independentGroup,
    originalTitle: `${suffix} original evidence`,
    originalExcerpt: "Evidence for an evidence-bound engineering concept.",
    contentText: "The material describes checkpoints, approvals, implementation boundaries and verification.",
    publishedAt: "2026-08-03T04:00:00.000Z",
    discoveredAt: "2026-08-03T04:05:00.000Z",
    contentHash: `${sourceValue.id}:${suffix}`,
    relevanceScore: 95,
    signalSlug: `${sourceValue.id}-${suffix}`,
    conceptSlug: "publication-gate-concept",
    title: `${suffix} 的中文工程结论`,
    summary: "材料提供可回到原始链接核验的中文工程结论。",
    implication: "公开知识必须保持证据、主张和正文引用的完整绑定。",
    topic: "概念",
    stage: "Emerging",
    accent: "engineering",
    tags: ["concept-publication-gate"],
    analysisMode: "deepseek",
    publishDecision,
    editorialScore: 90,
    aiRelevanceScore: 90,
    noveltyScore: 80,
    evidenceScore: sourceValue.layer === "community" ? 55 : 90,
    eventKey: `${sourceValue.id}:${suffix}`,
    candidateConcept: publishDecision === "watch" ? "概念发布观察" : "",
  });
  return {
    url,
    originalTitle: `${suffix} original evidence`,
    sourceName: sourceValue.name,
    sourceLayer: sourceValue.layer,
    independentGroup: sourceValue.independentGroup,
    publishedAt: "2026-08-03T04:00:00.000Z",
  };
}

function knowledgePayload({
  slug = "publication-gate-concept",
  evidence,
  definition = "概念发布门禁把可发布证据、工程正文和原子快照绑定为可持续校验的知识发布契约。",
  sparseDepth = false,
} = {}) {
  const concept = {
    slug,
    canonicalName: "概念发布门禁",
    aliases: ["发布门禁", "Concept Publication Gate"],
    stage: "emerging",
    heat: 50,
    maturity: 50,
    definition,
    nonDefinition: "它不是只要有页面可展示就允许发布，也不是把社区猜测直接升级为正式知识。",
    problem: "概念正文、主张和字段引文若失去同一批公开证据，页面会产生无法追溯的工程结论。",
    whyNow: "定时采集和模型补刷会持续改变概念，发布路径需要独立于人工检查的硬门禁。",
    origin: "该名称来自知识库发布链的工程约束，原始实践来源仍需要持续回溯。",
    evolution: ["从离线人工核验演进为每次公开快照都执行的质量门禁。"],
    mechanism: "写入器校验正式概念的公开证据、主张绑定和每个非空字段的 publish 引文后才原子替换快照。",
    architecture: "文章账本、概念修订、质量校验器和原子快照写入器共同组成发布边界。",
    designConstraints: sparseDepth ? [] : ["任何非空公开语义字段都必须由当前 publish 证据逐字段支撑。"],
    implementationPatterns: sparseDepth ? [] : ["在快照写入前从 SQLite 权威当前修订重新计算公开质量。"],
    antiPatterns: ["用离线检查替代实际公开写入边界。"],
    tradeoffs: sparseDepth ? [] : ["增加每次发布的校验成本，换取公开知识可追溯性。"],
    failureModes: sparseDepth ? [] : ["字段引文被降级为 watch 后，正文可能与公开证据失去绑定。"],
    securityRisks: ["未校验链接会把伪造材料写入公开知识。"],
    operationalConcerns: ["需要观测写入被何种公开质量失败阻断。"],
    applicability: sparseDepth ? [] : ["适用于由多来源证据持续更新的 Agent 工程概念。"],
    nonApplicability: sparseDepth ? [] : ["不适用于没有原始证据的营销术语或一次性猜测。"],
    controversies: [],
    dailyDelta: "本次修订明确了正式知识的公开发布边界。",
    lastMeaningfulChange: "2026-08-03T05:00:00.000Z",
  };
  const claimKey = "publish-binding-claim";
  const normalizedEvidence = evidence.map((item) => ({
    ...item,
    supports: [claimKey],
    stance: "support",
  }));
  return {
    concept,
    claims: [{
      key: claimKey,
      text: "公开概念的每个工程结论都必须可以回到当前可发布的原始材料。",
      kind: "constraint",
      confidence: 0.9,
    }],
    evidence: normalizedEvidence,
    citations: CITABLE_FIELDS
      .filter((field) => typeof concept[field] === "string" || (Array.isArray(concept[field]) && concept[field].length > 0))
      .map((field) => ({ field, evidenceUrls: normalizedEvidence.map((item) => item.url) })),
    relations: [],
  };
}

function apply(database, payload, reason) {
  return applyConceptKnowledgeRevision(database, payload, {
    provider: "publication-gate-test",
    model: "publication-gate-test-model",
    analyzedAt: "2026-08-03T05:00:00.000Z",
    reason,
  });
}

async function seedFormalConcept(database, slug = "publication-gate-concept") {
  const official = source(`${slug}-official`, "official");
  const practitioner = source(`${slug}-practitioner`, "practitioner");
  const community = source(`${slug}-community`, "community");
  upsertSourceCatalog(database, [official, practitioner, community]);
  const officialEvidence = insertEvidence(database, official, "official-publish");
  const practitionerEvidence = insertEvidence(database, practitioner, "practitioner-publish");
  const payload = knowledgePayload({ slug, evidence: [officialEvidence, practitionerEvidence] });
  apply(database, payload, "建立已正式晋级的概念");
  const snapshot = await buildSnapshot(database);
  const concept = snapshot.concepts.find((item) => item.slug === slug);
  assert.ok(concept, "fixture 必须先通过 official + practitioner 两个独立 publish 组进入正式目录");
  return { official, practitioner, community, officialEvidence, practitionerEvidence, baseline: concept };
}

test("a community watch-only revision cannot rewrite an already formal concept's public semantics or citations", async () => {
  const { database } = await createDatabase();
  try {
    const seeded = await seedFormalConcept(database);
    const watchEvidence = insertEvidence(database, seeded.community, "community-watch", { publishDecision: "watch" });
    const watchOnlyRewrite = knowledgePayload({
      evidence: [watchEvidence],
      definition: "社区观察提出完全不同的概念定义，但它尚未取得独立 publish 工程证据。",
    });

    // The ingestion writer may reject, defer, or append a candidate-side revision;
    // regardless of the internal disposition, the public formal projection must not change.
    try {
      apply(database, watchOnlyRewrite, "仅社区观察材料尝试改写正式正文");
    } catch {
      // Rejection is a valid containment strategy; compare the retained public projection below.
    }
    const snapshot = await buildSnapshot(database);
    const publicConcept = snapshot.concepts.find((item) => item.slug === "publication-gate-concept");

    assert.ok(publicConcept, "watch-only 更新不得让已正式晋级概念从公开目录消失");
    assert.equal(publicConcept.definition, seeded.baseline.definition, "watch-only 证据不得改写正式概念 definition");
    assert.deepEqual(publicConcept.claims, seeded.baseline.claims, "watch-only 证据不得改写正式概念公开主张");
    assert.ok(
      publicConcept.citations.every((citation) => citation.evidenceUrls.every((url) => (
        url === seeded.officialEvidence.url || url === seeded.practitionerEvidence.url
      ))),
      "正式概念的非空字段不得保留仅 watch 的 citation URL",
    );
    assert.ok(
      publicConcept.citations.length >= seeded.baseline.citations.length,
      "watch-only 更新不能造成正式概念非空字段失去 publish citation",
    );
  } finally {
    database.close();
  }
});

test("every public snapshot write revalidates formal concept evidence, claims, citations, and irrecoverable payloads", async (t) => {
  const cases = [
    {
      name: "formal concept with no current publish evidence",
      mutate: async ({ database, officialEvidence, practitionerEvidence }) => {
        database.prepare("UPDATE articles SET publish_decision = 'watch' WHERE url IN (?, ?)")
          .run(officialEvidence.url, practitionerEvidence.url);
      },
    },
    {
      name: "formal concept with a public claim no longer bound to publish evidence",
      mutate: async ({ database }) => {
        const row = database.prepare("SELECT payload_json FROM concept_knowledge WHERE slug = ?").get("publication-gate-concept");
        const current = JSON.parse(row.payload_json);
        current.claims[0].evidenceUrls = [];
        database.prepare("UPDATE concept_knowledge SET payload_json = ? WHERE slug = ?")
          .run(JSON.stringify(current), "publication-gate-concept");
      },
    },
    {
      name: "formal concept with a non-empty field cited only by watch evidence",
      mutate: async ({ database, community }) => {
        const watchEvidence = insertEvidence(database, community, "definition-watch", { publishDecision: "watch" });
        const row = database.prepare("SELECT payload_json FROM concept_knowledge WHERE slug = ?").get("publication-gate-concept");
        const current = JSON.parse(row.payload_json);
        current.evidence.push({
          ...watchEvidence,
          supports: [current.claims[0].key],
          stance: "support",
        });
        current.citations.find((citation) => citation.field === "definition").evidenceUrls = [watchEvidence.url];
        database.prepare("UPDATE concept_knowledge SET payload_json = ? WHERE slug = ?")
          .run(JSON.stringify(current), "publication-gate-concept");
      },
    },
    {
      name: "irrecoverable formal concept payload",
      mutate: async ({ database }) => {
        database.prepare(`
          INSERT INTO concept_knowledge
            (slug, canonical_name, stage, heat, maturity, current_revision, payload_json, updated_at)
          VALUES (?, ?, 'emerging', 50, 50, 1, ?, ?)
        `).run(
          "irrecoverable-publication-gate",
          "不可恢复发布概念",
          "{corrupt-current-and-no-revision",
          "2026-08-03T05:10:00.000Z",
        );
      },
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const { database } = await createDatabase(`agent-radar-concept-snapshot-${item.name.replace(/[^a-z]+/giu, "-")}-`);
      try {
        const seeded = await seedFormalConcept(database);
        await item.mutate({ database, ...seeded });
        const snapshot = await buildSnapshot(database);
        await assert.rejects(
          () => writeSnapshotAtomic(snapshot),
          /concept|概念|publish|公开|evidence|证据|claim|主张|citation|引文|corrupt|损坏|recover/i,
          "公开快照写入器必须自己阻断该正式概念质量异常，不能只依赖手工 concepts:check",
        );
      } finally {
        database.close();
      }
    });
  }
});

test("formal promotion requires full engineering depth with publish citations and practitioner implementation evidence", async () => {
  const { database } = await createDatabase();
  try {
    const official = source("depth-official", "official");
    const practitioner = source("depth-practitioner", "practitioner");
    upsertSourceCatalog(database, [official, practitioner]);
    const officialEvidence = insertEvidence(database, official, "depth-official-publish");
    const practitionerEvidence = insertEvidence(database, practitioner, "depth-practitioner-publish");

    const sparse = knowledgePayload({
      slug: "depth-gated-concept",
      evidence: [officialEvidence, practitionerEvidence],
      sparseDepth: true,
    });
    apply(database, sparse, "缺少工程深度字段的晋级尝试");
    let snapshot = await buildSnapshot(database);
    assert.equal(
      snapshot.concepts.some((item) => item.slug === "depth-gated-concept"),
      false,
      "即使已有 official + practitioner 两个独立 publish 组，缺少关键工程深度字段也必须保持 candidate",
    );

    const missingRuntimeDepth = knowledgePayload({
      slug: "depth-gated-concept",
      evidence: [officialEvidence, practitionerEvidence],
    });
    missingRuntimeDepth.concept.antiPatterns = [];
    missingRuntimeDepth.concept.operationalConcerns = [];
    missingRuntimeDepth.citations = missingRuntimeDepth.citations.filter((citation) => (
      !["antiPatterns", "operationalConcerns"].includes(citation.field)
    ));
    apply(database, missingRuntimeDepth, "仍缺少反模式与运行关注点的晋级尝试");
    snapshot = await buildSnapshot(database);
    assert.equal(
      snapshot.concepts.some((item) => item.slug === "depth-gated-concept"),
      false,
      "只有实现、约束、权衡和适用边界仍不够；正式概念必须说明该机制自己的反模式与运行关注点",
    );

    const full = knowledgePayload({
      slug: "depth-gated-concept",
      evidence: [officialEvidence, practitionerEvidence],
    });
    // The practitioner must explicitly be the implementation-pattern evidence,
    // not merely a second corroborating source in the concept-wide evidence set.
    full.citations.find((citation) => citation.field === "implementationPatterns").evidenceUrls = [practitionerEvidence.url];
    full.citations.find((citation) => citation.field === "designConstraints").evidenceUrls = [officialEvidence.url];
    full.citations.find((citation) => citation.field === "tradeoffs").evidenceUrls = [officialEvidence.url];
    full.citations.find((citation) => citation.field === "failureModes").evidenceUrls = [practitionerEvidence.url];
    full.citations.find((citation) => citation.field === "applicability").evidenceUrls = [practitionerEvidence.url];
    full.citations.find((citation) => citation.field === "nonApplicability").evidenceUrls = [practitionerEvidence.url];
    apply(database, full, "补齐深度字段与实践者模式证据");
    snapshot = await buildSnapshot(database);
    const formal = snapshot.concepts.find((item) => item.slug === "depth-gated-concept");
    assert.ok(formal, "关键深度字段齐全且至少一项 implementation/pattern 由 practitioner publish 支撑后才可正式晋级");
    const citationByField = new Map(formal.citations.map((citation) => [citation.field, citation.evidenceUrls]));
    for (const field of [
      "implementationPatterns", "designConstraints", "antiPatterns", "tradeoffs", "failureModes",
      "operationalConcerns", "applicability", "nonApplicability",
    ]) {
      assert.ok(citationByField.get(field)?.length, `正式概念必须公开 ${field} 的 publish citation`);
    }
    assert.ok(
      citationByField.get("implementationPatterns")?.includes(practitionerEvidence.url),
      "至少一条 practitioner publish implementation/pattern 证据必须真实绑定 implementationPatterns",
    );
  } finally {
    database.close();
  }
});

test("P2 contract: concept readiness exposes at most ten safe current failed/conflict summaries in newest-first order", async () => {
  const { database } = await createDatabase("agent-radar-concept-recent-failures-");
  try {
    const failureSource = source("readiness-failure-source", "official");
    upsertSourceCatalog(database, [failureSource]);
    const failBackfill = async (evidence, attemptedAt, {
      analyzerVersion = CONCEPT_ANALYZER_VERSION,
      secret = "READINESS_SECRET",
    } = {}) => {
      const result = await runConceptKnowledgeBackfill({
        database,
        articleUrls: [evidence.url],
        analyzeArticle: async () => {
          throw new Error(`provider returned raw model output; api_key=${secret}; MODEL_ORIGINAL_SHOULD_NOT_LEAK`);
        },
        batchSize: 1,
        concurrency: 1,
        now: attemptedAt,
        knowledgeSchemaVersion: CONCEPT_KNOWLEDGE_SCHEMA_VERSION,
        analyzerVersion,
      });
      assert.equal(result.failedCount, 1, "fixture 必须通过真实 backfill 失败路径写入 state、attempt 与 input contract hash");
      const state = database.prepare(`
        SELECT input_contract_hash
        FROM concept_backfill
        WHERE article_url = ?
      `).get(evidence.url);
      assert.match(state?.input_contract_hash || "", /^[a-f0-9]{64}$/u, "当前失败 fixture 不能使用 NULL/伪造 input_contract_hash");
    };
    const expectedNewestFirst = [];
    for (let index = 0; index < 12; index += 1) {
      const suffix = `current-failure-${String(index).padStart(2, "0")}`;
      const evidence = insertEvidence(database, failureSource, suffix);
      const status = index % 2 === 0 ? "failed" : "conflict";
      const attemptedAt = `2026-08-03T${String(index).padStart(2, "0")}:00:00.000Z`;
      await failBackfill(evidence, attemptedAt, { secret: `READINESS_SECRET_${index}` });
      if (status === "conflict") {
        database.prepare("UPDATE concept_backfill SET status = 'conflict' WHERE article_url = ?").run(evidence.url);
        database.prepare("UPDATE concept_backfill_attempts SET status = 'conflict' WHERE article_url = ?").run(evidence.url);
      }
      expectedNewestFirst.unshift({ articleUrl: evidence.url, status, attemptedAt });
    }

    // These rows must not appear: they are no longer the current public
    // article/analyzer boundary even though their historical status failed.
    const staleEvidence = insertEvidence(database, failureSource, "stale-analyzer-failure");
    await failBackfill(staleEvidence, "2026-08-03T23:00:00.000Z", {
      analyzerVersion: "concept-analyzer-obsolete",
      secret: "STALE_SECRET",
    });
    const mismatchedEvidence = insertEvidence(database, failureSource, "mismatched-hash-failure");
    await failBackfill(mismatchedEvidence, "2026-08-03T22:00:00.000Z", { secret: "HASH_SECRET" });
    database.prepare(`
      UPDATE articles
      SET content_hash = 'new-authoritative-content-hash',
          content_roles_json = '["interview"]'
      WHERE url = ?
    `).run(mismatchedEvidence.url);

    const knowledgeStatus = getConceptKnowledgeStatus(database);
    assert.equal(knowledgeStatus.failedArticleCount, 12, "计数必须只覆盖当前 publish/watch + 当前版本边界的 failed/conflict backlog");
    assert.ok(Array.isArray(knowledgeStatus.recentFailures), "concept knowledge status 必须返回机器可读 recentFailures 数组");
    assert.equal(knowledgeStatus.recentFailures.length, 10, "recentFailures 必须硬限制最多 10 条，避免状态接口无界增长");
    assert.deepEqual(
      knowledgeStatus.recentFailures.map((item) => ({
        articleUrl: item.articleUrl,
        status: item.status,
        attemptedAt: item.attemptedAt,
      })),
      expectedNewestFirst.slice(0, 10),
      "recentFailures 必须按 attemptedAt 最新优先，并且至少暴露 articleUrl/status/attemptedAt 定位字段",
    );
    const serialized = JSON.stringify(knowledgeStatus.recentFailures);
    assert.doesNotMatch(serialized, /last_error|lastError|modelOutput|MODEL_ORIGINAL|provider returned raw model output/iu, "readiness 不得回显 last_error 或模型原文");
    assert.doesNotMatch(serialized, /api_key|READINESS_SECRET|STALE_SECRET|HASH_SECRET/iu, "readiness 不得通过失败摘要泄露凭据");

    const readiness = getConceptPublicationReadiness(database);
    assert.deepEqual(readiness.recentFailures, knowledgeStatus.recentFailures, "publication readiness 必须继承同一有界安全失败摘要，不能另造不一致查询");
    const snapshot = await buildSnapshot(database);
    assert.deepEqual(
      snapshot.status.conceptReadiness.recentFailures,
      knowledgeStatus.recentFailures,
      "公开状态快照必须携带安全 recentFailures，运维不能只能登录 SQLite 才能定位失败文章",
    );
  } finally {
    database.close();
  }
});

test("P2 contract: ready concept paths expose an explicit empty recentFailures array", async () => {
  const { database } = await createDatabase("agent-radar-concept-ready-failures-");
  try {
    const knowledgeStatus = getConceptKnowledgeStatus(database);
    const readiness = getConceptPublicationReadiness(database);
    const snapshot = await buildSnapshot(database);
    assert.deepEqual(knowledgeStatus.recentFailures, [], "没有当前失败 backlog 时 status 必须返回 []，不能省略字段或返回 null");
    assert.deepEqual(readiness.recentFailures, [], "ready publication path 必须保持 recentFailures=[]");
    assert.deepEqual(snapshot.status.conceptReadiness.recentFailures, [], "公开快照 ready path 必须稳定输出空数组");
  } finally {
    database.close();
  }
});

test("start and restart require concept quality readiness before they can change service state", async () => {
  const start = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../scripts/start.sh", import.meta.url), "utf8"));
  const restart = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../scripts/restart.sh", import.meta.url), "utf8"));
  const conceptCheck = /check-concepts\.mjs|concepts:check/u;

  const startCheckIndex = start.search(conceptCheck);
  assert.ok(startCheckIndex >= 0, "start.sh 必须在启动前执行 concepts:check 概念质量门禁");
  assert.ok(
    startCheckIndex < start.indexOf("nohup node"),
    "start.sh 的 concepts:check 失败必须发生在创建新服务进程之前",
  );
  const restartCheckIndex = restart.search(conceptCheck);
  assert.ok(restartCheckIndex >= 0, "restart.sh 必须独立执行 concepts:check 概念质量门禁");
  assert.ok(
    restartCheckIndex < restart.indexOf('/stop.sh"'),
    "restart.sh 的 concepts:check 失败必须发生在停止现有服务之前",
  );
});
