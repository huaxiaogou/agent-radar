import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import {
  CONCEPT_RULES,
  deepSeekAnalysis,
  scoreRelevance,
  shouldExploreCandidate,
} from "../radar/analyze.mjs";
import { analyzeConceptKnowledgeArticle } from "../radar/concept-analyze.mjs";
import {
  applyConceptKnowledgeRevision,
  parseConceptKnowledgeAnalysis,
} from "../radar/concept-knowledge.mjs";
import {
  insertArticle,
  openDatabase,
  upsertSourceCatalog,
} from "../radar/database.mjs";
import { runIngestion } from "../radar/pipeline.mjs";

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

const ANALYSIS_TIME = "2026-08-03T06:00:00.000Z";
const SOURCE = {
  id: "independent-patch-practice",
  name: "Independent Patch Practice",
  homepage: "https://patch-practice.example.com",
  class: "独立实践者",
  family: "practitioner",
  layer: "practitioner",
  priority: "P0",
  cadence: "4h",
  focus: "AI Coding 工程方法与代码变更验证",
  independentGroup: "independent-patch-practice",
  language: "en",
};

const CITED_TEXT_FIELDS = [
  "definition",
  "nonDefinition",
  "problem",
  "whyNow",
  "origin",
  "mechanism",
  "architecture",
  "dailyDelta",
];

function articleFixture({
  suffix = "proof-carrying-patch",
  title = "Proof-Carrying Patch Protocol for Autonomous Repository Changes",
  candidateConcept = "",
  conceptSlug = "coding-agent",
} = {}) {
  return {
    url: `${SOURCE.homepage}/${suffix}`,
    sourceId: SOURCE.id,
    sourceName: SOURCE.name,
    sourceClass: SOURCE.class,
    sourceLayer: SOURCE.layer,
    sourceFamily: SOURCE.family,
    independentGroup: SOURCE.independentGroup,
    sourceLanguage: SOURCE.language,
    originalTitle: title,
    originalExcerpt: "Every repository mutation carries its plan, checks, reviewer decision and acceptance result.",
    contentText: "The implementation binds each repository diff to compiler checks, policy decisions, review evidence and an acceptance result before the change can advance.",
    publishedAt: "2026-08-03T04:00:00.000Z",
    discoveredAt: "2026-08-03T04:05:00.000Z",
    conceptSlug,
    candidateConcept,
  };
}

function identityDecision({
  action,
  canonicalSlug,
  confidence,
  reason,
  comparedSlugs = [],
} = {}) {
  return {
    action,
    canonicalSlug,
    confidence,
    reason,
    comparedSlugs,
  };
}

function knowledgePayload({
  article,
  slug = "proof-carrying-patch",
  canonicalName = "可证明代码变更",
  aliases = ["Proof-Carrying Patch", "验收携带式补丁"],
  definition = "可证明代码变更把计划、代码差异、验证结果和验收裁决绑定为同一份可审计变更记录。",
  mechanism = "每次代码变更先生成稳定身份，再附加构建检查、策略裁决和人工验收结果，只有证据闭合后才能推进。",
  stage = "candidate",
  decision = identityDecision({
    action: "create-new",
    canonicalSlug: slug,
    confidence: 0.93,
    reason: "现有概念在问题定义和运行机制上均不覆盖这种以变更为单位携带验收证据的做法。",
  }),
} = {}) {
  const claimKey = `${slug}-mechanism`;
  const evidenceUrl = article.url;
  const concept = {
    slug,
    canonicalName,
    aliases,
    stage,
    heat: 58,
    maturity: 34,
    definition,
    nonDefinition: "它不是只在合并请求中展示测试结果，也不是把一次构建成功当作完整的工程验收。",
    problem: "自动代码变更的计划、补丁、验证和验收经常分散在不同系统中，导致责任边界与完成证据无法一致审计。",
    whyNow: "自动化代码修改开始跨越多个工具和长时间任务，单一成功状态已经无法证明变更满足工程约束。",
    origin: "当前材料提出这一工程做法；规范名称和更早思想来源仍需更多独立证据核验。",
    evolution: [],
    mechanism,
    architecture: "变更控制器、验证执行器、策略门禁和验收账本围绕同一变更身份写入证据，并向发布流程提供确定性裁决。",
    designConstraints: [],
    implementationPatterns: ["以稳定变更身份关联代码差异、验证任务、权限裁决与人工验收记录。"],
    antiPatterns: [],
    tradeoffs: [],
    failureModes: [],
    securityRisks: [],
    operationalConcerns: [],
    applicability: [],
    nonApplicability: [],
    controversies: [],
    dailyDelta: "本次材料提出了以代码变更为单位绑定验证和验收证据的候选工程模式。",
    lastMeaningfulChange: ANALYSIS_TIME,
  };
  return {
    identityDecision: decision,
    concept,
    claims: [{
      key: claimKey,
      text: "代码变更只有在计划、差异、验证和验收结果绑定到同一身份后才能形成可审计完成证据。",
      kind: "mechanism",
      confidence: 0.86,
    }],
    evidence: [{
      url: evidenceUrl,
      originalTitle: article.originalTitle,
      sourceName: article.sourceName,
      sourceLayer: article.sourceLayer,
      independentGroup: article.independentGroup,
      supports: [claimKey],
      stance: "support",
      publishedAt: article.publishedAt,
    }],
    citations: [
      ...CITED_TEXT_FIELDS,
      "aliases",
      "implementationPatterns",
    ].map((field) => ({ field, evidenceUrls: [evidenceUrl] })),
    relations: [],
  };
}

function openAIResponse(payload) {
  return new Response(JSON.stringify({
    status: "completed",
    output: [{
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(payload) }],
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function deepSeekResponse(payload) {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(payload) } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

async function isolatedDatabase(prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.add(directory);
  process.env.RADAR_DATA_DIR = directory;
  const database = openDatabase();
  if (originalDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
  else process.env.RADAR_DATA_DIR = originalDataDirectory;
  upsertSourceCatalog(database, [SOURCE]);
  return database;
}

function persistEvidenceArticle(database, article, {
  publishDecision = "watch",
  contentHash = article.url,
} = {}) {
  assert.equal(insertArticle(database, {
    url: article.url,
    sourceId: article.sourceId,
    sourceName: article.sourceName,
    sourceClass: article.sourceClass,
    independentGroup: article.independentGroup,
    sourceLayer: article.sourceLayer,
    sourceLanguage: article.sourceLanguage,
    originalTitle: article.originalTitle,
    originalExcerpt: article.originalExcerpt,
    contentText: article.contentText,
    publishedAt: article.publishedAt,
    discoveredAt: article.discoveredAt,
    contentHash,
    relevanceScore: 8,
    signalSlug: `identity-${contentHash.replaceAll(/[^a-z0-9]+/giu, "-")}`,
    conceptSlug: article.conceptSlug,
    title: "可证明代码变更形成候选工程模式",
    summary: "材料把代码差异、验证结果和验收裁决绑定为可审计证据。",
    implication: "需要检查变更身份是否贯穿计划、执行、验证和人工验收。",
    topic: "概念",
    stage: "Spark",
    accent: "engineering",
    tags: ["proof-carrying-patch"],
    analysisMode: "deepseek",
    publishDecision,
    editorialScore: 78,
    aiRelevanceScore: 84,
    noveltyScore: 88,
    evidenceScore: 74,
    eventKey: `proof-carrying-patch:${contentHash}`,
    candidateConcept: article.candidateConcept,
  }), true);
}

function reachesAnalysisGate(item, source) {
  const relevance = scoreRelevance(item, source);
  return relevance >= 3 || shouldExploreCandidate(item, source, {
    now: new Date(ANALYSIS_TIME).getTime(),
  });
}

test("unknown high-quality official and practitioner AI Coding terms reach LLM discovery while generic AI noise stays out", () => {
  const unknownConceptItems = [
    {
      title: "Patch Proof Ledgers for Autonomous Repository Changes",
      excerpt: "Repository diffs carry compiler checks, policy decisions and reviewer acceptance evidence.",
      contentText: "The engineering design binds change identity to build results and release gates.",
      sourceLayer: "official",
      sourceFamily: "official",
      publishedAt: "2026-08-03T04:00:00.000Z",
    },
    {
      title: "Field report: Acceptance-Carrying Diffs",
      excerpt: "A production repository records patch intent, checks and reviewer decisions as one auditable unit.",
      contentText: "The report compares failure recovery and false acceptance across real code changes.",
      sourceLayer: "practitioner",
      sourceFamily: "practitioner",
      publishedAt: "2026-08-03T04:00:00.000Z",
    },
  ];
  const sourceByLayer = {
    official: {
      family: "official",
      layer: "official",
      focus: "AI Coding 工程方法、代码变更验证与开发工作流",
      alwaysRelevant: false,
    },
    practitioner: {
      family: "practitioner",
      layer: "practitioner",
      focus: "AI Coding 生产实践、代码仓库自动化与工程验收",
      alwaysRelevant: false,
    },
  };

  for (const item of unknownConceptItems) {
    const normalized = `${item.title} ${item.excerpt} ${item.contentText}`.toLowerCase();
    assert.equal(
      CONCEPT_RULES.some((rule) => rule.terms.some((term) => normalized.includes(term))),
      false,
      "fixture 必须证明它没有命中当前固定概念词，而不是偷偷依赖第十二个硬编码关键词",
    );
    assert.equal(
      reachesAnalysisGate(item, sourceByLayer[item.sourceLayer]),
      true,
      `${item.sourceLayer} 的高质量新工程术语不能在 LLM 分析前被 relevance=0 丢弃`,
    );
  }

  const genericNoise = {
    title: "AI Lifestyle Assistant Launches Celebrity Photo Filters",
    excerpt: "A consumer campaign adds avatars, stickers and subscription discounts.",
    contentText: "The launch focuses on entertainment engagement and advertising reach.",
    sourceLayer: "official",
    sourceFamily: "official",
    publishedAt: "2026-08-03T04:00:00.000Z",
  };
  assert.equal(
    reachesAnalysisGate(genericNoise, sourceByLayer.official),
    false,
    "可信来源身份只能提高发现召回，不能让泛 AI 消费和营销噪声绕过工程相关性",
  );
});

test("production ingestion sends an unknown official AI Coding term through the real enrichment gate into LLM analysis", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-unknown-official-ingestion-"));
  temporaryDirectories.add(directory);
  const originalFetch = globalThis.fetch;
  const environmentKeys = [
    "RADAR_DATA_DIR",
    "RADAR_AI_PROVIDER",
    "DEEPSEEK_API_KEY",
    "RADAR_MAX_ITEM_AGE_DAYS",
    "RADAR_MAX_NEW_ITEMS",
    "RADAR_SOURCE_CONCURRENCY",
    "RADAR_FETCH_CONCURRENCY",
    "RADAR_ANALYSIS_CONCURRENCY",
  ];
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  let deepSeekCalls = 0;
  process.env.RADAR_DATA_DIR = directory;
  process.env.RADAR_AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "unknown-official-ingestion-test-key";
  process.env.RADAR_MAX_ITEM_AGE_DAYS = "365";
  process.env.RADAR_MAX_NEW_ITEMS = "4";
  process.env.RADAR_SOURCE_CONCURRENCY = "89";
  process.env.RADAR_FETCH_CONCURRENCY = "4";
  process.env.RADAR_ANALYSIS_CONCURRENCY = "1";

  const articleUrl = "https://openai.com/index/patch-proof-ledgers/";
  const emptyFeed = "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>Empty</title></channel></rss>";
  const sourceFetch = async (input) => {
    const url = String(input);
    if (url === "https://openai.com/news/rss.xml") {
      return new Response(`<?xml version="1.0"?><rss version="2.0"><channel>
        <title>Official engineering</title>
        <item>
          <title>Patch Proof Ledgers for Autonomous Repository Changes</title>
          <link>${articleUrl}</link>
          <description>Repository diffs carry compiler checks, policy decisions and reviewer acceptance evidence.</description>
          <pubDate>Mon, 03 Aug 2026 04:00:00 GMT</pubDate>
        </item>
      </channel></rss>`, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    if (url === articleUrl) {
      return new Response(`<!doctype html><html><body><main><article>
        <h1>Patch Proof Ledgers for Autonomous Repository Changes</h1>
        <p>The engineering design binds every repository diff to compiler checks, policy decisions, reviewer acceptance evidence and release gates.</p>
        <p>Each change identity carries the plan, implementation result, failure recovery record and final acceptance decision.</p>
      </article></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (/\.xml(?:\?|$)|\.rss(?:\?|$)|\.atom(?:\?|$)|\/feed\/?(?:\?|$)|\/rss\/?(?:\?|$)/iu.test(url)) {
      return new Response(emptyFeed, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    if (/api\.github\.com|hn\.algolia\.com|public\.api\.bsky\.app/iu.test(url)) {
      return new Response(JSON.stringify({ items: [], hits: [], feed: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("<!doctype html><html><body><main>No matching engineering items.</main></body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
  globalThis.fetch = async (input) => {
    assert.match(String(input), /api\.deepseek\.com\/chat\/completions$/u);
    deepSeekCalls += 1;
    return deepSeekResponse({
      title: "可证明代码变更把验收证据绑定到补丁",
      summary: "官方工程材料描述了一个候选模式：每个代码差异携带构建、策略和人工验收结果。",
      implication: "应继续寻找独立实践证据，并验证变更身份能否贯穿计划、检查和发布门禁。",
      topic: "概念",
      conceptSlug: "proof-carrying-patch",
      stage: "Spark",
      accent: "signal",
      tags: ["proof-carrying-patch"],
      publishDecision: "watch",
      editorialScore: 78,
      relevanceScore: 86,
      noveltyScore: 92,
      evidenceScore: 74,
      eventKey: "proof-carrying-patch:first-observation",
      candidateConcept: "可证明代码变更",
    });
  };
  try {
    const result = await runIngestion({
      trigger: "test",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: {
        fetchImpl: sourceFetch,
        resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
        createDispatcher: () => ({ close: async () => {} }),
      },
      modelLandscapeFetcher: async () => [],
    });
    assert.ok(deepSeekCalls >= 1, "未知 official 工程术语必须真正到达 analyzeItem，而不是只让一个局部 helper 返回 true");
    assert.equal(result.watchedCount, 1, "单一官方来源的新术语应先进入候选观察，不得自动晋升或公开");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of environmentKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("first-pass structured analysis accepts a format-constrained dynamic concept slug instead of forcing the fixed catalog", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  let requestBody;
  process.env.DEEPSEEK_API_KEY = "dynamic-slug-test-key";
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(init.body);
    return deepSeekResponse({
      title: "可证明代码变更把验收证据绑定到补丁",
      summary: "实践材料描述了一个独立工程模式：每个代码差异携带构建、策略和人工验收结果。",
      implication: "应验证变更身份是否贯穿计划、修改、检查和发布门禁，并保留原始证据。",
      topic: "概念",
      conceptSlug: "proof-carrying-patch",
      stage: "Spark",
      accent: "signal",
      tags: ["proof-carrying-patch", "acceptance-evidence"],
      publishDecision: "watch",
      editorialScore: 79,
      relevanceScore: 88,
      noveltyScore: 92,
      evidenceScore: 72,
      eventKey: "proof-carrying-patch:first-observation",
      candidateConcept: "可证明代码变更",
    });
  };
  try {
    const result = await deepSeekAnalysis({
      title: "Proof-Carrying Patch Protocol",
      excerpt: "Repository mutations carry compiler checks, policy decisions and reviewer acceptance evidence.",
      contentText: "The implementation binds every diff to its plan, checks and acceptance result.",
      sourceName: "Independent Patch Practice",
      sourceClass: "独立实践者",
      sourceLayer: "practitioner",
      sourceLanguage: "en",
      url: "https://patch-practice.example.com/proof-carrying-patch",
      publishedAt: "2026-08-03T04:00:00.000Z",
      relevanceScore: 4,
    });
    const systemPrompt = String(requestBody.messages?.[0]?.content || "");
    assert.doesNotMatch(systemPrompt, /conceptSlug\s*只能是/u, "首轮 schema 不能继续把概念身份锁死在固定目录");
    assert.match(systemPrompt, /conceptSlug[\s\S]{0,240}(?:a-z0-9|kebab|短横线|格式)/iu, "动态 slug 仍必须受稳定格式约束");
    assert.equal(result.conceptSlug, "proof-carrying-patch");
    assert.equal(result.candidateConcept, "可证明代码变更");
    assert.equal(result.publishDecision, "watch", "单来源新术语仍须通过编辑决策门禁，不能因动态 slug 自动发布");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("dynamic concept slug remains subject to Chinese editorial and allowed-evidence gates", () => {
  const article = articleFixture();
  const valid = knowledgePayload({ article, slug: "proof-carrying-patch" });
  const parsed = parseConceptKnowledgeAnalysis(valid, {
    allowedEvidenceUrls: [article.url],
    knownConceptSlugs: [],
  });
  assert.equal(parsed.concept.slug, "proof-carrying-patch");

  const english = structuredClone(valid);
  english.concept.definition = "A proof carrying patch binds plan, diff, verification and acceptance evidence into one record.";
  assert.throws(
    () => parseConceptKnowledgeAnalysis(english, { allowedEvidenceUrls: [article.url] }),
    /中文|汉字/iu,
  );

  const fabricated = structuredClone(valid);
  fabricated.evidence[0].url = "https://fabricated.invalid/not-in-input";
  for (const citation of fabricated.citations) citation.evidenceUrls = [fabricated.evidence[0].url];
  assert.throws(
    () => parseConceptKnowledgeAnalysis(fabricated, { allowedEvidenceUrls: [article.url] }),
    /允许|证据链接/iu,
  );
});

test("strict concept schema requires an auditable identity decision and supplies aliases, definition and mechanism for comparison", async () => {
  const article = articleFixture();
  const known = {
    slug: "patch-verification-loop",
    canonicalName: "补丁验证闭环",
    aliases: ["Patch Verification Loop", "变更验收闭环"],
    definition: "补丁验证闭环把代码变更、检查结果和验收责任绑定为可审计记录。",
    mechanism: "同一变更身份贯穿差异生成、验证执行、权限裁决和人工验收。",
    stage: "candidate",
  };
  const requests = [];
  await analyzeConceptKnowledgeArticle(article, {
    provider: "openai",
    knownConcepts: [known],
    now: ANALYSIS_TIME,
    maxAttempts: 1,
    environment: {
      OPENAI_API_KEY: "identity-schema-test-key",
      RADAR_OPENAI_CONCEPT_MODEL: "identity-schema-model",
      RADAR_OPENAI_CONCEPT_MAX_TOKENS: "6000",
      RADAR_OPENAI_CONCEPT_TIMEOUT_MS: "1000",
    },
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      return openAIResponse(knowledgePayload({
        article,
        decision: identityDecision({
          action: "create-new",
          canonicalSlug: "proof-carrying-patch",
          confidence: 0.91,
          reason: "候选在问题定义和机制上与已知概念存在明确差异。",
          comparedSlugs: [known.slug],
        }),
      }));
    },
  });

  const batchSchema = requests[0].text?.format?.schema;
  const schema = batchSchema?.properties?.concepts?.items;
  assert.equal(batchSchema?.properties?.concepts?.minItems, 0, "证据不足的普通更新必须允许明确返回零概念");
  assert.equal(batchSchema?.properties?.concepts?.maxItems, 3, "单篇文章只提取少量独立知识增量，不能要求模型一次生成八份 dossier");
  assert.ok(schema?.properties?.identityDecision, "批量严格 provider schema 的每个概念都必须声明 identityDecision，而不是只在提示词中口头要求");
  assert.ok(schema.required.includes("identityDecision"), "每个新知识分析结果都必须产生可审计身份裁决");
  assert.deepEqual(schema.required, ["identityDecision", "concept", "fields", "claims"]);
  assert.deepEqual(
    schema.properties.identityDecision.properties.action.enum,
    ["reuse-existing", "create-new", "needs-review"],
  );
  assert.equal(schema.properties.concept.properties.slug.enum, undefined, "概念 slug 不能枚举为固定目录");
  assert.match(schema.properties.concept.properties.slug.pattern, /a-z0-9/iu);
  assert.match(String(requests[0].input), new RegExp(known.aliases[0], "u"));
  assert.match(String(requests[0].input), new RegExp(known.definition, "u"));
  assert.match(String(requests[0].input), new RegExp(known.mechanism, "u"), "身份归一不能只比较名字；必须给模型定义与机制上下文");
});

test("multi-concept reuse reloads every selected existing dossier before accepting a blind rewrite", async () => {
  const firstArticle = articleFixture({
    suffix: "existing-checkpoint-contract",
    title: "Existing checkpoint contract",
    conceptSlug: "checkpoint-contract",
  });
  const secondArticle = articleFixture({
    suffix: "existing-delegation-contract",
    title: "Existing delegation contract",
    conceptSlug: "delegation-contract",
  });
  const incomingArticle = articleFixture({
    suffix: "checkpoint-and-delegation-update",
    title: "Checkpoint and delegation contracts updated together",
    conceptSlug: "checkpoint-contract",
  });
  const checkpoint = knowledgePayload({
    article: firstArticle,
    slug: "checkpoint-contract",
    canonicalName: "检查点契约",
  });
  const delegation = knowledgePayload({
    article: secondArticle,
    slug: "delegation-contract",
    canonicalName: "委派验收契约",
  });
  checkpoint.concept.architecture = "检查点旧档案要求状态、恢复游标和重放边界共同进入不可变恢复账本。";
  delegation.concept.architecture = "委派旧档案要求任务授权、独立复核和最终验收分别留下不可变责任记录。";

  const updatedCheckpoint = knowledgePayload({
    article: incomingArticle,
    slug: checkpoint.concept.slug,
    canonicalName: checkpoint.concept.canonicalName,
    decision: identityDecision({
      action: "reuse-existing",
      canonicalSlug: checkpoint.concept.slug,
      confidence: 0.96,
      reason: "名称、问题定义和检查点恢复机制与已有规范概念一致。",
      comparedSlugs: [checkpoint.concept.slug],
    }),
  });
  const updatedDelegation = knowledgePayload({
    article: incomingArticle,
    slug: delegation.concept.slug,
    canonicalName: delegation.concept.canonicalName,
    decision: identityDecision({
      action: "reuse-existing",
      canonicalSlug: delegation.concept.slug,
      confidence: 0.96,
      reason: "名称、问题定义和委派验收机制与已有规范概念一致。",
      comparedSlugs: [delegation.concept.slug],
    }),
  });
  const requests = [];
  const result = await analyzeConceptKnowledgeArticle(incomingArticle, {
    provider: "openai",
    knownConcepts: [checkpoint.concept, delegation.concept],
    existingKnowledge: checkpoint,
    existingKnowledgeCatalog: [checkpoint, delegation],
    now: ANALYSIS_TIME,
    maxAttempts: 1,
    environment: {
      OPENAI_API_KEY: "multi-existing-context-key",
      RADAR_OPENAI_CONCEPT_MODEL: "multi-existing-context-model",
      RADAR_OPENAI_CONCEPT_MAX_TOKENS: "6000",
      RADAR_OPENAI_CONCEPT_TIMEOUT_MS: "1000",
    },
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      return openAIResponse({ concepts: [updatedCheckpoint, updatedDelegation] });
    },
  });

  assert.equal(result.length, 2);
  assert.equal(requests.length, 2, "首次输出选择第二个既有概念后，必须携带其完整旧档案再分析一次");
  assert.match(String(requests[0].input), new RegExp(checkpoint.concept.architecture, "u"));
  assert.doesNotMatch(String(requests[0].input), new RegExp(delegation.concept.architecture, "u"));
  assert.match(String(requests[1].input), new RegExp(delegation.concept.architecture, "u"), "不能在只看到定义摘要时覆盖第二个概念的完整旧知识");
});

test("provider output without an identity decision is rejected instead of silently creating a duplicate", async () => {
  const article = articleFixture();
  const withoutIdentity = knowledgePayload({ article });
  delete withoutIdentity.identityDecision;
  await assert.rejects(
    analyzeConceptKnowledgeArticle(article, {
      provider: "openai",
      knownConcepts: [],
      now: ANALYSIS_TIME,
      maxAttempts: 1,
      environment: {
        OPENAI_API_KEY: "missing-identity-test-key",
        RADAR_OPENAI_CONCEPT_MODEL: "missing-identity-model",
        RADAR_OPENAI_CONCEPT_MAX_TOKENS: "6000",
        RADAR_OPENAI_CONCEPT_TIMEOUT_MS: "1000",
      },
      fetchImpl: async () => openAIResponse(withoutIdentity),
    }),
    /identity|身份|概念知识分析失败/iu,
  );
});

test("high-confidence semantic equivalence reuses the canonical slug and stores the identity decision in the append-only revision", async () => {
  const database = await isolatedDatabase("agent-radar-concept-identity-reuse-");
  try {
    const existingArticle = articleFixture({
      suffix: "patch-verification-loop",
      title: "Patch Verification Loop operating contract",
      candidateConcept: "补丁验证闭环",
      conceptSlug: "patch-verification-loop",
    });
    persistEvidenceArticle(database, existingArticle, { contentHash: "existing-loop" });
    const existingPayload = knowledgePayload({
      article: existingArticle,
      slug: "patch-verification-loop",
      canonicalName: "补丁验证闭环",
      aliases: ["Patch Verification Loop", "变更验收闭环"],
      definition: "补丁验证闭环把计划、代码差异、验证结果和验收裁决绑定为同一份可审计变更记录。",
      mechanism: "同一变更身份贯穿差异生成、构建验证、策略裁决和人工验收，证据闭合后才能推进。",
    });
    applyConceptKnowledgeRevision(database, existingPayload, {
      provider: "fixture",
      model: "fixture",
      analyzedAt: "2026-08-03T05:00:00.000Z",
      reason: "建立待归一规范候选",
    });

    const incomingArticle = articleFixture({
      suffix: "proof-carrying-patch-alias",
      candidateConcept: "Proof-Carrying Patch",
      conceptSlug: "proof-carrying-patch",
    });
    persistEvidenceArticle(database, incomingArticle, { contentHash: "incoming-alias" });
    const reuseReason = "名称不同，但定义、变更身份贯穿机制和历史别名均与补丁验证闭环语义等价。";
    const proposed = knowledgePayload({
      article: incomingArticle,
      slug: "proof-carrying-patch",
      canonicalName: "可证明补丁",
      aliases: ["Proof-Carrying Patch", "Patch Verification Loop"],
      definition: existingPayload.concept.definition,
      mechanism: existingPayload.concept.mechanism,
      decision: identityDecision({
        action: "reuse-existing",
        canonicalSlug: "patch-verification-loop",
        confidence: 0.96,
        reason: reuseReason,
        comparedSlugs: ["patch-verification-loop"],
      }),
    });
    const analyzed = await analyzeConceptKnowledgeArticle(incomingArticle, {
      provider: "deepseek",
      knownConcepts: [existingPayload.concept],
      now: ANALYSIS_TIME,
      maxAttempts: 1,
      environment: {
        DEEPSEEK_API_KEY: "identity-reuse-test-key",
        RADAR_DEEPSEEK_CONCEPT_MODEL: "identity-reuse-model",
        RADAR_DEEPSEEK_CONCEPT_MAX_TOKENS: "6000",
        RADAR_DEEPSEEK_CONCEPT_TIMEOUT_MS: "1000",
      },
      fetchImpl: async () => deepSeekResponse(proposed),
    });
    const applied = applyConceptKnowledgeRevision(database, analyzed, {
      provider: "deepseek",
      model: "identity-reuse-model",
      analyzedAt: ANALYSIS_TIME,
      reason: "自动概念身份归一",
    });

    assert.equal(applied.slug, "patch-verification-loop", "语义等价项必须复用规范 slug，而不是依赖事后人工 merge");
    assert.equal(
      Number(database.prepare("SELECT COUNT(*) AS count FROM concept_knowledge WHERE merged_into IS NULL").get().count),
      1,
      "自动归一不能先静默创建重复概念再等待人工清理",
    );
    const row = database.prepare(`
      SELECT revision, payload_json, review_reasons_json
      FROM concept_revisions
      WHERE concept_slug = 'patch-verification-loop'
      ORDER BY revision DESC LIMIT 1
    `).get();
    assert.equal(Number(row.revision), 2);
    assert.deepEqual(JSON.parse(row.payload_json).identityDecision, proposed.identityDecision, "identity decision 必须随 append-only revision 审计保留");
    assert.ok(JSON.parse(row.review_reasons_json).some((reason) => reason.includes(reuseReason)), "身份裁决理由必须进入可查询审计原因");
  } finally {
    database.close();
  }
});

test("low-confidence similarity stays a reviewable candidate while a high-difference term can be created without an embedding service", async () => {
  const database = await isolatedDatabase("agent-radar-concept-identity-review-");
  try {
    const existingArticle = articleFixture({ suffix: "existing-contract", candidateConcept: "补丁验证闭环" });
    persistEvidenceArticle(database, existingArticle, { contentHash: "existing-contract" });
    const existing = knowledgePayload({
      article: existingArticle,
      slug: "patch-verification-loop",
      canonicalName: "补丁验证闭环",
      aliases: ["Patch Verification Loop"],
    });
    applyConceptKnowledgeRevision(database, existing, {
      provider: "fixture",
      model: "fixture",
      analyzedAt: "2026-08-03T05:00:00.000Z",
    });

    const ambiguousArticle = articleFixture({
      suffix: "ambiguous-patch-proof-ledger",
      candidateConcept: "Patch Proof Ledger",
      conceptSlug: "patch-proof-ledger",
    });
    persistEvidenceArticle(database, ambiguousArticle, { contentHash: "ambiguous-ledger" });
    const reviewReason = "名称和部分机制相似，但材料没有证明它与补丁验证闭环完全等价，也没有证明它解决独立问题。";
    const ambiguous = knowledgePayload({
      article: ambiguousArticle,
      slug: "patch-proof-ledger",
      canonicalName: "补丁证明账本",
      stage: "validated",
      decision: identityDecision({
        action: "needs-review",
        canonicalSlug: "patch-verification-loop",
        confidence: 0.62,
        reason: reviewReason,
        comparedSlugs: ["patch-verification-loop"],
      }),
    });
    const ambiguousAnalysis = await analyzeConceptKnowledgeArticle(ambiguousArticle, {
      provider: "deepseek",
      knownConcepts: [existing.concept],
      now: ANALYSIS_TIME,
      maxAttempts: 1,
      environment: {
        DEEPSEEK_API_KEY: "identity-review-test-key",
        RADAR_DEEPSEEK_CONCEPT_MODEL: "identity-review-model",
        RADAR_DEEPSEEK_CONCEPT_MAX_TOKENS: "6000",
        RADAR_DEEPSEEK_CONCEPT_TIMEOUT_MS: "1000",
      },
      fetchImpl: async () => deepSeekResponse(ambiguous),
    });
    const ambiguousApplied = applyConceptKnowledgeRevision(database, ambiguousAnalysis, {
      provider: "deepseek",
      model: "identity-review-model",
      analyzedAt: ANALYSIS_TIME,
    });
    const ambiguousStored = database.prepare("SELECT stage FROM concept_knowledge WHERE slug = ?").get("patch-proof-ledger");
    assert.equal(ambiguousStored.stage, "candidate", "needs-review 不能静默创建重复正式概念");
    assert.equal(ambiguousApplied.needsReview, true);
    const ambiguousRevision = database.prepare(`
      SELECT payload_json, review_reasons_json FROM concept_revisions
      WHERE concept_slug = ? ORDER BY revision DESC LIMIT 1
    `).get("patch-proof-ledger");
    assert.deepEqual(JSON.parse(ambiguousRevision.payload_json).identityDecision, ambiguous.identityDecision);
    assert.ok(JSON.parse(ambiguousRevision.review_reasons_json).some((reason) => reason.includes(reviewReason)));

    const distinctArticle = articleFixture({
      suffix: "counterfactual-build-sandbox",
      title: "Counterfactual Build Sandbox for Alternative Repository Futures",
      candidateConcept: "反事实构建沙箱",
      conceptSlug: "counterfactual-build-sandbox",
    });
    persistEvidenceArticle(database, distinctArticle, { contentHash: "distinct-sandbox" });
    const distinct = knowledgePayload({
      article: distinctArticle,
      slug: "counterfactual-build-sandbox",
      canonicalName: "反事实构建沙箱",
      aliases: ["Counterfactual Build Sandbox"],
      definition: "反事实构建沙箱并行执行多个尚未提交的代码未来，用隔离构建结果比较替代方案。",
      mechanism: "系统从同一仓库状态分叉多个隔离工作区，分别应用互斥方案并比较构建、测试和资源结果。",
      decision: identityDecision({
        action: "create-new",
        canonicalSlug: "counterfactual-build-sandbox",
        confidence: 0.94,
        reason: "问题是并行比较替代代码未来，机制是隔离分叉执行，与补丁验收闭环具有高差异。",
        comparedSlugs: ["patch-verification-loop"],
      }),
    });
    const distinctAnalysis = await analyzeConceptKnowledgeArticle(distinctArticle, {
      provider: "deepseek",
      knownConcepts: [existing.concept],
      now: ANALYSIS_TIME,
      maxAttempts: 1,
      environment: {
        DEEPSEEK_API_KEY: "identity-create-test-key",
        RADAR_DEEPSEEK_CONCEPT_MODEL: "identity-create-model",
        RADAR_DEEPSEEK_CONCEPT_MAX_TOKENS: "6000",
        RADAR_DEEPSEEK_CONCEPT_TIMEOUT_MS: "1000",
      },
      fetchImpl: async () => deepSeekResponse(distinct),
    });
    const distinctApplied = applyConceptKnowledgeRevision(database, distinctAnalysis, {
      provider: "deepseek",
      model: "identity-create-model",
      analyzedAt: ANALYSIS_TIME,
    });
    assert.equal(distinctApplied.slug, "counterfactual-build-sandbox");
    assert.equal(database.prepare("SELECT stage FROM concept_knowledge WHERE slug = ?").get(distinctApplied.slug).stage, "candidate");
  } finally {
    database.close();
  }
});
