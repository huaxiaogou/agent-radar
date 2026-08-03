import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { afterEach, test } from "node:test";
import {
  insertArticle,
  openDatabase,
  upsertSourceCatalog,
} from "../radar/database.mjs";
import { buildSnapshot } from "../radar/snapshot.mjs";

let temporaryDirectory;
let conceptKnowledgeModule;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
  delete process.env.RADAR_DATA_DIR;
});

async function knowledgeApi(...requiredFunctions) {
  if (!conceptKnowledgeModule) {
    try {
      conceptKnowledgeModule = await import("../radar/concept-knowledge.mjs");
    } catch (error) {
      if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
      conceptKnowledgeModule = {};
    }
  }
  for (const functionName of requiredFunctions) {
    assert.equal(
      typeof conceptKnowledgeModule[functionName],
      "function",
      `生产概念知识模块必须公开 ${functionName}，使 SQLite 权威知识链可被回填、快照和页面共同消费`,
    );
  }
  return conceptKnowledgeModule;
}

async function createDatabase() {
  temporaryDirectory = await mkdtemp(`${os.tmpdir()}/agent-radar-concept-knowledge-`);
  process.env.RADAR_DATA_DIR = temporaryDirectory;
  return openDatabase();
}

const SOURCES = {
  vendorBlog: {
    id: "vendor-alpha-blog",
    name: "Vendor Alpha Engineering",
    homepage: "https://vendor-alpha.example.com/engineering",
    class: "一手工程",
    family: "official",
    layer: "official",
    priority: "P0",
    cadence: "4h",
    focus: "Agent Harness",
    independentGroup: "vendor-alpha",
    language: "en",
  },
  vendorRepo: {
    id: "vendor-alpha-repo",
    name: "Vendor Alpha Repository",
    homepage: "https://github.com/vendor-alpha/agent-runtime",
    class: "工程仓库",
    family: "repository",
    layer: "official",
    priority: "P0",
    cadence: "4h",
    focus: "Agent Harness",
    independentGroup: "vendor-alpha",
    language: "en",
  },
  practitioner: {
    id: "field-notes-beta",
    name: "Independent Agent Field Notes",
    homepage: "https://field-notes.example.com",
    class: "实践者",
    family: "practitioner",
    layer: "practitioner",
    priority: "P1",
    cadence: "8h",
    focus: "Agent runtime reliability",
    independentGroup: "field-notes-beta",
    language: "zh",
  },
  research: {
    id: "research-gamma",
    name: "Independent Agent Systems Research",
    homepage: "https://research-gamma.example.org",
    class: "研究",
    family: "research",
    layer: "practitioner",
    priority: "P1",
    cadence: "24h",
    focus: "Agent runtime verification",
    independentGroup: "research-gamma",
    language: "en",
  },
  community: {
    id: "community-delta",
    name: "中文 Agent 工程社区",
    homepage: "https://community-delta.example.cn",
    class: "中文社区",
    family: "community",
    layer: "community",
    priority: "P1",
    cadence: "4h",
    focus: "Agent 工程讨论",
    independentGroup: "community-delta",
    language: "zh",
  },
};

function articleUrl(source, suffix) {
  return `${source.homepage.replace(/\/$/, "")}/${suffix}`;
}

function insertEvidenceArticle(database, source, {
  suffix,
  originalTitle,
  contentHash = `${source.id}-${suffix}`,
  engagementCount = 0,
  publishDecision = "publish",
  publishedAt = "2026-08-01T06:00:00.000Z",
} = {}) {
  const url = articleUrl(source, suffix);
  insertArticle(database, {
    url,
    sourceId: source.id,
    sourceName: source.name,
    sourceClass: source.class,
    independentGroup: source.independentGroup,
    sourceLayer: source.layer,
    sourceLanguage: source.language,
    engagementCount,
    originalTitle,
    originalExcerpt: "Agent runtime engineering evidence.",
    contentText: "Agent runtime engineering evidence with checkpoints, approvals and auditable recovery.",
    publishedAt,
    discoveredAt: "2026-08-01T08:00:00.000Z",
    contentHash,
    relevanceScore: 10,
    signalSlug: `agent-runtime-${source.id}-${suffix}`,
    conceptSlug: "agent-harness",
    title: "Agent 运行时引入可审计恢复边界",
    summary: "来源描述了检查点、审批和失败恢复机制，并保留了尚待独立验证的边界。",
    implication: "需要验证中断恢复、权限决策和工具调用记录能否形成可重复的运行证据。",
    topic: "工程",
    stage: "Emerging",
    accent: "engineering",
    tags: ["agent-harness", "durable-execution"],
    analysisMode: "deepseek",
    publishDecision,
    editorialScore: 85,
    aiRelevanceScore: 92,
    noveltyScore: 78,
    evidenceScore: source.layer === "community" ? 45 : 82,
    eventKey: `agent-runtime:${source.id}-${suffix}`,
    candidateConcept: "",
  });
  return url;
}

function fullKnowledgePayload({
  slug = "runtime-assurance-loop",
  name = "Runtime Assurance Loop",
  aliases = ["运行时保障闭环", "Runtime Assurance Loop"],
  stage = "emerging",
  heat = 64,
  maturity = 48,
  evidence = [],
  relations = [],
  controversies = [],
  dailyDelta = "新增独立实践证据，明确了中断恢复与验收边界。",
} = {}) {
  const concept = {
    slug,
    canonicalName: name,
    aliases,
    stage,
    heat,
    maturity,
    definition: "运行时保障闭环把检查点、权限决策、恢复和验收证据组织为可重复验证的 Agent 运行契约。",
    nonDefinition: "它不是给普通工具调用增加重试，也不是把一次成功演示包装为生产可靠性。",
    problem: "长时间运行的 Coding Agent 容易在中断、重试和人工介入后丢失权威状态与验收责任。",
    whyNow: "后台 Agent 与长任务执行正在增多，模型能力提升后，运行边界和恢复语义成为主要瓶颈。",
    origin: "现有证据把这一做法描述为运行时工程模式；命名起源仍需继续溯源。",
    evolution: ["从进程内循环演进到具有持久检查点和明确人工关口的运行契约。"],
    mechanism: "执行器在每个副作用前后保存状态、权限决策和验证结果，并用幂等键恢复未完成步骤。",
    architecture: "任务控制面、持久状态存储、权限网关、工具执行器和验收器共同形成闭环。",
    designConstraints: ["状态写入必须先于不可逆副作用", "恢复路径必须复用相同权限与验收规则"],
    implementationPatterns: ["检查点加幂等工具调用", "人工审批作为显式状态转换"],
    antiPatterns: ["只在内存中保存任务状态", "把无限重试当作恢复能力"],
    tradeoffs: ["增加持久化与观测成本，换取长任务的可恢复性和审计能力"],
    failureModes: ["检查点与外部副作用不一致会造成重复执行"],
    securityRisks: ["恢复任务复用过期授权可能导致权限越界"],
    operationalConcerns: ["需要控制状态体积、重放成本和检查点保留周期"],
    applicability: ["具有多阶段副作用和人工审批的长时间 Coding Agent 任务"],
    nonApplicability: ["无持久状态、一次工具调用即可完成的短任务"],
    controversies,
    dailyDelta,
    lastMeaningfulChange: "2026-08-02T09:00:00.000Z",
  };
  const citedFields = [
    "definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta",
    ...["aliases", "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs", "failureModes", "securityRisks", "operationalConcerns", "applicability", "nonApplicability", "controversies"]
      .filter((field) => Array.isArray(concept[field]) && concept[field].length > 0),
  ];
  return {
    concept,
    claims: [
      {
        key: "checkpoint-before-side-effect",
        text: "不可逆副作用前必须先提交可恢复检查点。",
        kind: "mechanism",
        confidence: 0.82,
      },
      {
        key: "approval-is-state-transition",
        text: "人工审批应被建模为显式状态转换，而不是聊天消息。",
        kind: "pattern",
        confidence: 0.76,
      },
    ],
    evidence: evidence.map((item, index) => ({
      url: item.url,
      originalTitle: item.originalTitle,
      sourceName: item.sourceName,
      sourceLayer: item.sourceLayer,
      independentGroup: item.independentGroup,
      supports: item.supports || (evidence.length === 1
        ? ["checkpoint-before-side-effect", "approval-is-state-transition"]
        : [index ? "approval-is-state-transition" : "checkpoint-before-side-effect"]),
      stance: item.stance || "support",
      publishedAt: item.publishedAt || "2026-08-01T06:00:00.000Z",
    })),
    citations: citedFields.map((field) => ({
      field,
      // Formal fixtures deliberately include a real practitioner publish
      // record. Its implementation evidence must be explicit rather than
      // accidentally inherited from the first (usually official) source.
      evidenceUrls: [
        field === "implementationPatterns"
          ? (evidence.find((item) => item.sourceLayer === "practitioner")?.url || evidence[0]?.url)
          : evidence[0]?.url,
      ].filter(Boolean),
    })),
    relations,
  };
}

function evidenceFor(source, url, originalTitle, extra = {}) {
  return {
    url,
    originalTitle,
    sourceName: source.name,
    sourceLayer: source.layer,
    independentGroup: source.independentGroup,
    ...extra,
  };
}

function applyOptions(at = "2026-08-02T09:00:00.000Z") {
  return {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    analyzedAt: at,
    reason: "历史证据回溯",
  };
}

test("alias registry normalizes bilingual names, deduplicates identities and preserves merge redirects", async () => {
  const {
    normalizeConceptAliasKey,
    applyConceptKnowledgeRevision,
    getConceptKnowledge,
    mergeConceptKnowledge,
  } = await knowledgeApi(
    "normalizeConceptAliasKey",
    "applyConceptKnowledgeRevision",
    "getConceptKnowledge",
    "mergeConceptKnowledge",
  );
  assert.equal(normalizeConceptAliasKey("  Agent—Harness  "), normalizeConceptAliasKey("agent harness"));

  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.practitioner, SOURCES.research]);
    const officialUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "runtime-contract",
      originalTitle: "A runtime contract for agent tools",
    });
    const practitionerUrl = insertEvidenceArticle(database, SOURCES.practitioner, {
      suffix: "runtime-contract-field-note",
      originalTitle: "智能体运行支架的恢复边界",
    });
    const evidence = [
      evidenceFor(SOURCES.vendorBlog, officialUrl, "A runtime contract for agent tools"),
      evidenceFor(SOURCES.practitioner, practitionerUrl, "智能体运行支架的恢复边界"),
    ];
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "agent-runtime-harness",
      name: "Agent Runtime Harness",
      aliases: ["智能体运行支架", "Agent Runtime Harness"],
      evidence,
    }), applyOptions());
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "agent-harness-runtime",
      name: "Agent Harness Runtime",
      aliases: ["Agent-Harness Runtime"],
      evidence,
    }), applyOptions("2026-08-02T10:00:00.000Z"));

    mergeConceptKnowledge(database, {
      fromSlug: "agent-harness-runtime",
      intoSlug: "agent-runtime-harness",
      reason: "两组名称描述同一运行时边界，证据与机制重合",
      mergedAt: "2026-08-02T11:00:00.000Z",
    });

    const aliasResolution = getConceptKnowledge(database, "智能体运行支架");
    assert.equal(aliasResolution.concept.slug, "agent-runtime-harness");
    const oldSlugResolution = getConceptKnowledge(database, "agent-harness-runtime");
    assert.equal(oldSlugResolution.redirectTo, "agent-runtime-harness");
    assert.match(oldSlugResolution.mergeReason, /同一运行时边界/);
    assert.ok(aliasResolution.concept.aliases.includes("Agent-Harness Runtime"), "被合并概念的历史别名必须保留");
  } finally {
    database.close();
  }
});

test("claims stay bound to original evidence and same-organization channels cannot self-verify maturity", async () => {
  const {
    applyConceptKnowledgeRevision,
    getConceptKnowledge,
    evaluateConceptLifecycle,
  } = await knowledgeApi("applyConceptKnowledgeRevision", "getConceptKnowledge", "evaluateConceptLifecycle");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.vendorRepo]);
    const blogUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "runtime-checkpoints",
      originalTitle: "Runtime checkpoints for coding agents",
    });
    const repoUrl = insertEvidenceArticle(database, SOURCES.vendorRepo, {
      suffix: "issues/42",
      originalTitle: "Issue 42: checkpoint recovery semantics",
    });
    const evidence = [
      evidenceFor(SOURCES.vendorBlog, blogUrl, "Runtime checkpoints for coding agents", { publishDecision: "publish", stance: "support" }),
      evidenceFor(SOURCES.vendorRepo, repoUrl, "Issue 42: checkpoint recovery semantics", { publishDecision: "publish", stance: "support" }),
    ];
    const lifecycle = evaluateConceptLifecycle({
      currentStage: "candidate",
      evidence,
      hasStableDefinition: true,
      hasMechanism: true,
      heat: 80,
      now: "2026-08-02T12:00:00.000Z",
    });
    assert.equal(lifecycle.independentGroupCount, 1, "官网、Release、Issue 属于同一组织时只能算一个独立来源组");
    assert.equal(lifecycle.stage, "candidate", "单一组织即使同时提供官网和仓库证据，也必须继续停留在 candidate");

    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      stage: "validated",
      evidence,
    }), applyOptions());
    const knowledge = getConceptKnowledge(database, "runtime-assurance-loop").concept;
    assert.equal(knowledge.stage, "candidate", "持久化入口必须阻止单一组织把候选概念晋升到正式目录");
    assert.equal(knowledge.independentSourceGroups, 1);
    for (const claim of knowledge.claims) {
      assert.ok(claim.evidenceUrls.length > 0, `主张 ${claim.key} 必须就地绑定证据`);
      for (const url of claim.evidenceUrls) assert.ok([blogUrl, repoUrl].includes(url));
    }
    assert.deepEqual(
      knowledge.evidence.map((item) => item.originalTitle).sort(),
      ["Issue 42: checkpoint recovery semantics", "Runtime checkpoints for coding agents"].sort(),
      "中文综合不得丢失原标题",
    );
  } finally {
    database.close();
  }
});

test("community participation raises heat without changing evidence maturity or formal lifecycle", async () => {
  const { evaluateConceptLifecycle } = await knowledgeApi("evaluateConceptLifecycle");
  const officialEvidence = [{
    url: "https://vendor.example.com/runtime",
    sourceLayer: "official",
    independentGroup: "vendor",
    engagementCount: 3,
    publishDecision: "publish",
    stance: "support",
  }];
  const quiet = evaluateConceptLifecycle({
    currentStage: "emerging",
    evidence: officialEvidence,
    hasStableDefinition: true,
    hasMechanism: true,
    heat: 22,
    now: "2026-08-02T12:00:00.000Z",
  });
  const viral = evaluateConceptLifecycle({
    currentStage: "emerging",
    evidence: [
      ...officialEvidence,
      {
        url: "https://community.example.cn/topic/9000",
        sourceLayer: "community",
        independentGroup: "community",
        engagementCount: 90_000,
        publishDecision: "publish",
        stance: "context",
      },
    ],
    hasStableDefinition: true,
    hasMechanism: true,
    heat: 96,
    now: "2026-08-02T12:00:00.000Z",
  });
  assert.ok(viral.heat > quiet.heat, "社区参与应当可以表达近期讨论强度");
  assert.equal(viral.maturity, quiet.maturity, "社区互动量不得提高证据成熟度");
  assert.equal(viral.stage, quiet.stage, "社区爆火不得触发生命周期晋升");
});

test("lifecycle distinguishes candidate, emerging, validated, contested, cooling and archived independently of heat", async () => {
  const { evaluateConceptLifecycle } = await knowledgeApi("evaluateConceptLifecycle");
  const official = { sourceLayer: "official", independentGroup: "vendor-a", publishDecision: "publish", stance: "support" };
  const practitioner = { sourceLayer: "practitioner", independentGroup: "field-b", publishDecision: "publish", stance: "support", implementation: true };
  const research = { sourceLayer: "practitioner", independentGroup: "research-c", publishDecision: "publish", stance: "support", implementation: true };
  const common = { hasStableDefinition: true, hasMechanism: true, now: "2026-08-02T12:00:00.000Z" };

  assert.equal(evaluateConceptLifecycle({
    ...common,
    hasStableDefinition: false,
    hasMechanism: false,
    evidence: [{ sourceLayer: "community", independentGroup: "community-a", publishDecision: "publish", stance: "support" }],
    heat: 99,
  }).stage, "candidate");
  assert.equal(evaluateConceptLifecycle({ ...common, evidence: [official, practitioner], heat: 60 }).stage, "emerging");
  assert.equal(evaluateConceptLifecycle({ ...common, evidence: [official, practitioner, research], heat: 20 }).stage, "validated");
  assert.equal(evaluateConceptLifecycle({
    ...common,
    currentStage: "validated",
    evidence: [official, practitioner, { ...research, stance: "conflict", materialConflict: true }],
    heat: 75,
  }).stage, "contested");
  assert.equal(evaluateConceptLifecycle({
    ...common,
    currentStage: "validated",
    evidence: [official, practitioner, research],
    heat: 8,
    lastMeaningfulChangeAt: "2025-08-01T00:00:00.000Z",
  }).stage, "cooling");
  assert.equal(evaluateConceptLifecycle({
    ...common,
    currentStage: "cooling",
    evidence: [official],
    heat: 2,
    supersededBy: "runtime-assurance-loop-v2",
    lastMeaningfulChangeAt: "2024-08-01T00:00:00.000Z",
  }).stage, "archived");
});

for (const [label, sourceLayer] of [
  ["official", "official"],
  ["practitioner", "practitioner"],
  ["community", "community"],
]) {
  test(`a single ${label} support group remains candidate regardless of LLM heat`, async () => {
    const { evaluateConceptLifecycle } = await knowledgeApi("evaluateConceptLifecycle");
    const evidence = [{
      url: `https://${label}.example.com/one-source`,
      sourceLayer,
      independentGroup: `${label}-only`,
      publishDecision: "publish",
      stance: "support",
      publishedAt: "2026-08-02T08:00:00.000Z",
      engagementCount: 20_000,
    }];

    for (const heat of [5, 95]) {
      const lifecycle = evaluateConceptLifecycle({
        currentStage: "candidate",
        evidence,
        hasStableDefinition: true,
        hasMechanism: true,
        heat,
        now: "2026-08-03T08:00:00.000Z",
      });
      assert.equal(lifecycle.stage, "candidate", `${label} 单一来源组不得晋升 Emerging/Validated`);
    }
  });
}

test("a lone community conflict cannot promote a candidate, while conflict after a formal support base becomes contested", async () => {
  const { evaluateConceptLifecycle } = await knowledgeApi("evaluateConceptLifecycle");
  const communityConflict = {
    url: "https://community.example.cn/conflict",
    sourceLayer: "community",
    independentGroup: "community-conflict",
    publishDecision: "publish",
    stance: "conflict",
    publishedAt: "2026-08-03T07:00:00.000Z",
  };
  const common = {
    currentStage: "candidate",
    hasStableDefinition: true,
    hasMechanism: true,
    heat: 90,
    now: "2026-08-03T08:00:00.000Z",
  };

  assert.equal(
    evaluateConceptLifecycle({ ...common, evidence: [communityConflict] }).stage,
    "candidate",
    "单条社区冲突只能形成候选争议，不能绕过正式 support 基础进入正式目录",
  );

  const formalSupport = [
    { sourceLayer: "official", independentGroup: "vendor-a", publishDecision: "publish", stance: "support" },
    { sourceLayer: "practitioner", independentGroup: "field-b", publishDecision: "publish", stance: "support" },
  ];
  assert.equal(
    evaluateConceptLifecycle({ ...common, evidence: [...formalSupport, communityConflict] }).stage,
    "contested",
    "已经具备两个独立正式 support 组后，新冲突才可以把概念标记为 Contested",
  );
});

test("two independent support groups can become Emerging when at least one is publish official or practitioner", async () => {
  const { evaluateConceptLifecycle } = await knowledgeApi("evaluateConceptLifecycle");
  const lifecycle = evaluateConceptLifecycle({
    currentStage: "candidate",
    evidence: [
      { sourceLayer: "official", independentGroup: "vendor-a", publishDecision: "publish", stance: "support" },
      { sourceLayer: "community", independentGroup: "community-b", publishDecision: "publish", stance: "support" },
    ],
    hasStableDefinition: true,
    hasMechanism: true,
    heat: 40,
    now: "2026-08-03T08:00:00.000Z",
  });
  assert.equal(lifecycle.stage, "emerging");
  assert.equal(lifecycle.independentGroupCount, 2);
});

function heatEvidence() {
  return [{
    sourceLayer: "official",
    independentGroup: "vendor-a",
    publishDecision: "publish",
    stance: "support",
    publishedAt: "2026-08-03T07:00:00.000Z",
    engagementCount: 120,
  }, {
    sourceLayer: "practitioner",
    independentGroup: "field-b",
    publishDecision: "publish",
    stance: "support",
    publishedAt: "2026-08-03T06:00:00.000Z",
    engagementCount: 80,
  }];
}

test("concept heat ignores the LLM heat suggestion for an identical evidence set", async () => {
  const { evaluateConceptLifecycle } = await knowledgeApi("evaluateConceptLifecycle");
  const common = {
    currentStage: "candidate",
    evidence: heatEvidence(),
    hasStableDefinition: true,
    hasMechanism: true,
    now: "2026-08-03T08:00:00.000Z",
  };
  const lowSuggestion = evaluateConceptLifecycle({ ...common, heat: 5 });
  const highSuggestion = evaluateConceptLifecycle({ ...common, heat: 95 });
  assert.equal(lowSuggestion.heat, highSuggestion.heat, "同一证据集的最终 heat 不得受 LLM 自报 5/95 影响");
});

test("concept heat responds deterministically to evidence recency and strength", async () => {
  const { evaluateConceptLifecycle } = await knowledgeApi("evaluateConceptLifecycle");
  const recentEvidence = heatEvidence();
  const staleEvidence = recentEvidence.map((item, index) => ({
    ...item,
    publishedAt: `2025-01-0${index + 1}T06:00:00.000Z`,
    engagementCount: 0,
  }));
  const common = {
    currentStage: "candidate",
    hasStableDefinition: true,
    hasMechanism: true,
    heat: 50,
    now: "2026-08-03T08:00:00.000Z",
  };
  const recent = evaluateConceptLifecycle({ ...common, evidence: recentEvidence });
  const stale = evaluateConceptLifecycle({ ...common, evidence: staleEvidence });
  assert.ok(recent.heat > stale.heat, "同等来源结构下，近期有证据活动的概念 heat 应高于长期无变化的概念");
});

const CORE_KNOWLEDGE_ARRAY_FIELDS = [
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

test("formal structured knowledge rejects an empty engineering shell", async () => {
  const { parseConceptKnowledgeAnalysis } = await knowledgeApi("parseConceptKnowledgeAnalysis");
  const url = "https://vendor-alpha.example.com/engineering/structured-knowledge";
  const evidence = [evidenceFor(SOURCES.vendorBlog, url, "Structured Agent Runtime Knowledge")];
  const emptyShell = fullKnowledgePayload({ evidence });
  for (const field of CORE_KNOWLEDGE_ARRAY_FIELDS) emptyShell.concept[field] = [];
  emptyShell.citations = emptyShell.citations.filter((citation) => !CORE_KNOWLEDGE_ARRAY_FIELDS.includes(citation.field));
  assert.throws(
    () => parseConceptKnowledgeAnalysis(emptyShell),
    /核心|工程知识|空壳|不能为空/,
    "正式概念不能只靠定义和机制晋升，核心工程数组全部为空时必须拒绝",
  );
});

test("structured knowledge arrays reject empty and whitespace-only items", async () => {
  const { parseConceptKnowledgeAnalysis } = await knowledgeApi("parseConceptKnowledgeAnalysis");
  const url = "https://vendor-alpha.example.com/engineering/blank-knowledge-item";
  const evidence = [evidenceFor(SOURCES.vendorBlog, url, "Blank Knowledge Item")];
  const blankItem = fullKnowledgePayload({ evidence });
  blankItem.concept.implementationPatterns.push("   ");
  assert.throws(
    () => parseConceptKnowledgeAnalysis(blankItem),
    /implementationPatterns|空项|空白/,
    "核心知识数组中的空字符串或纯空白项必须被拒绝",
  );
});

for (const field of CORE_KNOWLEDGE_ARRAY_FIELDS) {
  test(`${field} rejects an English-led knowledge paragraph`, async () => {
    const { parseConceptKnowledgeAnalysis } = await knowledgeApi("parseConceptKnowledgeAnalysis");
    const url = `https://vendor-alpha.example.com/engineering/chinese-gate-${field}`;
    const evidence = [evidenceFor(SOURCES.vendorBlog, url, `Chinese Gate ${field}`)];
    const payload = fullKnowledgePayload({ evidence });
    payload.concept[field] = [
      "This engineering paragraph explains checkpoint recovery, authorization boundaries, failure handling, observability, and operational tradeoffs entirely in English without a Chinese editorial synthesis.",
    ];
    assert.throws(
      () => parseConceptKnowledgeAnalysis(payload),
      new RegExp(`${field}.*中文|中文.*${field}`),
      `${field} 的每一条都必须通过中文主导门禁；产品名和缩写可保留，但英文段落不可发布`,
    );
  });
}

test("revisions are append-only, conflicts remain visible and an invalid update preserves the last good version", async () => {
  const {
    applyConceptKnowledgeRevision,
    getConceptKnowledge,
    listConceptKnowledgeRevisions,
  } = await knowledgeApi(
    "applyConceptKnowledgeRevision",
    "getConceptKnowledge",
    "listConceptKnowledgeRevisions",
  );
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.practitioner, SOURCES.research]);
    const officialUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "runtime-v1",
      originalTitle: "Runtime assurance v1",
    });
    const fieldUrl = insertEvidenceArticle(database, SOURCES.practitioner, {
      suffix: "runtime-v1-independent-support",
      originalTitle: "独立实践验证运行时保障闭环",
    });
    const conflictUrl = insertEvidenceArticle(database, SOURCES.research, {
      suffix: "runtime-recovery-limit",
      originalTitle: "恢复闭环在真实系统中的原子性边界",
    });
    const first = fullKnowledgePayload({
      evidence: [
        evidenceFor(SOURCES.vendorBlog, officialUrl, "Runtime assurance v1", {
          supports: ["checkpoint-before-side-effect"],
        }),
        evidenceFor(SOURCES.practitioner, fieldUrl, "独立实践验证运行时保障闭环", {
          supports: ["approval-is-state-transition"],
        }),
      ],
      dailyDelta: "建立第一个有来源绑定的机制版本。",
    });
    const firstResult = applyConceptKnowledgeRevision(database, first, applyOptions());
    assert.equal(firstResult.revision, 1);

    const invalid = structuredClone(first);
    invalid.concept.definition = "This English-only generated definition must never replace the public Chinese knowledge.";
    invalid.evidence[0].url = "https://fabricated.example.com/no-such-source";
    assert.throws(
      () => applyConceptKnowledgeRevision(database, invalid, applyOptions("2026-08-02T10:00:00.000Z")),
      /中文|证据|链接|evidence|source/i,
    );
    let current = getConceptKnowledge(database, "runtime-assurance-loop").concept;
    assert.equal(current.revision, 1);
    assert.equal(current.definition, first.concept.definition, "失败分析不得静默覆盖最后一个有效知识版本");

    const contested = fullKnowledgePayload({
      stage: "contested",
      evidence: [
        evidenceFor(SOURCES.vendorBlog, officialUrl, "Runtime assurance v1", {
          supports: ["checkpoint-before-side-effect"],
        }),
        evidenceFor(SOURCES.practitioner, fieldUrl, "独立实践验证运行时保障闭环", {
          supports: ["approval-is-state-transition"],
        }),
        evidenceFor(SOURCES.research, conflictUrl, "恢复闭环在真实系统中的原子性边界", {
          stance: "conflict",
          supports: ["checkpoint-before-side-effect"],
        }),
      ],
      controversies: ["独立实践者观察到外部副作用与检查点之间仍存在无法原子提交的窗口。"],
      dailyDelta: "新增反例，原先的可靠性结论被修正为存在外部副作用窗口。",
    });
    const secondResult = applyConceptKnowledgeRevision(database, contested, applyOptions("2026-08-02T11:00:00.000Z"));
    assert.equal(secondResult.revision, 2);
    current = getConceptKnowledge(database, "runtime-assurance-loop").concept;
    assert.equal(current.stage, "contested");
    assert.match(current.controversies.join(" "), /外部副作用/);
    const revisions = listConceptKnowledgeRevisions(database, "runtime-assurance-loop");
    assert.deepEqual(revisions.map((item) => item.revision), [2, 1]);
    assert.match(revisions[0].changeReason, /历史证据回溯/);
    assert.equal(revisions[0].provider, "deepseek");
    assert.equal(revisions[0].model, "deepseek-v4-flash");
    assert.ok(revisions[0].changedFields.includes("controversies"));
  } finally {
    database.close();
  }
});

test("revision claim, evidence, relation and citation detail tables reject UPDATE and DELETE as append-only audit records", async () => {
  const { applyConceptKnowledgeRevision } = await knowledgeApi("applyConceptKnowledgeRevision");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.practitioner]);
    const sourceUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "append-only-detail-tables",
      originalTitle: "Append-only concept revision details",
    });
    const targetSupportUrl = insertEvidenceArticle(database, SOURCES.practitioner, {
      suffix: "append-only-durable-target-support",
      originalTitle: "独立实践验证持久执行目标",
    });
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "durable-execution",
      name: "Durable Execution",
      aliases: ["持久执行"],
      evidence: [
        evidenceFor(SOURCES.vendorBlog, sourceUrl, "Append-only concept revision details", {
          supports: ["checkpoint-before-side-effect"],
        }),
        evidenceFor(SOURCES.practitioner, targetSupportUrl, "独立实践验证持久执行目标", {
          supports: ["approval-is-state-transition"],
        }),
      ],
    }), applyOptions("2026-08-02T08:30:00.000Z"));
    const evidence = [
      evidenceFor(SOURCES.vendorBlog, sourceUrl, "Append-only concept revision details", {
        supports: ["checkpoint-before-side-effect"],
      }),
      evidenceFor(SOURCES.practitioner, targetSupportUrl, "独立实践验证持久执行目标", {
        supports: ["approval-is-state-transition"],
      }),
    ];
    const payload = fullKnowledgePayload({
      slug: "append-only-detail-ledger",
      name: "Append-only Detail Ledger",
      aliases: ["追加式明细账本"],
      evidence,
      relations: [{
        type: "depends-on",
        targetSlug: "durable-execution",
        explanation: "追加式审计依赖稳定的持久执行与版本身份。",
        evidenceUrls: [sourceUrl],
        confidence: 0.81,
      }],
    });
    applyConceptKnowledgeRevision(database, payload, applyOptions());

    const detailTables = [
      { table: "concept_revision_claims", assignment: "claim_text = 'tampered claim'" },
      { table: "concept_revision_evidence", assignment: "original_title = 'tampered evidence'" },
      { table: "concept_revision_relations", assignment: "explanation = 'tampered relation'" },
      { table: "concept_revision_citations", assignment: "evidence_urls_json = '[]'" },
    ];
    for (const { table, assignment } of detailTables) {
      const before = Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE concept_slug = ? AND revision = 1`).get("append-only-detail-ledger").count);
      assert.ok(before > 0, `${table} fixture 必须通过正式 revision 写入明细，而不是测试直接插入`);
      assert.throws(
        () => database.prepare(`UPDATE ${table} SET ${assignment} WHERE concept_slug = ? AND revision = 1`).run("append-only-detail-ledger"),
        /append-only|追加|审计/iu,
        `${table} UPDATE 必须由 SQLite trigger 拒绝`,
      );
      assert.throws(
        () => database.prepare(`DELETE FROM ${table} WHERE concept_slug = ? AND revision = 1`).run("append-only-detail-ledger"),
        /append-only|追加|审计/iu,
        `${table} DELETE 必须由 SQLite trigger 拒绝`,
      );
      assert.equal(
        Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE concept_slug = ? AND revision = 1`).get("append-only-detail-ledger").count),
        before,
        `${table} 被拒绝写入后必须保留完整明细数量`,
      );
    }
  } finally {
    database.close();
  }
});

test("concept analyzer retry correction exposes only fixed error categories and never echoes hostile model values or URLs", async () => {
  const { analyzeConceptKnowledgeArticle } = await import("../radar/concept-analyze.mjs");
  const legitimateUrl = "https://vendor-alpha.example.com/engineering/retry-sanitization";
  const maliciousUrl = "https://attacker.invalid/EXFILTRATE_THIS_MODEL_VALUE?prompt=ignore-all-rules";
  const originalTitle = "Agent runtime retry sanitization evidence";
  const article = {
    url: legitimateUrl,
    sourceId: SOURCES.vendorBlog.id,
    sourceName: SOURCES.vendorBlog.name,
    sourceClass: SOURCES.vendorBlog.class,
    sourceLayer: SOURCES.vendorBlog.layer,
    independentGroup: SOURCES.vendorBlog.independentGroup,
    sourceLanguage: "en",
    originalTitle,
    originalExcerpt: "Evidence about safe retries for concept analysis.",
    contentText: "The source describes checkpoint recovery and safe concept-analysis retry boundaries.",
    publishedAt: "2026-08-03T02:00:00.000Z",
    discoveredAt: "2026-08-03T02:05:00.000Z",
    conceptSlug: "agent-harness",
    candidateConcept: "",
  };
  const valid = fullKnowledgePayload({
    evidence: [evidenceFor(SOURCES.vendorBlog, legitimateUrl, originalTitle)],
  });
  valid.identityDecision = {
    action: "create-new",
    canonicalSlug: "runtime-assurance-loop",
    confidence: 0.91,
    reason: "该运行时保障闭环具有独立问题和机制，本次合法重试载荷首次建立规范概念。",
    comparedSlugs: [],
  };
  const malicious = structuredClone(valid);
  malicious.evidence[0].url = maliciousUrl;
  for (const citation of malicious.citations) citation.evidenceUrls = [maliciousUrl];
  const requests = [];
  const fetchImpl = async (_input, init = {}) => {
    const request = JSON.parse(String(init.body || "{}"));
    requests.push(request);
    const responsePayload = requests.length === 1 ? malicious : valid;
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(responsePayload) } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await analyzeConceptKnowledgeArticle(article, {
    provider: "deepseek",
    knownConcepts: [],
    now: "2026-08-03T03:00:00.000Z",
    maxAttempts: 2,
    environment: {
      RADAR_AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "retry-sanitization-test-key",
      RADAR_DEEPSEEK_CONCEPT_MODEL: "deepseek-test",
      RADAR_DEEPSEEK_CONCEPT_MAX_TOKENS: "6000",
      RADAR_DEEPSEEK_CONCEPT_TIMEOUT_MS: "10000",
    },
    fetchImpl,
  });
  assert.equal(result.concept.slug, "runtime-assurance-loop", "第二次合法输出必须通过真实 parser 完成 retry");
  assert.equal(requests.length, 2, "恶意首轮输出必须触发一次且仅一次修正重试");
  const correction = String(requests[1].messages?.at(-1)?.content || "");
  assert.match(correction, /证据|evidence/iu, "修正提示可以暴露固定错误类别或字段名，便于模型修复结构");
  assert.doesNotMatch(correction, /attacker\.invalid|EXFILTRATE_THIS_MODEL_VALUE|ignore-all-rules/iu, "修正提示不得把模型生成的恶意值或 URL 原样回灌下一次上下文");
  assert.doesNotMatch(correction, /https?:\/\//iu, "修正提示本身不得包含首轮模型输出的任何可执行 URL");
});

test("analysis parser rejects malformed JSON, fabricated links, English editorial output and illegal relations", async () => {
  const { parseConceptKnowledgeAnalysis } = await knowledgeApi("parseConceptKnowledgeAnalysis");
  const sourceUrl = "https://evidence.example.com/runtime";
  const payload = fullKnowledgePayload({
    evidence: [{
      url: sourceUrl,
      originalTitle: "Runtime evidence",
      sourceName: "Evidence",
      sourceLayer: "official",
      independentGroup: "evidence-org",
    }],
  });
  assert.throws(() => parseConceptKnowledgeAnalysis("{not-json", { allowedEvidenceUrls: [sourceUrl] }), /JSON/i);

  const fabricated = structuredClone(payload);
  fabricated.evidence[0].url = "https://fabricated.example.com/runtime";
  assert.throws(
    () => parseConceptKnowledgeAnalysis(JSON.stringify(fabricated), { allowedEvidenceUrls: [sourceUrl] }),
    /证据|链接|允许|source|URL/i,
  );

  const english = structuredClone(payload);
  english.concept.definition = "A runtime assurance loop records checkpoints and approvals for long-running coding agents.";
  assert.throws(
    () => parseConceptKnowledgeAnalysis(JSON.stringify(english), { allowedEvidenceUrls: [sourceUrl] }),
    /中文/i,
  );

  const illegalRelation = structuredClone(payload);
  illegalRelation.relations = [{
    type: "looks-like",
    targetSlug: "unknown-concept",
    explanation: "只是一起出现。",
    evidenceUrls: [sourceUrl],
    confidence: 0.5,
  }];
  assert.throws(
    () => parseConceptKnowledgeAnalysis(JSON.stringify(illegalRelation), {
      allowedEvidenceUrls: [sourceUrl],
      knownConceptSlugs: [payload.concept.slug],
    }),
    /关系|relation|target/i,
  );
});

test("historical backfill is resumable and idempotent across batches", async () => {
  const {
    runConceptKnowledgeBackfill,
    listConceptKnowledgeRevisions,
  } = await knowledgeApi("runConceptKnowledgeBackfill", "listConceptKnowledgeRevisions");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.practitioner, SOURCES.research]);
    const articles = [
      [SOURCES.vendorBlog, "history-a", "Runtime history A"],
      [SOURCES.practitioner, "history-b", "运行时历史实践 B"],
      [SOURCES.research, "history-c", "Runtime history C"],
    ].map(([source, suffix, title]) => ({
      source,
      title,
      url: insertEvidenceArticle(database, source, { suffix, originalTitle: title }),
    }));
    let analyzerCalls = 0;
    const analyzeArticle = async (article) => {
      analyzerCalls += 1;
      const source = Object.values(SOURCES).find((item) => item.id === article.source_id);
      return fullKnowledgePayload({
        evidence: [evidenceFor(source, article.url, article.original_title)],
        dailyDelta: `历史回溯处理：${article.original_title}`,
      });
    };

    const first = await runConceptKnowledgeBackfill({ database, analyzeArticle, batchSize: 1, now: "2026-08-02T09:00:00.000Z" });
    assert.equal(first.processedCount, 1);
    assert.equal(first.hasMore, true);
    const second = await runConceptKnowledgeBackfill({ database, analyzeArticle, batchSize: 1, now: "2026-08-02T10:00:00.000Z" });
    assert.equal(second.processedCount, 1);
    assert.equal(second.hasMore, true);
    const third = await runConceptKnowledgeBackfill({ database, analyzeArticle, batchSize: 10, now: "2026-08-02T11:00:00.000Z" });
    assert.equal(third.processedCount, 1);
    assert.equal(third.hasMore, false);
    const revisionCount = listConceptKnowledgeRevisions(database, "runtime-assurance-loop").length;

    const rerun = await runConceptKnowledgeBackfill({ database, analyzeArticle, batchSize: 10, now: "2026-08-02T12:00:00.000Z" });
    assert.equal(rerun.processedCount, 0);
    assert.equal(rerun.skippedCount, articles.length);
    assert.equal(analyzerCalls, articles.length, "内容哈希未变化的历史文章不得重复调用 LLM");
    assert.equal(listConceptKnowledgeRevisions(database, "runtime-assurance-loop").length, revisionCount);
  } finally {
    database.close();
  }
});

test("historical backfill uses article content CAS and retries a stale analysis without marking it complete", async () => {
  const { runConceptKnowledgeBackfill } = await knowledgeApi("runConceptKnowledgeBackfill");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog]);
    const url = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "cas-recovery",
      originalTitle: "Runtime CAS recovery",
      contentHash: "before-analysis",
    });
    let firstAttempt = true;
    let calls = 0;
    const analyzeArticle = async (article) => {
      calls += 1;
      if (firstAttempt) {
        firstAttempt = false;
        database.prepare("UPDATE articles SET content_hash = ? WHERE url = ?").run("changed-during-analysis", url);
      }
      return fullKnowledgePayload({
        evidence: [evidenceFor(SOURCES.vendorBlog, url, article.original_title)],
      });
    };

    const stale = await runConceptKnowledgeBackfill({ database, analyzeArticle, batchSize: 1, now: "2026-08-02T09:00:00.000Z" });
    assert.equal(stale.processedCount, 0);
    assert.equal(stale.conflictCount, 1);
    const retry = await runConceptKnowledgeBackfill({ database, analyzeArticle, batchSize: 1, now: "2026-08-02T10:00:00.000Z" });
    assert.equal(retry.processedCount, 1);
    assert.equal(calls, 2, "CAS 冲突记录不得被错误标记为已完成");
  } finally {
    database.close();
  }
});

test("SQLite knowledge, not the static catalog alone, drives the public snapshot while candidates remain isolated", async () => {
  const { applyConceptKnowledgeRevision } = await knowledgeApi("applyConceptKnowledgeRevision");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.practitioner, SOURCES.community]);
    const officialUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "dynamic-snapshot",
      originalTitle: "A dynamic knowledge snapshot",
    });
    const practitionerUrl = insertEvidenceArticle(database, SOURCES.practitioner, {
      suffix: "dynamic-snapshot-field",
      originalTitle: "动态知识快照实践",
    });
    const communityUrl = insertEvidenceArticle(database, SOURCES.community, {
      suffix: "candidate-only",
      originalTitle: "社区提出候选运行模式",
      engagementCount: 9000,
    });
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "sqlite-native-agent-knowledge",
      name: "SQLite-native Agent Knowledge",
      aliases: ["SQLite 原生 Agent 知识"],
      evidence: [
        evidenceFor(SOURCES.vendorBlog, officialUrl, "A dynamic knowledge snapshot"),
        evidenceFor(SOURCES.practitioner, practitionerUrl, "动态知识快照实践"),
      ],
      relations: [],
    }), applyOptions());
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "viral-candidate-only",
      name: "Viral Candidate Only",
      aliases: ["社区高热候选"],
      stage: "candidate",
      heat: 99,
      maturity: 5,
      evidence: [evidenceFor(SOURCES.community, communityUrl, "社区提出候选运行模式")],
    }), applyOptions("2026-08-02T10:00:00.000Z"));

    const snapshot = await buildSnapshot(database);
    const dynamic = snapshot.concepts.find((item) => item.slug === "sqlite-native-agent-knowledge");
    assert.ok(dynamic, "未写入 config/concepts.json 的 SQLite 正式概念必须进入公开快照");
    assert.equal(dynamic.definition, "运行时保障闭环把检查点、权限决策、恢复和验收证据组织为可重复验证的 Agent 运行契约。");
    assert.equal(dynamic.revision, 1);
    assert.equal(dynamic.heat, 64);
    assert.equal(dynamic.maturity, 100, "maturity 必须由 official + practitioner 两个 publish 独立组的本地规则确定，不能采用 LLM 自报值 48");
    assert.ok(dynamic.claims.every((claim) => claim.evidenceUrls.length > 0));
    assert.equal(snapshot.concepts.some((item) => item.slug === "viral-candidate-only"), false, "候选不能混入正式概念目录");
    assert.ok(snapshot.candidateConcepts.some((item) => item.slug === "viral-candidate-only" || item.name === "Viral Candidate Only"));
  } finally {
    database.close();
  }
});

test("knowledge without public source-bound claims is rejected instead of generating generic filler", async () => {
  const { applyConceptKnowledgeRevision } = await knowledgeApi("applyConceptKnowledgeRevision");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.community]);
    const rejectedUrl = insertEvidenceArticle(database, SOURCES.community, {
      suffix: "rejected-source",
      originalTitle: "Rejected evidence",
      publishDecision: "reject",
    });
    assert.throws(
      () => applyConceptKnowledgeRevision(database, fullKnowledgePayload({ evidence: [] }), applyOptions()),
      /证据|主张|source|evidence/i,
    );
    assert.throws(
      () => applyConceptKnowledgeRevision(database, fullKnowledgePayload({
        evidence: [evidenceFor(SOURCES.community, rejectedUrl, "Rejected evidence")],
      }), applyOptions()),
      /公开|证据|source|publish/i,
      "被拒绝或未公开文章不能成为公开知识证据",
    );
  } finally {
    database.close();
  }
});

test("snapshot publishes no graph relation when SQLite has no persisted formal relation", async () => {
  const database = await createDatabase();
  try {
    const snapshot = await buildSnapshot(database);
    assert.deepEqual(
      snapshot.relations,
      [],
      "公开关系图只能投影 SQLite 权威关系；没有正式持久化关系时不得回退静态 bootstrap 图谱",
    );
  } finally {
    database.close();
  }
});

test("writer rejects candidate or dangling relation endpoints and snapshot remains edge-free", async () => {
  const { applyConceptKnowledgeRevision, listConceptKnowledgeRevisions } = await knowledgeApi(
    "applyConceptKnowledgeRevision",
    "listConceptKnowledgeRevisions",
  );
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.practitioner]);
    const publicUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "relation-endpoint-gate",
      originalTitle: "Relation endpoint gate evidence",
    });
    const practitionerUrl = insertEvidenceArticle(database, SOURCES.practitioner, {
      suffix: "relation-endpoint-independent-support",
      originalTitle: "独立实践验证正式关系端点",
    });
    const candidateEvidence = [evidenceFor(SOURCES.vendorBlog, publicUrl, "Relation endpoint gate evidence")];
    const formalEvidence = [
      evidenceFor(SOURCES.vendorBlog, publicUrl, "Relation endpoint gate evidence", {
        supports: ["checkpoint-before-side-effect"],
      }),
      evidenceFor(SOURCES.practitioner, practitionerUrl, "独立实践验证正式关系端点", {
        supports: ["approval-is-state-transition"],
      }),
    ];

    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "formal-relation-target",
      name: "Formal Relation Target",
      aliases: ["正式关系目标"],
      evidence: formalEvidence,
    }), applyOptions());
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "candidate-relation-source",
      name: "Candidate Relation Source",
      aliases: ["候选关系源"],
      stage: "candidate",
      evidence: candidateEvidence,
    }), applyOptions("2026-08-02T10:00:00.000Z"));
    assert.throws(() => applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "candidate-relation-source",
      name: "Candidate Relation Source",
      aliases: ["候选关系源"],
      stage: "candidate",
      evidence: candidateEvidence,
      relations: [{
        type: "depends-on",
        targetSlug: "formal-relation-target",
        explanation: "候选概念还没有资格成为公开关系起点。",
        evidenceUrls: [publicUrl],
        confidence: 0.91,
      }],
    }), applyOptions("2026-08-02T10:00:30.000Z")), /关系.*(?:sourceSlug|来源).*正式概念|source.*formal/iu, "candidate source 必须在 writer 层被拒绝");
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "candidate-relation-target",
      name: "Candidate Relation Target",
      aliases: ["候选关系目标"],
      stage: "candidate",
      evidence: candidateEvidence,
    }), applyOptions("2026-08-02T10:01:00.000Z"));
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "formal-relation-source",
      name: "Formal Relation Source",
      aliases: ["正式关系源"],
      evidence: formalEvidence,
    }), applyOptions("2026-08-02T10:02:00.000Z"));
    assert.throws(() => applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "formal-relation-source",
      name: "Formal Relation Source",
      aliases: ["正式关系源"],
      evidence: formalEvidence,
      relations: [{
        type: "depends-on",
        targetSlug: "candidate-relation-target",
        explanation: "候选目标不能成为公开图节点。",
        evidenceUrls: [publicUrl],
        confidence: 0.88,
      }],
    }), applyOptions("2026-08-02T10:02:30.000Z")), /targetSlug.*正式概念|target.*formal/iu, "candidate target 必须在 writer 层被拒绝");
    assert.throws(() => applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "formal-relation-source",
      name: "Formal Relation Source",
      aliases: ["正式关系源"],
      evidence: formalEvidence,
      relations: [{
        type: "enables",
        targetSlug: "missing-relation-target",
        explanation: "未进入正式目录的目标不能由 slug 临时生成节点。",
        evidenceUrls: [publicUrl],
        confidence: 0.79,
      }],
    }), applyOptions("2026-08-02T10:03:00.000Z")), /targetSlug.*正式概念|target.*formal/iu, "dangling target 必须在 writer 层被拒绝");

    assert.equal(listConceptKnowledgeRevisions(database, "candidate-relation-source").length, 1, "被拒关系不得追加 candidate source revision");
    assert.equal(listConceptKnowledgeRevisions(database, "formal-relation-source").length, 1, "被拒关系不得追加 formal source revision");

    const snapshot = await buildSnapshot(database);
    assert.deepEqual(snapshot.relations, [], "writer 拒绝非法端点后，公开图不得出现任何残留边");
  } finally {
    database.close();
  }
});

test("snapshot projects only legal relations between two formal concepts with publish evidence", async () => {
  const { applyConceptKnowledgeRevision } = await knowledgeApi("applyConceptKnowledgeRevision");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.practitioner]);
    const publicUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "relation-public-evidence",
      originalTitle: "Public relation evidence",
    });
    const practitionerUrl = insertEvidenceArticle(database, SOURCES.practitioner, {
      suffix: "relation-public-independent-evidence",
      originalTitle: "独立实践验证公开关系端点",
    });
    const formalEvidence = [
      evidenceFor(SOURCES.vendorBlog, publicUrl, "Public relation evidence", {
        supports: ["checkpoint-before-side-effect"],
      }),
      evidenceFor(SOURCES.practitioner, practitionerUrl, "独立实践验证公开关系端点", {
        supports: ["approval-is-state-transition"],
      }),
    ];
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "durable-execution",
      name: "Durable Execution Canonical",
      aliases: ["持久执行"],
      evidence: formalEvidence,
    }), applyOptions());
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "dynamic-relation-source",
      name: "Dynamic Relation Source",
      aliases: ["动态关系源"],
      evidence: formalEvidence,
      relations: [
        {
          type: "constrained-by",
          targetSlug: "durable-execution",
          explanation: "状态写入和恢复语义约束该运行模式。",
          evidenceUrls: [publicUrl],
          confidence: 0.86,
        },
      ],
    }), applyOptions("2026-08-02T10:00:00.000Z"));

    // Simulate a stale/invalid persisted type that bypassed current writer validation.
    database.prepare(`
      INSERT INTO concept_revision_relations
        (concept_slug, revision, relation_type, target_slug, explanation, confidence, evidence_urls_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "dynamic-relation-source", 1, "invented-relation-type", "durable-execution",
      "非法类型即使已落库也不能进入公开图。", 0.99, JSON.stringify([publicUrl]),
    );

    const snapshot = await buildSnapshot(database);
    const constrained = snapshot.relations.find((relation) => relation.relationType === "constrained-by");
    assert.deepEqual(constrained, {
      from: "Dynamic Relation Source",
      type: "约束于",
      relationType: "constrained-by",
      to: "Durable Execution Canonical",
      note: "状态写入和恢复语义约束该运行模式。",
      evidenceUrls: [publicUrl],
      confidence: 0.86,
    }, "公开关系必须由 SQLite 当前概念关系投影，并保留规范中文标签与原始 type");
    assert.equal(
      snapshot.relations.some((relation) => relation.relationType === "invented-relation-type"),
      false,
      "只有生产白名单内的关系类型可以进入公开关系图",
    );
    assert.equal(snapshot.relations.length, 1, "不得混入静态 bootstrap 关系或其他非权威关系");
  } finally {
    database.close();
  }
});

test("snapshot excludes formal concept relations backed only by watch or reject evidence", async () => {
  const { applyConceptKnowledgeRevision } = await knowledgeApi("applyConceptKnowledgeRevision");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.community]);
    const publicUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "relation-formal-evidence",
      originalTitle: "Formal concept evidence",
    });
    const watchUrl = insertEvidenceArticle(database, SOURCES.community, {
      suffix: "relation-watch-evidence",
      originalTitle: "Watch relation evidence",
      publishDecision: "watch",
    });
    const rejectedUrl = insertEvidenceArticle(database, SOURCES.community, {
      suffix: "relation-reject-evidence",
      originalTitle: "Rejected relation evidence",
      publishDecision: "reject",
    });
    const evidence = [evidenceFor(SOURCES.vendorBlog, publicUrl, "Formal concept evidence")];
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "public-relation-target",
      name: "Public Relation Target",
      aliases: ["公开关系目标"],
      evidence,
    }), applyOptions());
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "public-relation-source",
      name: "Public Relation Source",
      aliases: ["公开关系源"],
      evidence,
    }), applyOptions("2026-08-02T10:00:00.000Z"));

    for (const [relationType, url, explanation] of [
      ["depends-on", watchUrl, "仅由 watch 证据支持。"],
      ["enables", rejectedUrl, "仅由 reject 证据支持。"],
    ]) {
      database.prepare(`
        INSERT INTO concept_revision_relations
          (concept_slug, revision, relation_type, target_slug, explanation, confidence, evidence_urls_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        "public-relation-source", 1, relationType, "public-relation-target",
        explanation, 0.9, JSON.stringify([url]),
      );
    }

    const snapshot = await buildSnapshot(database);
    assert.equal(
      snapshot.relations.some((relation) => relation.from === "Public Relation Source"),
      false,
      "watch/reject 文章可以参与候选积累，但不能作为公开概念关系的证据",
    );
    assert.equal(
      snapshot.relations.some((relation) => relation.evidenceUrls?.some((url) => [watchUrl, rejectedUrl].includes(url))),
      false,
      "公开关系 DTO 不得泄漏非 publish 证据 URL",
    );
  } finally {
    database.close();
  }
});

test("snapshot formal concepts come only from current public SQLite knowledge revisions", async () => {
  const { applyConceptKnowledgeRevision } = await knowledgeApi("applyConceptKnowledgeRevision");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.practitioner, SOURCES.community]);
    const publicUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "formal-concept-gate",
      originalTitle: "Source-bound formal concept evidence",
    });
    const practitionerUrl = insertEvidenceArticle(database, SOURCES.practitioner, {
      suffix: "formal-concept-independent-support",
      originalTitle: "独立实践支持 SQLite 正式概念",
    });
    const candidateUrl = insertEvidenceArticle(database, SOURCES.community, {
      suffix: "candidate-concept-gate",
      originalTitle: "Candidate-only concept evidence",
    });
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "sqlite-formal-concept",
      name: "SQLite Formal Concept",
      aliases: ["SQLite 正式概念"],
      evidence: [
        evidenceFor(SOURCES.vendorBlog, publicUrl, "Source-bound formal concept evidence", {
          supports: ["checkpoint-before-side-effect"],
        }),
        evidenceFor(SOURCES.practitioner, practitionerUrl, "独立实践支持 SQLite 正式概念", {
          supports: ["approval-is-state-transition"],
        }),
      ],
    }), applyOptions());
    applyConceptKnowledgeRevision(database, fullKnowledgePayload({
      slug: "sqlite-candidate-concept",
      name: "SQLite Candidate Concept",
      aliases: ["SQLite 候选概念"],
      stage: "candidate",
      evidence: [evidenceFor(SOURCES.community, candidateUrl, "Candidate-only concept evidence")],
    }), applyOptions("2026-08-02T10:00:00.000Z"));

    const archivedPayload = fullKnowledgePayload({
      slug: "sqlite-archived-concept",
      name: "SQLite Archived Concept",
      aliases: ["SQLite 已归档概念"],
      stage: "archived",
      evidence: [evidenceFor(SOURCES.vendorBlog, publicUrl, "Source-bound formal concept evidence")],
    });
    archivedPayload.concept.revision = 1;
    database.prepare(`
      INSERT INTO concept_knowledge
        (slug, canonical_name, stage, heat, maturity, current_revision, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "sqlite-archived-concept", "SQLite Archived Concept", "archived", 1, 1, 1,
      JSON.stringify(archivedPayload), "2026-08-02T11:00:00.000Z",
    );
    database.prepare(`
      INSERT INTO concept_revisions
        (concept_slug, revision, payload_json, changed_fields_json, provider, model, change_reason, analyzed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "sqlite-archived-concept", 1, JSON.stringify(archivedPayload), "[]", "test", "test",
      "archived fixture", "2026-08-02T11:00:00.000Z", "2026-08-02T11:00:00.000Z",
    );

    const snapshot = await buildSnapshot(database);
    assert.deepEqual(
      snapshot.concepts.map((concept) => concept.slug),
      ["sqlite-formal-concept"],
      "一旦存在 SQLite 概念知识，正式目录只能含当前非 candidate/archived 的持久化修订，不能混入 config 静态术语",
    );
    assert.ok(snapshot.concepts[0].revision >= 1);
    assert.ok(snapshot.concepts[0].evidence.length > 0);
    assert.ok(snapshot.concepts[0].claims.every((claim) => claim.evidenceUrls.length > 0));
  } finally {
    database.close();
  }
});

test("empty SQLite knowledge does not present config concepts as source-bound formal concepts", async () => {
  const database = await createDatabase();
  try {
    const snapshot = await buildSnapshot(database);
    assert.deepEqual(
      snapshot.concepts,
      [],
      "没有 concept_knowledge 时，静态 config 术语不得伪装成带来源和修订的正式概念",
    );
  } finally {
    database.close();
  }
});

test("watch history backfill remains a candidate until publish evidence promotes the same concept", async () => {
  const {
    getConceptKnowledge,
    listConceptKnowledgeRevisions,
    runConceptKnowledgeBackfill,
  } = await knowledgeApi("getConceptKnowledge", "listConceptKnowledgeRevisions", "runConceptKnowledgeBackfill");
  const database = await createDatabase();
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog, SOURCES.practitioner, SOURCES.community]);
    const watchUrl = insertEvidenceArticle(database, SOURCES.community, {
      suffix: "watch-origin-history",
      originalTitle: "Watch-origin candidate history",
      publishDecision: "watch",
      engagementCount: 9999,
    });
    const rejectedUrl = insertEvidenceArticle(database, SOURCES.community, {
      suffix: "rejected-history",
      originalTitle: "Rejected history must not backfill",
      publishDecision: "reject",
    });
    const analyzedUrls = [];
    const analyzeArticle = async (article) => {
      analyzedUrls.push(article.url);
      return fullKnowledgePayload({
        slug: "watch-origin-concept",
        name: "Watch Origin Concept",
        aliases: ["Watch Origin Alias", "观察起源概念"],
        stage: "emerging",
        heat: 97,
        evidence: [evidenceFor(SOURCES.community, article.url, article.original_title)],
      });
    };
    const watch = await runConceptKnowledgeBackfill({
      database,
      analyzeArticle,
      batchSize: 10,
      articleUrls: [watchUrl, rejectedUrl],
      now: "2026-08-02T09:00:00.000Z",
    });
    assert.equal(watch.processedCount, 1, "watch 文章必须被历史回填消费");
    assert.deepEqual(analyzedUrls, [watchUrl], "reject 文章不得进入概念分析");

    let current = getConceptKnowledge(database, "watch-origin-concept")?.concept;
    assert.equal(current?.stage, "candidate", "仅 watch 的官方/高热/模型 emerging 声明不得进入正式目录");
    assert.ok(current?.aliases.includes("Watch Origin Alias"));
    assert.ok(current?.evidence.some((item) => item.url === watchUrl), "候选必须保留 watch 原文");
    let snapshot = await buildSnapshot(database);
    assert.equal(snapshot.concepts.some((item) => item.slug === "watch-origin-concept"), false);
    assert.ok(snapshot.candidateConcepts.some((item) => item.slug === "watch-origin-concept"));

    const publishUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "publish-promotion-history",
      originalTitle: "Publish evidence promotes watch candidate",
    });
    const publish = await runConceptKnowledgeBackfill({
      database,
      analyzeArticle: async (article) => fullKnowledgePayload({
        slug: "watch-origin-concept",
        name: "Watch Origin Concept",
        aliases: ["Watch Origin Alias", "正式晋升别名"],
        stage: "emerging",
        evidence: [evidenceFor(SOURCES.vendorBlog, article.url, article.original_title)],
      }),
      batchSize: 10,
      articleUrls: [publishUrl],
      now: "2026-08-02T10:00:00.000Z",
    });
    assert.equal(publish.processedCount, 1);
    current = getConceptKnowledge(database, "Watch Origin Alias")?.concept;
    assert.equal(current?.stage, "candidate", "只有一组 publish 正式证据时仍必须保持候选");
    assert.ok(current?.evidence.some((item) => item.url === watchUrl), "首次 publish 积累不能丢弃 watch 历史原文");
    assert.ok(current?.evidence.some((item) => item.url === publishUrl));
    snapshot = await buildSnapshot(database);
    assert.equal(snapshot.concepts.some((item) => item.slug === "watch-origin-concept"), false);
    assert.ok(snapshot.candidateConcepts.some((item) => item.slug === "watch-origin-concept"));

    const independentPublishUrl = insertEvidenceArticle(database, SOURCES.practitioner, {
      suffix: "publish-independent-promotion-history",
      originalTitle: "独立实践证据晋升 watch 候选",
    });
    const independentPublish = await runConceptKnowledgeBackfill({
      database,
      analyzeArticle: async (article) => fullKnowledgePayload({
        slug: "watch-origin-concept",
        name: "Watch Origin Concept",
        aliases: ["Watch Origin Alias", "正式晋升别名"],
        stage: "emerging",
        evidence: [evidenceFor(SOURCES.practitioner, article.url, article.original_title)],
      }),
      batchSize: 10,
      articleUrls: [independentPublishUrl],
      now: "2026-08-02T10:30:00.000Z",
    });
    assert.equal(independentPublish.processedCount, 1);
    current = getConceptKnowledge(database, "Watch Origin Alias")?.concept;
    assert.equal(current?.stage, "emerging", "获得两组独立 publish 正式证据后候选应按本地生命周期规则晋升");
    assert.ok(current?.aliases.includes("正式晋升别名"));
    assert.ok(current?.evidence.some((item) => item.url === publishUrl));
    assert.ok(current?.evidence.some((item) => item.url === independentPublishUrl));
    const revisions = listConceptKnowledgeRevisions(database, "watch-origin-concept");
    assert.deepEqual(revisions.map((item) => item.revision), [3, 2, 1]);
    assert.ok(
      revisions.some((revision) => revision.payload?.evidence?.some((item) => item.url === watchUrl)),
      "正式投影可以过滤 watch，但 append-only 修订历史不能丢弃候选期原文",
    );
    snapshot = await buildSnapshot(database);
    assert.ok(snapshot.concepts.some((item) => item.slug === "watch-origin-concept"));
    assert.equal(snapshot.candidateConcepts.some((item) => item.slug === "watch-origin-concept"), false);

    const rerun = await runConceptKnowledgeBackfill({
      database,
      analyzeArticle,
      batchSize: 10,
      articleUrls: [watchUrl, publishUrl, independentPublishUrl, rejectedUrl],
      now: "2026-08-02T11:00:00.000Z",
    });
    assert.equal(rerun.processedCount, 0, "已完成的 watch 与 publish 历史回填必须幂等");
    assert.equal(rerun.skippedCount, 3);
    assert.deepEqual(analyzedUrls, [watchUrl], "幂等重跑不得再次调用 analyzer 或处理 reject");
  } finally {
    database.close();
  }
});

test("concept backfill lease allows one owner, recovers after expiry, and releases after terminal outcomes", async () => {
  const { getConceptKnowledge, runConceptKnowledgeBackfill } = await knowledgeApi("getConceptKnowledge", "runConceptKnowledgeBackfill");
  const database = await createDatabase();
  let releaseFirstAnalyzer;
  let firstRun;
  try {
    upsertSourceCatalog(database, [SOURCES.vendorBlog]);
    const primaryUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "lease-primary",
      originalTitle: "Lease primary article",
    });
    let analyzerCalls = 0;
    let firstAnalyzerStarted;
    const firstAnalyzerStartedPromise = new Promise((resolve) => { firstAnalyzerStarted = resolve; });
    const firstAnalyzerGate = new Promise((resolve) => { releaseFirstAnalyzer = resolve; });
    firstRun = runConceptKnowledgeBackfill({
      database,
      articleUrls: [primaryUrl],
      batchSize: 1,
      now: "2026-08-02T09:00:00.000Z",
      analyzeArticle: async (article) => {
        analyzerCalls += 1;
        firstAnalyzerStarted();
        await firstAnalyzerGate;
        return fullKnowledgePayload({
          slug: "lease-owner-concept",
          name: "First Owner Must Not Win After Expiry",
          aliases: ["first-owner"],
          evidence: [evidenceFor(SOURCES.vendorBlog, article.url, article.original_title)],
        });
      },
    });
    await firstAnalyzerStartedPromise;

    const overlapping = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [primaryUrl],
      batchSize: 1,
      now: "2026-08-02T09:00:00.000Z",
      analyzeArticle: async () => {
        analyzerCalls += 1;
        throw new Error("overlapping runner must not own the active article");
      },
    });
    assert.equal(analyzerCalls, 1, "同一 article 的活跃 lease 只能允许一个 analyzer");
    assert.equal(overlapping.processedCount, 0, "非 owner 必须识别活跃 claim，而不是完成或覆盖它");
    assert.equal(overlapping.failedCount, 0);

    let recoveryCalls = 0;
    const recovered = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [primaryUrl],
      batchSize: 1,
      now: "2030-08-02T09:00:00.000Z",
      analyzeArticle: async (article) => {
        recoveryCalls += 1;
        return fullKnowledgePayload({
          slug: "lease-owner-concept",
          name: "Recovered Lease Owner",
          aliases: ["recovered-owner"],
          evidence: [evidenceFor(SOURCES.vendorBlog, article.url, article.original_title)],
        });
      },
    });
    assert.equal(recoveryCalls, 1, "过期 lease 必须允许新的 owner 恢复处理");
    assert.equal(recovered.processedCount, 1);
    releaseFirstAnalyzer();
    await firstRun;
    const recoveredConcept = getConceptKnowledge(database, "lease-owner-concept")?.concept;
    assert.equal(recoveredConcept?.canonicalName, "Recovered Lease Owner", "过期 owner 返回后不得覆盖新 owner 的结果");
    assert.equal(recoveredConcept?.revisions.length, 1, "非 owner 不得再追加或完成历史 revision");

    const retryAfterFailureUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "lease-failure-release",
      originalTitle: "Failure releases lease",
    });
    const failure = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [retryAfterFailureUrl],
      batchSize: 1,
      now: "2030-08-02T10:00:00.000Z",
      analyzeArticle: async () => { throw new Error("expected analysis failure"); },
    });
    assert.equal(failure.failedCount, 1);
    const retryAfterFailure = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [retryAfterFailureUrl],
      batchSize: 1,
      now: "2030-08-02T10:01:00.000Z",
      analyzeArticle: async (article) => fullKnowledgePayload({
        slug: "failure-recovered-concept",
        name: "Failure Recovered Concept",
        aliases: ["Failure Recovered Alias"],
        evidence: [evidenceFor(SOURCES.vendorBlog, article.url, article.original_title)],
      }),
    });
    assert.equal(retryAfterFailure.processedCount, 1, "失败必须释放自身 lease，以便立即重试");

    const casUrl = insertEvidenceArticle(database, SOURCES.vendorBlog, {
      suffix: "lease-cas-release",
      originalTitle: "CAS conflict releases lease",
      contentHash: "before-cas",
    });
    const casConflict = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [casUrl],
      batchSize: 1,
      now: "2030-08-02T11:00:00.000Z",
      analyzeArticle: async (article) => {
        database.prepare("UPDATE articles SET content_hash = ? WHERE url = ?").run("after-cas", article.url);
        return fullKnowledgePayload({
          slug: "cas-release-concept",
          name: "CAS Release Concept",
          aliases: ["CAS Release Alias"],
          evidence: [evidenceFor(SOURCES.vendorBlog, article.url, article.original_title)],
        });
      },
    });
    assert.equal(casConflict.conflictCount, 1);
    const retryAfterCas = await runConceptKnowledgeBackfill({
      database,
      articleUrls: [casUrl],
      batchSize: 1,
      now: "2030-08-02T11:01:00.000Z",
      analyzeArticle: async (article) => fullKnowledgePayload({
        slug: "cas-release-concept",
        name: "CAS Release Concept",
        aliases: ["CAS Release Alias"],
        evidence: [evidenceFor(SOURCES.vendorBlog, article.url, article.original_title)],
      }),
    });
    assert.equal(retryAfterCas.processedCount, 1, "CAS 冲突必须释放自身 lease，以便内容更新后重试");
  } finally {
    releaseFirstAnalyzer?.();
    await firstRun?.catch?.(() => {});
    database.close();
  }
});
