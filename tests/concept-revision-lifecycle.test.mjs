import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { afterEach, test } from "node:test";
import { insertArticle, openDatabase, upsertSourceCatalog } from "../radar/database.mjs";
import { buildSnapshot } from "../radar/snapshot.mjs";

let temporaryDirectory;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
  delete process.env.RADAR_DATA_DIR;
});

async function knowledgeApi(...names) {
  let knowledgeModule;
  try {
    knowledgeModule = await import("../radar/concept-knowledge.mjs");
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    knowledgeModule = {};
  }
  for (const name of names) {
    assert.equal(typeof knowledgeModule[name], "function", `生产概念知识模块必须公开 ${name}`);
  }
  return knowledgeModule;
}

async function createDatabase() {
  temporaryDirectory = await mkdtemp(`${os.tmpdir()}/agent-radar-concept-revision-`);
  process.env.RADAR_DATA_DIR = temporaryDirectory;
  return openDatabase();
}

const SOURCES = {
  official: {
    id: "revision-vendor", name: "Revision Vendor", homepage: "https://vendor.example.com", class: "一手工程",
    family: "official", layer: "official", priority: "P0", cadence: "4h", focus: "runtime", independentGroup: "vendor", language: "en",
  },
  practitioner: {
    id: "revision-practitioner", name: "Revision Field Notes", homepage: "https://field.example.com", class: "实践者",
    family: "practitioner", layer: "practitioner", priority: "P1", cadence: "8h", focus: "runtime", independentGroup: "field", language: "zh",
  },
  research: {
    id: "revision-research", name: "Revision Research", homepage: "https://research.example.com", class: "研究",
    family: "research", layer: "practitioner", priority: "P1", cadence: "24h", focus: "runtime", independentGroup: "research", language: "en",
  },
};

function insertEvidence(database, source, suffix, title) {
  const url = `${source.homepage}/${suffix}`;
  insertArticle(database, {
    url, sourceId: source.id, sourceName: source.name, sourceClass: source.class, sourceLayer: source.layer,
    sourceLanguage: source.language, independentGroup: source.independentGroup, originalTitle: title,
    originalExcerpt: "Agent runtime evidence.", contentText: "Agent runtime evidence with checks and recovery.",
    publishedAt: "2026-08-03T08:00:00.000Z", discoveredAt: "2026-08-03T08:10:00.000Z", contentHash: `${source.id}-${suffix}`,
    relevanceScore: 10, signalSlug: `revision-${suffix}`, conceptSlug: "revision-concept", title: "运行时知识证据",
    summary: "一条可公开的运行时工程证据。", implication: "可审计恢复需要来源绑定。", topic: "工程",
    stage: "Emerging", accent: "engineering", tags: ["runtime"], analysisMode: "deepseek", publishDecision: "publish",
    editorialScore: 90, aiRelevanceScore: 90, noveltyScore: 80, evidenceScore: 80, eventKey: `revision:${suffix}`, candidateConcept: "",
  });
  return { url, originalTitle: title, sourceName: source.name, sourceLayer: source.layer, independentGroup: source.independentGroup };
}

function payload({
  slug = "revision-concept",
  canonicalName = "Revision Concept",
  evidence = [],
  lastMeaningfulChange = "2026-08-03T09:00:00.000Z",
  concept = {},
  relations = [],
} = {}) {
  const knowledge = {
    slug, canonicalName, aliases: [`${canonicalName} 别名`, canonicalName], stage: "emerging", heat: 65, maturity: 50,
    definition: "修订概念用可追溯证据维护运行时工程知识，并清楚标注其有效边界。",
    nonDefinition: "它不是为了每日更新而制造文字变化，也不是没有来源的概念包装。",
    problem: "长任务运行时知识缺少可验证的历史演进和失败恢复边界。",
    whyNow: "长时间运行的 Coding Agent 使运行知识需要持续校正。",
    origin: "当前命名来自可审计运行时实践，最早起源仍需来源继续核验。",
    evolution: ["从静态说明演进为带证据和修订记录的工程知识对象。"],
    mechanism: "系统将可公开证据绑定到主张，并在更新时保留前后知识差异。",
    architecture: "知识存储、修订账本、快照投影和详情路由共同提供稳定阅读入口。",
    designConstraints: ["证据必须可公开访问"], implementationPatterns: ["追加式修订账本"], antiPatterns: ["静默覆盖旧结论"],
    tradeoffs: ["增加审计存储，换取可解释的知识变化"], failureModes: ["异常更新覆盖最后有效版本"],
    securityRisks: ["不可信来源可能污染结论"], operationalConcerns: ["快照必须保留兼容跳转"],
    applicability: ["需要持续维护工程认知的概念"], nonApplicability: ["没有公开证据的一次性猜测"],
    controversies: [], dailyDelta: "首次建立可追溯知识版本。", lastMeaningfulChange,
    ...concept,
  };
  const citedFields = [
    "definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta",
    ...["aliases", "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs", "failureModes", "securityRisks", "operationalConcerns", "applicability", "nonApplicability", "controversies"]
      .filter((field) => Array.isArray(knowledge[field]) && knowledge[field].length > 0),
  ];
  return {
    concept: knowledge,
    claims: [{ key: "evidence-bound", text: "每次公开知识修订都必须保留可追溯的来源绑定。", kind: "mechanism", confidence: 0.86 }],
    evidence: evidence.map((item) => ({ ...item, supports: ["evidence-bound"], stance: item.stance || "support" })),
    citations: citedFields.map((field) => ({
      field,
      // A fixture that intentionally reaches formal state needs a concrete
      // practitioner implementation citation, not just a second source in
      // the concept-wide evidence array.
      evidenceUrls: [
        field === "implementationPatterns"
          ? (evidence.find((item) => item.sourceLayer === "practitioner")?.url || evidence[0]?.url)
          : evidence[0]?.url,
      ].filter(Boolean),
    })),
    relations,
  };
}

function applyOptions(analyzedAt) {
  return { provider: "test-provider", model: "test-model", reason: "生命周期契约测试", analyzedAt };
}

function revisionsForToday(snapshot, date) {
  const day = (value) => String(value || "").slice(0, 10);
  return {
    newConcepts: snapshot.concepts.filter((concept) => concept.revision === 1 && day(concept.createdAt) === date),
    meaningfulRevisions: snapshot.concepts.filter((concept) => (
      concept.revision > 1
      && day(concept.lastMeaningfulChange) === date
      && concept.revisions[0]?.materialChange === true
    )),
  };
}

test("merged public snapshot publishes permanent redirect data while preserving old evidence and revision history", async () => {
  const { applyConceptKnowledgeRevision, mergeConceptKnowledge, listConceptKnowledgeRevisions } = await knowledgeApi(
    "applyConceptKnowledgeRevision", "mergeConceptKnowledge", "listConceptKnowledgeRevisions",
  );
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, Object.values(SOURCES));
    const source = insertEvidence(database, SOURCES.official, "merge", "Merge-compatible runtime evidence");
    applyConceptKnowledgeRevision(database, payload({ slug: "runtime-old", canonicalName: "Runtime Old", evidence: [source] }), applyOptions("2026-08-02T09:00:00.000Z"));
    applyConceptKnowledgeRevision(database, payload({ slug: "runtime-canonical", canonicalName: "Runtime Canonical", evidence: [source] }), applyOptions("2026-08-02T10:00:00.000Z"));
    mergeConceptKnowledge(database, {
      fromSlug: "runtime-old", intoSlug: "runtime-canonical", reason: "名称与机制已经归一", mergedAt: "2026-08-03T01:02:03.000Z",
    });

    const snapshot = await buildSnapshot(database);
    assert.deepEqual(snapshot.conceptRedirects?.["runtime-old"], {
      redirectTo: "runtime-canonical", reason: "名称与机制已经归一", mergedAt: "2026-08-03T01:02:03.000Z",
    }, "详情路由必须能仅凭公开快照把旧 slug 做永久跳转");
    const oldRevisions = listConceptKnowledgeRevisions(database, "runtime-old");
    assert.equal(oldRevisions.length, 1, "合并不得删除旧概念修订");
    assert.equal(oldRevisions[0].payload.evidence[0].url, source.url, "合并不得删除旧概念原始证据");
  } finally {
    database.close();
  }
});

test("every revision exposes predecessor, field before/after diff, confidence and review decision without sacrificing last-good state", async () => {
  const { applyConceptKnowledgeRevision, getConceptKnowledge, listConceptKnowledgeRevisions } = await knowledgeApi(
    "applyConceptKnowledgeRevision", "getConceptKnowledge", "listConceptKnowledgeRevisions",
  );
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, Object.values(SOURCES));
    const official = insertEvidence(database, SOURCES.official, "audit-official", "Official runtime evidence");
    const field = insertEvidence(database, SOURCES.practitioner, "audit-field", "独立实践证据");
    const research = insertEvidence(database, SOURCES.research, "audit-research", "Independent research evidence");
    const first = payload({ evidence: [official, field, research], lastMeaningfulChange: "2026-08-02T09:00:00.000Z" });
    applyConceptKnowledgeRevision(database, first, applyOptions("2026-08-02T09:00:00.000Z"));

    const conflicting = structuredClone(first);
    conflicting.concept.definition = "修订概念的独立实践证据指出，运行时状态与外部副作用仍可能出现无法原子提交的窗口。";
    conflicting.concept.controversies = ["独立证据与原有机制结论发生冲突。"];
    conflicting.citations.push({ field: "controversies", evidenceUrls: [official.url] });
    conflicting.evidence[1].stance = "conflict";
    applyConceptKnowledgeRevision(database, conflicting, applyOptions("2026-08-03T09:00:00.000Z"));
    const conflictRevision = listConceptKnowledgeRevisions(database, "revision-concept")[0];
    assert.equal(conflictRevision.previousRevision, 1);
    assert.deepEqual(conflictRevision.fieldDiff.definition, { before: first.concept.definition, after: conflicting.concept.definition });
    assert.equal(typeof conflictRevision.confidence, "number");
    assert.equal(conflictRevision.needsReview, true, "证据冲突必须触发人工复核");
    assert.ok(conflictRevision.reviewReasons.some((reason) => /冲突/.test(reason)));

    const lowIndependent = structuredClone(first);
    lowIndependent.evidence = [{ ...official, supports: ["evidence-bound"], stance: "support" }];
    lowIndependent.citations.find((citation) => citation.field === "implementationPatterns").evidenceUrls = [official.url];
    lowIndependent.concept.dailyDelta = "当前仅有单一组织的补充证据，独立性不足。";
    lowIndependent.concept.lastMeaningfulChange = "2026-08-03T09:30:00.000Z";
    const revisionsBeforeLowIndependent = listConceptKnowledgeRevisions(database, "revision-concept").length;
    assert.throws(
      () => applyConceptKnowledgeRevision(database, lowIndependent, applyOptions("2026-08-03T09:30:00.000Z")),
      /正式概念更新|publish|实践者|implementation/i,
      "已正式晋级概念不能被只剩单一 official 的低独立更新降级或改写；必须保留 last-good 正式修订",
    );
    assert.equal(
      listConceptKnowledgeRevisions(database, "revision-concept").length,
      revisionsBeforeLowIndependent,
      "被隔离的低独立更新不得追加 revision 或改变既有正式知识",
    );

    const settled = structuredClone(first);
    settled.concept.definition = "修订概念基于多个独立来源，将可公开证据、恢复边界和审核结论沉淀为可追溯运行知识。";
    settled.concept.dailyDelta = "多个独立来源补强了运行时恢复边界。";
    settled.concept.lastMeaningfulChange = "2026-08-03T10:00:00.000Z";
    applyConceptKnowledgeRevision(database, settled, applyOptions("2026-08-03T10:00:00.000Z"));
    const settledRevision = listConceptKnowledgeRevisions(database, "revision-concept")[0];
    assert.equal(settledRevision.needsReview, false, "普通高独立证据修订不应自动进入人工队列");
    assert.deepEqual(settledRevision.reviewReasons, []);

    const invalid = structuredClone(settled);
    invalid.evidence[0].url = "https://fabricated.example.com/evidence";
    const lastGood = getConceptKnowledge(database, "revision-concept").concept;
    const count = listConceptKnowledgeRevisions(database, "revision-concept").length;
    assert.throws(() => applyConceptKnowledgeRevision(database, invalid, applyOptions("2026-08-03T11:00:00.000Z")), /公开|证据|链接/i);
    assert.equal(listConceptKnowledgeRevisions(database, "revision-concept").length, count, "失败更新不得追加 revision");
    assert.equal(getConceptKnowledge(database, "revision-concept").concept.definition, lastGood.definition, "失败更新必须保留 last-good 内容");
  } finally {
    database.close();
  }
});

test("evidence-only context updates are non-material, while semantic, relation, controversy and lifecycle changes are categorized material deltas", async () => {
  const { applyConceptKnowledgeRevision, listConceptKnowledgeRevisions } = await knowledgeApi(
    "applyConceptKnowledgeRevision", "listConceptKnowledgeRevisions",
  );
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, Object.values(SOURCES));
    const official = insertEvidence(database, SOURCES.official, "meaning-official", "Official runtime evidence");
    const field = insertEvidence(database, SOURCES.practitioner, "meaning-field", "独立实践证据");
    const duplicateContext = insertEvidence(database, SOURCES.official, "meaning-context", "Official runtime context evidence");
    const research = insertEvidence(database, SOURCES.research, "meaning-research", "Independent research evidence");
    applyConceptKnowledgeRevision(database, payload({
      slug: "durable-execution",
      canonicalName: "Durable Execution",
      evidence: [official, field],
      lastMeaningfulChange: "2026-08-02T08:30:00.000Z",
    }), applyOptions("2026-08-02T08:30:00.000Z"));
    const baseline = payload({ evidence: [official, field], lastMeaningfulChange: "2026-08-02T09:00:00.000Z" });
    applyConceptKnowledgeRevision(database, baseline, applyOptions("2026-08-02T09:00:00.000Z"));

    const contextOnly = structuredClone(baseline);
    contextOnly.evidence.push({ ...duplicateContext, supports: ["evidence-bound"], stance: "context" });
    contextOnly.concept.dailyDelta = "补充重复上下文来源，不改变概念知识结论。";
    contextOnly.concept.lastMeaningfulChange = "2026-08-03T09:00:00.000Z";
    applyConceptKnowledgeRevision(database, contextOnly, applyOptions("2026-08-03T09:00:00.000Z"));
    let revisions = listConceptKnowledgeRevisions(database, "revision-concept");
    assert.equal(revisions[0].materialChange, false);
    assert.equal(revisions[0].payload.concept.lastMeaningfulChange, baseline.concept.lastMeaningfulChange, "纯上下文证据不得刷新 lastMeaningfulChange");

    const material = structuredClone(contextOnly);
    material.concept.definition = "修订概念现在明确把运行时恢复中的状态转移、外部副作用和人工裁决统一为可验证的知识闭环。";
    material.concept.mechanism = "系统以状态检查点、外部副作用确认和人工复核共同约束每次可恢复的知识更新。";
    material.concept.controversies = ["不同实践对外部副作用确认时机存在分歧。"];
    material.citations.push({ field: "controversies", evidenceUrls: [official.url] });
    material.concept.lastMeaningfulChange = "2026-08-03T10:00:00.000Z";
    material.evidence.push({ ...research, supports: ["evidence-bound"], stance: "support" });
    material.relations = [{ type: "depends-on", targetSlug: "durable-execution", explanation: "恢复闭环依赖可持久化执行语义。", evidenceUrls: [official.url], confidence: 0.8 }];
    applyConceptKnowledgeRevision(database, material, applyOptions("2026-08-03T10:00:00.000Z"));
    revisions = listConceptKnowledgeRevisions(database, "revision-concept");
    assert.equal(revisions[0].materialChange, true);
    for (const category of ["definition", "mechanism", "controversies", "relationships", "lifecycle"]) {
      assert.ok(revisions[0].delta.categories.includes(category), `结构化 delta 必须标记 ${category}`);
    }
  } finally {
    database.close();
  }
});

test("public snapshot carries enough revision metadata to strictly separate today's new concepts from meaningful revisions", async () => {
  const { applyConceptKnowledgeRevision } = await knowledgeApi("applyConceptKnowledgeRevision");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, Object.values(SOURCES));
    const official = insertEvidence(database, SOURCES.official, "daily-official", "Daily official evidence");
    const field = insertEvidence(database, SOURCES.practitioner, "daily-field", "每日独立实践证据");
    const duplicateContext = insertEvidence(database, SOURCES.official, "daily-context", "Daily duplicate context evidence");
    const yesterday = "2026-08-02";
    const today = "2026-08-03";
    applyConceptKnowledgeRevision(database, payload({ slug: "old-evidence-only", canonicalName: "Old Evidence Only", evidence: [official, field], lastMeaningfulChange: `${yesterday}T09:00:00.000Z` }), applyOptions(`${yesterday}T09:00:00.000Z`));
    const oldEvidenceOnly = payload({ slug: "old-evidence-only", canonicalName: "Old Evidence Only", evidence: [official, field, { ...duplicateContext, supports: ["evidence-bound"], stance: "context" }], lastMeaningfulChange: `${today}T09:00:00.000Z` });
    oldEvidenceOnly.concept.dailyDelta = "新增重复上下文证据。";
    applyConceptKnowledgeRevision(database, oldEvidenceOnly, applyOptions(`${today}T09:00:00.000Z`));

    applyConceptKnowledgeRevision(database, payload({ slug: "today-new", canonicalName: "Today New", evidence: [official, field], lastMeaningfulChange: `${today}T10:00:00.000Z` }), applyOptions(`${today}T10:00:00.000Z`));
    applyConceptKnowledgeRevision(database, payload({ slug: "today-revised", canonicalName: "Today Revised", evidence: [official, field], lastMeaningfulChange: `${yesterday}T09:00:00.000Z` }), applyOptions(`${yesterday}T09:00:00.000Z`));
    const revised = payload({ slug: "today-revised", canonicalName: "Today Revised", evidence: [official, field], lastMeaningfulChange: `${today}T11:00:00.000Z` });
    revised.concept.definition = "今日修订概念以新的运行时机制边界修正了此前的工程判断。";
    applyConceptKnowledgeRevision(database, revised, applyOptions(`${today}T11:00:00.000Z`));

    const snapshot = await buildSnapshot(database);
    const daily = revisionsForToday(snapshot, today);
    assert.deepEqual(daily.newConcepts.map((concept) => concept.slug), ["today-new"], "旧 revision=1 不能因今天有非实质更新而被当作今日新增");
    assert.deepEqual(daily.meaningfulRevisions.map((concept) => concept.slug), ["today-revised"], "非实质 evidence-only revision 不能混入今日实质修订");
  } finally {
    database.close();
  }
});
