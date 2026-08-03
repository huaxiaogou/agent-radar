import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { test } from "node:test";
import {
  insertArticle,
  openDatabase,
  upsertSourceCatalog,
} from "../radar/database.mjs";
import {
  getConceptKnowledge,
  runConceptKnowledgeBackfill,
} from "../radar/concept-knowledge.mjs";
import { buildSnapshot } from "../radar/snapshot.mjs";

const SOURCES = {
  officialWatch: {
    id: "official-watch-alpha",
    name: "Official Watch Alpha",
    homepage: "https://official-watch-alpha.example.com",
    class: "一手工程",
    family: "official",
    layer: "official",
    priority: "P0",
    cadence: "4h",
    focus: "Agent evidence accumulation",
    independentGroup: "official-watch-alpha",
    language: "en",
  },
  practitionerWatch: {
    id: "practitioner-watch-beta",
    name: "Practitioner Watch Beta",
    homepage: "https://practitioner-watch-beta.example.com",
    class: "实践者",
    family: "practitioner",
    layer: "practitioner",
    priority: "P1",
    cadence: "8h",
    focus: "Agent evidence accumulation",
    independentGroup: "practitioner-watch-beta",
    language: "zh",
  },
  officialPublish: {
    id: "official-publish-gamma",
    name: "Official Publish Gamma",
    homepage: "https://official-publish-gamma.example.com",
    class: "一手工程",
    family: "official",
    layer: "official",
    priority: "P0",
    cadence: "4h",
    focus: "Agent evidence accumulation",
    independentGroup: "official-publish-gamma",
    language: "en",
  },
};

const CITABLE_FIELDS = [
  "definition",
  "nonDefinition",
  "problem",
  "whyNow",
  "origin",
  "mechanism",
  "architecture",
  "dailyDelta",
  "aliases",
  "evolution",
  "designConstraints",
  "implementationPatterns",
  "antiPatterns",
  "tradeoffs",
  "failureModes",
  "securityRisks",
  "operationalConcerns",
  "applicability",
  "nonApplicability",
];

async function withDatabase(run) {
  const directory = await mkdtemp(`${os.tmpdir()}/agent-radar-evidence-accumulation-`);
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  process.env.RADAR_DATA_DIR = directory;
  const database = openDatabase();
  try {
    await run(database);
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(directory, { recursive: true, force: true });
  }
}

function insertEvidenceArticle(database, source, {
  suffix,
  publishDecision,
  publishedAt = "2026-08-01T06:00:00.000Z",
}) {
  const url = `${source.homepage}/${suffix}`;
  insertArticle(database, {
    url,
    sourceId: source.id,
    sourceName: source.name,
    sourceClass: source.class,
    independentGroup: source.independentGroup,
    sourceLayer: source.layer,
    sourceLanguage: source.language,
    originalTitle: `${source.name}: ${suffix}`,
    originalExcerpt: "Evidence accumulation for a durable coding-agent runtime.",
    contentText: "The article documents a durable coding-agent runtime with auditable checkpoints and recovery evidence.",
    publishedAt,
    discoveredAt: publishedAt,
    contentHash: `${source.id}:${suffix}:v1`,
    relevanceScore: 10,
    signalSlug: `evidence-accumulation-${source.id}-${suffix}`,
    conceptSlug: "evidence-accumulation-loop",
    title: "可追溯的智能体证据累积闭环",
    summary: "来源提供了可持续累积的运行时证据，并明确区分候选观察与正式知识证据。",
    implication: "知识修订不能依赖模型在每次分析中完整复述历史材料。",
    topic: "工程",
    stage: "Emerging",
    accent: "engineering",
    tags: ["agent-runtime", "evidence"],
    analysisMode: "deepseek",
    publishDecision,
    editorialScore: 88,
    aiRelevanceScore: 94,
    noveltyScore: 82,
    evidenceScore: 85,
    eventKey: `evidence-accumulation:${source.id}:${suffix}`,
    candidateConcept: "",
  });
  return url;
}

function knowledgePayload(article, {
  claimKey,
  claimText,
  claimKind = "mechanism",
  maturity = 100,
  stage = "validated",
  definition = "证据累积闭环让每次概念修订在保留历史有效证据的基础上，持续吸收新的独立来源。",
  mechanism = "系统按原始链接和主张键合并仍然有效的历史证据，再由本地规则重新计算独立来源与成熟度。",
  architecture = "文章分析器只提交本次材料，SQLite 修订账本负责证据合并、字段引用和生命周期裁决。",
}) {
  return {
    concept: {
      slug: "evidence-accumulation-loop",
      canonicalName: "Evidence Accumulation Loop",
      aliases: ["证据累积闭环"],
      stage,
      heat: 72,
      maturity,
      definition,
      nonDefinition: "它不是要求模型在每次分析中重新复述全部历史文章，也不是用热度代替证据成熟度。",
      problem: "逐篇异步分析容易让新一轮模型输出覆盖旧证据，造成知识和成熟度在修订间倒退。",
      whyNow: "长期运行的技术雷达会不断接收增量材料，因此必须把历史证据累积交给确定性系统。",
      origin: "这一机制来自版本化知识库对增量证据、历史追溯和稳定晋升规则的共同要求。",
      evolution: ["从单次文章分析演进为可恢复、可审计的证据累积流程。"],
      mechanism,
      architecture,
      designConstraints: ["只有正式发布且来源组独立的支持证据才能参与生命周期晋升。"],
      implementationPatterns: ["以文章内容哈希作为幂等边界，按修订追加证据与主张。"],
      antiPatterns: ["让每轮模型输出静默覆盖此前已经验证的知识和证据。"],
      tradeoffs: ["增加版本和证据存储成本，以换取可追溯性和失败恢复能力。"],
      failureModes: ["错误复用主张键会让旧证据被误解释为支持新的语义。"],
      securityRisks: ["未经校验的外部链接可能被伪造为权威证据。"],
      operationalConcerns: ["并发回填必须通过租约和内容哈希避免重复修订。"],
      applicability: ["适用于持续吸收多来源材料并维护工程判断的知识库。"],
      nonApplicability: ["不适用于没有原始来源且无法形成可验证主张的内容。"],
      controversies: [],
      dailyDelta: "新增一组独立来源，并保留此前有效的主张、证据与字段引用。",
      lastMeaningfulChange: article.discovered_at,
    },
    claims: [{
      key: claimKey,
      text: claimText,
      kind: claimKind,
      confidence: 0.88,
    }],
    evidence: [{
      url: article.url,
      originalTitle: article.original_title,
      sourceName: article.source_name,
      sourceLayer: article.source_layer,
      independentGroup: article.independent_group,
      supports: [claimKey],
      stance: "support",
      publishedAt: article.published_at,
    }],
    citations: CITABLE_FIELDS.map((field) => ({ field, evidenceUrls: [article.url] })),
    relations: [],
  };
}

function currentArticle(database, url) {
  return database.prepare("SELECT * FROM articles WHERE url = ?").get(url);
}

test("incremental revisions accumulate prior evidence, claims and field citations while deterministic source rules own maturity", async () => {
  await withDatabase(async (database) => {
    upsertSourceCatalog(database, [SOURCES.officialPublish, SOURCES.practitionerWatch]);
    const firstUrl = insertEvidenceArticle(database, SOURCES.officialPublish, {
      suffix: "checkpoint-contract",
      publishDecision: "publish",
    });
    const first = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [firstUrl],
      batchSize: 1,
      now: "2026-08-02T09:00:00.000Z",
      analyzeArticle: async () => knowledgePayload(currentArticle(database, firstUrl), {
        claimKey: "checkpoint-contract",
        claimText: "每次不可逆副作用前都必须先持久化可验证的检查点。",
      }),
    });
    assert.equal(first.processedCount, 1);

    const secondUrl = insertEvidenceArticle(database, SOURCES.practitionerWatch, {
      suffix: "replay-audit",
      publishDecision: "publish",
      publishedAt: "2026-08-02T10:00:00.000Z",
    });
    const second = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [secondUrl],
      batchSize: 1,
      now: "2026-08-02T10:00:00.000Z",
      analyzeArticle: async () => knowledgePayload(currentArticle(database, secondUrl), {
        claimKey: "replay-audit",
        claimText: "恢复执行必须留下能够区分首次执行和重放的审计证据。",
        maturity: 1,
      }),
    });
    assert.equal(second.processedCount, 1);

    const concept = getConceptKnowledge(database, "evidence-accumulation-loop")?.concept;
    const definitionCitation = concept?.citations.find((item) => item.field === "definition");
    assert.deepEqual({
      evidenceUrls: concept?.evidence.map((item) => item.url).sort(),
      claimKeys: concept?.claims.map((item) => item.key).sort(),
      definitionCitationUrls: definitionCitation?.evidenceUrls.slice().sort(),
      independentSourceGroups: concept?.independentSourceGroups,
      maturity: concept?.maturity,
    }, {
      evidenceUrls: [firstUrl, secondUrl].sort(),
      claimKeys: ["checkpoint-contract", "replay-audit"],
      definitionCitationUrls: [firstUrl, secondUrl].sort(),
      independentSourceGroups: 2,
      maturity: 100,
    }, "增量 LLM 只提交新文章时，SQLite 当前知识必须累计旧证据/主张/字段引用，并按全部正式独立来源确定成熟度");
  });
});

test("official and practitioner watch evidence remains candidate-only until two independent publish support groups earn formal maturity", async () => {
  await withDatabase(async (database) => {
    upsertSourceCatalog(database, Object.values(SOURCES));
    const officialWatchUrl = insertEvidenceArticle(database, SOURCES.officialWatch, {
      suffix: "official-watch",
      publishDecision: "watch",
    });
    const practitionerWatchUrl = insertEvidenceArticle(database, SOURCES.practitionerWatch, {
      suffix: "practitioner-watch",
      publishDecision: "watch",
      publishedAt: "2026-08-02T09:10:00.000Z",
    });
    const watchArticles = new Map([
      [officialWatchUrl, { key: "official-watch-observation", text: "官方观察材料只用于形成候选，不直接构成正式成熟度证据。" }],
      [practitionerWatchUrl, { key: "practitioner-watch-observation", text: "实践者观察材料在正式发布前只能补充候选概念的发现上下文。" }],
    ]);
    const watch = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [...watchArticles.keys()],
      batchSize: 10,
      now: "2026-08-02T09:30:00.000Z",
      analyzeArticle: async (article) => {
        const claim = watchArticles.get(article.url);
        return knowledgePayload(article, { claimKey: claim.key, claimText: claim.text });
      },
    });
    assert.equal(watch.processedCount, 2, "official/practitioner watch 必须进入候选分析而不是被丢弃");

    let concept = getConceptKnowledge(database, "evidence-accumulation-loop")?.concept;
    let snapshot = await buildSnapshot(database);
    assert.deepEqual({
      stage: concept?.stage,
      maturity: concept?.maturity,
      independentSourceGroups: concept?.independentSourceGroups,
      formalInSnapshot: snapshot.concepts.some((item) => item.slug === "evidence-accumulation-loop"),
      candidateInSnapshot: snapshot.candidateConcepts.some((item) => item.slug === "evidence-accumulation-loop"),
    }, {
      stage: "candidate",
      maturity: 50,
      independentSourceGroups: 0,
      formalInSnapshot: false,
      candidateInSnapshot: true,
    }, "watch 的来源层级再高也不得计入 formal maturity 或晋升 Emerging/Validated");

    const publishUrl = insertEvidenceArticle(database, SOURCES.officialPublish, {
      suffix: "formal-publish",
      publishDecision: "publish",
      publishedAt: "2026-08-02T10:00:00.000Z",
    });
    const publish = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [publishUrl],
      batchSize: 1,
      now: "2026-08-02T10:00:00.000Z",
      analyzeArticle: async (article) => knowledgePayload(article, {
        claimKey: "official-watch-observation",
        claimText: "官方观察材料只用于形成候选，不直接构成正式成熟度证据。",
      }),
    });
    assert.equal(publish.processedCount, 1);

    concept = getConceptKnowledge(database, "evidence-accumulation-loop")?.concept;
    snapshot = await buildSnapshot(database);
    assert.deepEqual({
      stage: concept?.stage,
      maturity: concept?.maturity,
      independentSourceGroups: concept?.independentSourceGroups,
      evidenceUrls: concept?.evidence.map((item) => item.url).sort(),
      formalInSnapshot: snapshot.concepts.some((item) => item.slug === "evidence-accumulation-loop"),
      candidateInSnapshot: snapshot.candidateConcepts.some((item) => item.slug === "evidence-accumulation-loop"),
    }, {
      stage: "candidate",
      maturity: 75,
      independentSourceGroups: 1,
      evidenceUrls: [officialWatchUrl, practitionerWatchUrl, publishUrl].sort(),
      formalInSnapshot: false,
      candidateInSnapshot: true,
    }, "单一 publish 来源组仍不足以晋升；两个历史 watch 只能保留为上下文、不能冒充正式独立来源");

    const secondPublishUrl = insertEvidenceArticle(database, SOURCES.practitionerWatch, {
      suffix: "second-formal-publish",
      publishDecision: "publish",
      publishedAt: "2026-08-02T11:00:00.000Z",
    });
    const secondPublish = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [secondPublishUrl],
      batchSize: 1,
      now: "2026-08-02T11:00:00.000Z",
      analyzeArticle: async (article) => knowledgePayload(article, {
        claimKey: "practitioner-watch-observation",
        claimText: "实践者观察材料在正式发布前只能补充候选概念的发现上下文。",
      }),
    });
    assert.equal(secondPublish.processedCount, 1);

    concept = getConceptKnowledge(database, "evidence-accumulation-loop")?.concept;
    snapshot = await buildSnapshot(database);
    assert.deepEqual({
      stage: concept?.stage,
      independentSourceGroups: concept?.independentSourceGroups,
      formalInSnapshot: snapshot.concepts.some((item) => item.slug === "evidence-accumulation-loop"),
      candidateInSnapshot: snapshot.candidateConcepts.some((item) => item.slug === "evidence-accumulation-loop"),
    }, {
      stage: "emerging",
      independentSourceGroups: 2,
      formalInSnapshot: true,
      candidateInSnapshot: false,
    }, "至少两个独立 publish support 组且包含 official/practitioner 后，候选才可晋升 Emerging");
  });
});

test("persisted concept payload stays normalized and grows near-linearly across repeated revisions", async () => {
  await withDatabase(async (database) => {
    upsertSourceCatalog(database, [SOURCES.officialPublish, SOURCES.practitionerWatch]);
    const revisionCount = 7;
    for (let index = 0; index < revisionCount; index += 1) {
      const source = index % 2 === 0 ? SOURCES.officialPublish : SOURCES.practitionerWatch;
      const url = insertEvidenceArticle(database, source, {
        suffix: `normalized-revision-${index + 1}`,
        publishDecision: "publish",
        publishedAt: `2026-08-02T${String(9 + index).padStart(2, "0")}:00:00.000Z`,
      });
      const result = await runConceptKnowledgeBackfill({
        database,
        articleUrls: [url],
        batchSize: 1,
        now: `2026-08-02T${String(9 + index).padStart(2, "0")}:10:00.000Z`,
        analyzeArticle: async (article) => knowledgePayload(article, {
          claimKey: `normalized-revision-${index + 1}`,
          claimText: `第 ${index + 1} 次修订只追加当前文章对应的主张和证据，不嵌套历史修订对象。`,
        }),
      });
      assert.equal(result.processedCount, 1);
    }

    const currentRow = database.prepare("SELECT payload_json FROM concept_knowledge WHERE slug = ?")
      .get("evidence-accumulation-loop");
    const currentPayload = JSON.parse(currentRow.payload_json);
    const forbiddenNestedKeys = ["revisions", "claims", "evidence", "citations", "relations"]
      .filter((key) => Object.hasOwn(currentPayload.concept, key));
    const revisionSizes = database.prepare(`
      SELECT revision, length(payload_json) AS bytes
      FROM concept_revisions
      WHERE concept_slug = ?
      ORDER BY revision
    `).all("evidence-accumulation-loop").map((row) => Number(row.bytes));
    const firstGrowth = Math.max(1, revisionSizes[1] - revisionSizes[0]);
    const linearUpperBound = revisionSizes[0] + firstGrowth * (revisionSizes.length - 1) * 3;

    assert.deepEqual({
      forbiddenNestedKeys,
      revisionCount: revisionSizes.length,
      nearLinear: revisionSizes.at(-1) <= linearUpperBound,
    }, {
      forbiddenNestedKeys: [],
      revisionCount,
      nearLinear: true,
    }, `持久化 concept 必须是纯知识字段；当前修订大小序列：${revisionSizes.join(" -> ")}`);
  });
});

test("semantic field revisions replace stale field citations while unchanged fields keep the evidence union", async () => {
  await withDatabase(async (database) => {
    upsertSourceCatalog(database, [SOURCES.officialPublish, SOURCES.practitionerWatch]);
    const firstUrl = insertEvidenceArticle(database, SOURCES.officialPublish, {
      suffix: "original-semantics",
      publishDecision: "publish",
    });
    const first = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [firstUrl],
      batchSize: 1,
      now: "2026-08-02T11:00:00.000Z",
      analyzeArticle: async () => knowledgePayload(currentArticle(database, firstUrl), {
        claimKey: "original-semantics",
        claimText: "原始定义要求运行时在副作用之前保存检查点。",
      }),
    });
    assert.equal(first.processedCount, 1);

    const secondUrl = insertEvidenceArticle(database, SOURCES.practitionerWatch, {
      suffix: "revised-semantics",
      publishDecision: "publish",
      publishedAt: "2026-08-02T12:00:00.000Z",
    });
    const revisedDefinition = "证据累积闭环是一种以声明版本为中心的知识修订协议，它要求语义变化重新绑定直接证据。";
    const revisedMechanism = "系统先比较新旧字段语义；发生变化时只接受新分析明确引用的证据，不自动继承旧字段引用。";
    const second = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [secondUrl],
      batchSize: 1,
      now: "2026-08-02T12:00:00.000Z",
      analyzeArticle: async () => knowledgePayload(currentArticle(database, secondUrl), {
        claimKey: "revised-semantics",
        claimText: "字段语义发生变化时必须重新建立直接引用。",
        definition: revisedDefinition,
        mechanism: revisedMechanism,
      }),
    });
    assert.equal(second.processedCount, 1);

    const concept = getConceptKnowledge(database, "evidence-accumulation-loop")?.concept;
    const citations = new Map(concept?.citations.map((item) => [item.field, item.evidenceUrls.slice().sort()]));
    const firstRevision = concept?.revisions.find((item) => item.revision === 1);
    const firstDefinitionCitation = firstRevision?.payload?.citations.find((item) => item.field === "definition");
    assert.deepEqual({
      definition: concept?.definition,
      mechanism: concept?.mechanism,
      definitionCitations: citations.get("definition"),
      mechanismCitations: citations.get("mechanism"),
      unchangedArchitectureCitations: citations.get("architecture"),
      priorRevisionDefinitionCitations: firstDefinitionCitation?.evidenceUrls,
    }, {
      definition: revisedDefinition,
      mechanism: revisedMechanism,
      definitionCitations: [secondUrl],
      mechanismCitations: [secondUrl],
      unchangedArchitectureCitations: [firstUrl, secondUrl].sort(),
      priorRevisionDefinitionCitations: [firstUrl],
    }, "字段内容改变时旧 citation 不再证明新语义；只有未变化字段才可确定性合并新旧引用，历史 revision 保持原样");
  });
});

test("reusing a claim key with changed text or kind never reinterprets old evidence as support for the new claim", async () => {
  await withDatabase(async (database) => {
    upsertSourceCatalog(database, [SOURCES.officialPublish, SOURCES.practitionerWatch]);
    const claimKey = "stable-claim-key";
    const firstUrl = insertEvidenceArticle(database, SOURCES.officialPublish, {
      suffix: "claim-v1",
      publishDecision: "publish",
    });
    const firstText = "检查点提交先于不可逆副作用。";
    const first = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [firstUrl],
      batchSize: 1,
      now: "2026-08-02T13:00:00.000Z",
      analyzeArticle: async () => knowledgePayload(currentArticle(database, firstUrl), {
        claimKey,
        claimText: firstText,
        claimKind: "mechanism",
      }),
    });
    assert.equal(first.processedCount, 1);

    const secondUrl = insertEvidenceArticle(database, SOURCES.practitionerWatch, {
      suffix: "claim-v2",
      publishDecision: "publish",
      publishedAt: "2026-08-02T14:00:00.000Z",
    });
    const secondText = "同一个声明现在表示人工审批是一种显式状态转换。";
    const second = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [secondUrl],
      batchSize: 1,
      now: "2026-08-02T14:00:00.000Z",
      analyzeArticle: async () => knowledgePayload(currentArticle(database, secondUrl), {
        claimKey,
        claimText: secondText,
        claimKind: "pattern",
      }),
    });

    const concept = getConceptKnowledge(database, "evidence-accumulation-loop")?.concept;
    if (second.failedCount === 1) {
      assert.match(
        second.failures[0]?.error || "",
        /claim|key|主张|声明|复用|语义/iu,
        "拒绝复用 claim key 时必须给出可诊断的语义冲突原因，不能把无关错误当成正确保护",
      );
      assert.equal(second.processedCount, 0);
      assert.equal(concept?.revision, 1, "拒绝破坏性 claim key 复用时必须保留 last-good revision");
      assert.deepEqual(
        concept?.claims.map((item) => ({ key: item.key, text: item.text, kind: item.kind, evidenceUrls: item.evidenceUrls })),
        [{ key: claimKey, text: firstText, kind: "mechanism", evidenceUrls: [firstUrl] }],
      );
      return;
    }

    assert.equal(second.failedCount, 0);
    assert.equal(second.processedCount, 1);
    const revisedClaim = concept?.claims.find((item) => item.key === claimKey);
    const historicalEvidence = concept?.evidence.find((item) => item.url === firstUrl);
    assert.deepEqual({
      revisedClaim: revisedClaim && {
        key: revisedClaim.key,
        text: revisedClaim.text,
        kind: revisedClaim.kind,
        evidenceUrls: revisedClaim.evidenceUrls,
      },
      oldEvidenceStillClaimsSupport: historicalEvidence?.supports.includes(claimKey),
    }, {
      revisedClaim: {
        key: claimKey,
        text: secondText,
        kind: "pattern",
        evidenceUrls: [secondUrl],
      },
      oldEvidenceStillClaimsSupport: false,
    }, "接受同 key 的语义修订时，新主张只能绑定 incoming 明确证据；旧 evidence.supports 必须停止指向已改写的声明");
  });
});
