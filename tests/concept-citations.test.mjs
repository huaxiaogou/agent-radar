import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { afterEach, test } from "node:test";
import { insertArticle, openDatabase, upsertSourceCatalog } from "../radar/database.mjs";
import { buildSnapshot } from "../radar/snapshot.mjs";
import {
  applyConceptKnowledgeRevision,
  getConceptKnowledge,
  parseConceptKnowledgeAnalysis,
} from "../radar/concept-knowledge.mjs";

let temporaryDirectory;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
  delete process.env.RADAR_DATA_DIR;
});

const CITABLE_TEXT_FIELDS = [
  "definition",
  "nonDefinition",
  "problem",
  "whyNow",
  "origin",
  "mechanism",
  "architecture",
  "dailyDelta",
];

const CITABLE_ARRAY_FIELDS = [
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
  "controversies",
];

function capture(action) {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
}

async function createDatabase() {
  temporaryDirectory = await mkdtemp(`${os.tmpdir()}/agent-radar-concept-citations-`);
  process.env.RADAR_DATA_DIR = temporaryDirectory;
  return openDatabase();
}

function insertEvidenceArticle(database, { suffix, publishDecision = "publish", sourceLayer = "official" }) {
  const url = `https://citations.example.test/${suffix}`;
  upsertSourceCatalog(database, [{
    id: `citation-${suffix}`,
    name: `Citation ${suffix}`,
    homepage: "https://citations.example.test",
    class: sourceLayer === "practitioner" ? "独立实践者" : "一手工程",
    family: sourceLayer === "practitioner" ? "practitioner" : "official",
    layer: sourceLayer,
    priority: "P0",
    cadence: "24h",
    focus: "Evidence contracts",
    independentGroup: `citation-group-${suffix}`,
    language: "en",
  }]);
  insertArticle(database, {
    url,
    sourceId: `citation-${suffix}`,
    sourceName: `Citation ${suffix}`,
    sourceClass: sourceLayer === "practitioner" ? "独立实践者" : "一手工程",
    independentGroup: `citation-group-${suffix}`,
    sourceLayer,
    sourceLanguage: "en",
    engagementCount: 8,
    originalTitle: `Evidence ${suffix}`,
    originalExcerpt: "Evidence for a durable Agent runtime knowledge object.",
    contentText: "Evidence for checkpoints, approvals, recovery and auditable verification.",
    publishedAt: "2026-08-02T06:00:00.000Z",
    discoveredAt: "2026-08-02T07:00:00.000Z",
    contentHash: `citation-${suffix}`,
    relevanceScore: 95,
    signalSlug: `citation-signal-${suffix}`,
    conceptSlug: "runtime-assurance-loop",
    title: "运行时证据",
    summary: "可审计运行时的证据。",
    implication: "验证知识正文是否能回到原始证据。",
    topic: "工程",
    stage: "Emerging",
    accent: "engineering",
    tags: ["agent-runtime"],
    analysisMode: "deepseek",
    publishDecision,
    editorialScore: 90,
    aiRelevanceScore: 90,
    noveltyScore: 70,
    evidenceScore: 88,
    eventKey: `citation:${suffix}`,
    candidateConcept: "",
  });
  return url;
}

function citationFields(concept) {
  return [
    ...CITABLE_TEXT_FIELDS,
    ...CITABLE_ARRAY_FIELDS.filter((field) => Array.isArray(concept[field]) && concept[field].length > 0),
  ];
}

function payload({ evidenceUrls = [], citationUrl, citations = undefined } = {}) {
  const concept = {
    slug: "runtime-assurance-loop",
    canonicalName: "Runtime Assurance Loop",
    aliases: ["运行时保障闭环"],
    stage: "emerging",
    heat: 65,
    maturity: 45,
    definition: "运行时保障闭环把检查点、授权决策、恢复和验收证据组织成可重复验证的 Agent 执行契约。",
    nonDefinition: "它不是给普通工具调用增加重试，也不是把一次成功演示包装为生产可靠性。",
    problem: "长时间运行的 Coding Agent 会在中断、重试和人工介入后丢失权威状态与验收责任。",
    whyNow: "后台 Agent 与长任务执行增加后，运行边界和恢复语义正在成为比单次推理更重要的工程问题。",
    origin: "现有证据将这一做法描述为运行时工程模式；其正式命名起源仍需继续溯源。",
    evolution: ["从进程内循环演进到具有持久检查点和明确人工关口的运行契约。"],
    mechanism: "执行器在每个副作用前后保存状态、授权决策和验证结果，并用幂等键恢复未完成步骤。",
    architecture: "任务控制面、持久状态存储、权限网关、工具执行器和验收器共同形成闭环。",
    designConstraints: ["状态写入必须先于不可逆副作用。"],
    implementationPatterns: ["检查点加幂等工具调用。"],
    antiPatterns: ["只在内存中保存任务状态。"],
    tradeoffs: ["增加持久化与观测成本，换取长任务的可恢复性和审计能力。"],
    failureModes: ["检查点与外部副作用不一致会造成重复执行。"],
    securityRisks: ["恢复任务复用过期授权可能导致权限越界。"],
    operationalConcerns: ["需要控制状态体积、重放成本和检查点保留周期。"],
    applicability: ["具有多阶段副作用和人工审批的长时间 Coding Agent 任务。"],
    nonApplicability: ["一次工具调用即可完成且没有持久状态的短任务。"],
    controversies: [],
    dailyDelta: "新增原始证据，明确检查点、授权决策和验收记录必须共同保留。",
    lastMeaningfulChange: "2026-08-02T09:00:00.000Z",
  };
  const fieldUrl = citationUrl || evidenceUrls[0];
  return {
    concept,
    claims: [{
      key: "checkpoint-before-side-effect",
      text: "不可逆副作用前必须先提交可恢复检查点。",
      kind: "mechanism",
      confidence: 0.84,
    }],
    evidence: evidenceUrls.map((url, index) => ({
      url,
      originalTitle: `Evidence ${index + 1}`,
      sourceName: `Citation ${index + 1}`,
      sourceLayer: "official",
      independentGroup: `citation-group-${index + 1}`,
      supports: ["checkpoint-before-side-effect"],
      stance: "support",
      publishedAt: "2026-08-02T06:00:00.000Z",
    })),
    // Public contract: each knowledge field is queryable to its original evidence URLs.
    citations: citations ?? citationFields(concept).map((field) => ({ field, evidenceUrls: [fieldUrl] })),
    relations: [],
  };
}

test("parse and apply reject an entire revision when any claim lacks evidence.supports", async () => {
  const database = await createDatabase();
  const published = insertEvidenceArticle(database, { suffix: "publish" });
  const candidate = payload({ evidenceUrls: [published] });
  candidate.claims.push({
    key: "unbound-claim",
    text: "没有证据绑定的主张也不能被静默丢弃。",
    kind: "constraint",
    confidence: 0.6,
  });

  const parsed = capture(() => parseConceptKnowledgeAnalysis(candidate, { allowedEvidenceUrls: [published] }));
  const applied = capture(() => applyConceptKnowledgeRevision(database, candidate));

  assert.deepEqual({
    parseRejected: Boolean(parsed),
    applyRejected: Boolean(applied),
    knowledgeRows: database.prepare("SELECT COUNT(*) AS count FROM concept_knowledge WHERE slug = ?").get(candidate.concept.slug).count,
    revisionRows: database.prepare("SELECT COUNT(*) AS count FROM concept_revisions WHERE concept_slug = ?").get(candidate.concept.slug).count,
  }, {
    parseRejected: true,
    applyRejected: true,
    knowledgeRows: 0,
    revisionRows: 0,
  }, "任何未绑定 claim 都必须使 parse/apply 整次拒绝，且不能留下部分 revision");
});

test("every non-empty knowledge section needs a field citation to payload evidence, never a forged or reject URL", async () => {
  const database = await createDatabase();
  const published = insertEvidenceArticle(database, { suffix: "publish" });
  const rejected = insertEvidenceArticle(database, { suffix: "reject", publishDecision: "reject" });
  const base = payload({ evidenceUrls: [published] });

  const missingMechanism = structuredClone(base);
  missingMechanism.citations = missingMechanism.citations.filter((item) => item.field !== "mechanism");
  const genericMechanism = structuredClone(base);
  genericMechanism.concept.mechanism = "这是一个通用的工程实践，需要根据具体业务选择。";
  genericMechanism.citations = genericMechanism.citations.filter((item) => item.field !== "mechanism");
  const forged = structuredClone(base);
  forged.citations.find((item) => item.field === "definition").evidenceUrls = ["https://invented.example.test/evidence"];
  const rejectedCitation = structuredClone(base);
  rejectedCitation.citations.find((item) => item.field === "architecture").evidenceUrls = [rejected];

  const parseErrors = [missingMechanism, genericMechanism, forged]
    .map((candidate) => capture(() => parseConceptKnowledgeAnalysis(candidate, { allowedEvidenceUrls: [published] })));
  const rejectedError = capture(() => applyConceptKnowledgeRevision(database, rejectedCitation));
  assert.deepEqual({
    missingFieldRejected: Boolean(parseErrors[0]),
    genericUncitedSectionRejected: Boolean(parseErrors[1]),
    forgedUrlRejected: Boolean(parseErrors[2]),
    rejectCitationRejected: Boolean(rejectedError),
    knowledgeRows: database.prepare("SELECT COUNT(*) AS count FROM concept_knowledge").get().count,
  }, {
    missingFieldRejected: true,
    genericUncitedSectionRejected: true,
    forgedUrlRejected: true,
    rejectCitationRejected: true,
    knowledgeRows: 0,
  }, "每个非空章节都必须有可访问的字段引文；伪造或 reject URL 不能绕过该门禁");
});

test("watch citations survive candidate history while the formal public snapshot exposes publish citations only", async () => {
  const database = await createDatabase();
  const published = insertEvidenceArticle(database, { suffix: "publish" });
  const watched = insertEvidenceArticle(database, { suffix: "watch", publishDecision: "watch" });
  const candidate = payload({ evidenceUrls: [published, watched], citationUrl: watched });

  const parsed = parseConceptKnowledgeAnalysis(candidate, { allowedEvidenceUrls: [published, watched] });
  assert.equal(parsed.citations.length, citationFields(candidate.concept).length);
  const result = applyConceptKnowledgeRevision(database, parsed, {
    provider: "contract-test",
    model: "contract-test-model",
    analyzedAt: "2026-08-02T10:00:00.000Z",
    reason: "citation persistence contract",
  });
  assert.equal(result.revision, 1);

  const knowledge = getConceptKnowledge(database, candidate.concept.slug);
  const mechanismCitation = knowledge?.concept?.citations?.find((item) => item.field === "mechanism");
  assert.deepEqual(mechanismCitation?.evidenceUrls, [watched], "字段到原文 URL 必须能由知识对象直接查询");
  assert.deepEqual(knowledge?.concept?.revisions?.[0]?.payload?.citations, candidate.citations, "citation 必须随 revision 原样保存");

  let snapshot = await buildSnapshot(database);
  assert.equal(snapshot.concepts.some((concept) => concept.slug === candidate.concept.slug), false, "一组 publish 加 watch 仍不能成为正式概念");
  const candidateSnapshot = snapshot.candidateConcepts.find((concept) => concept.slug === candidate.concept.slug);
  assert.ok(candidateSnapshot, "watch 引文必须保留在候选投影中供后续积累");
  assert.ok(candidateSnapshot.sources.some((source) => source.href === watched), "候选投影必须能回到 watch 原文");

  const independentPublished = insertEvidenceArticle(database, {
    suffix: "publish-independent",
    sourceLayer: "practitioner",
  });
  const formal = payload({
    evidenceUrls: [published, independentPublished, watched],
    citationUrl: published,
  });
  formal.citations.find((citation) => citation.field === "implementationPatterns").evidenceUrls = [independentPublished];
  const formalResult = applyConceptKnowledgeRevision(database, formal, {
    provider: "contract-test",
    model: "contract-test-model",
    analyzedAt: "2026-08-02T11:00:00.000Z",
    reason: "independent publish corroboration",
  });
  assert.equal(formalResult.revision, 2);

  const candidateRevision = JSON.parse(database.prepare(`
    SELECT payload_json FROM concept_revisions
    WHERE concept_slug = ? AND revision = 1
  `).get(formal.concept.slug).payload_json);
  assert.deepEqual(candidateRevision.citations, candidate.citations, "晋升后仍必须在不可变 revision 中保留候选期 watch 引文的审计历史");

  snapshot = await buildSnapshot(database);
  const snapshotConcept = snapshot.concepts.find((concept) => concept.slug === candidate.concept.slug);
  assert.deepEqual(snapshotConcept?.citations, formal.citations, "正式 snapshot 必须保留正文的 publish 字段级证据映射");
  assert.equal(
    snapshotConcept?.citations?.some((citation) => citation.evidenceUrls.includes(watched)),
    false,
    "watch-only URL 不得泄漏到正式公开概念的字段引文",
  );
});
