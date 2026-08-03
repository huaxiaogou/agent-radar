import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  insertArticle,
  openDatabase,
  upsertSourceCatalog,
} from "../radar/database.mjs";
import {
  applyConceptKnowledgeRevision,
  getConceptKnowledge,
  listConceptKnowledge,
  listConceptKnowledgeRevisions,
  mergeConceptKnowledge,
  parseConceptKnowledgeAnalysis,
} from "../radar/concept-knowledge.mjs";
import { buildSnapshot } from "../radar/snapshot.mjs";

const projectPath = fileURLToPath(new URL("../", import.meta.url));
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

async function runNodeCommand(arguments_, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, arguments_, {
      cwd: projectPath,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function source(id, {
  layer = "official",
  family = layer === "community" ? "community" : layer === "practitioner" ? "practitioner" : "official",
  language = "zh",
} = {}) {
  return {
    id,
    name: `${id} source`,
    homepage: `https://${id}.example.test`,
    class: layer === "community" ? "中文社区" : layer === "practitioner" ? "独立实践者" : "一手工程",
    family,
    layer,
    priority: "P0",
    cadence: "4h",
    focus: "AI Coding 概念知识",
    independentGroup: id,
    language,
  };
}

const SOURCES = {
  officialA: source("contract-official-a"),
  practitionerB: source("contract-practitioner-b", { layer: "practitioner" }),
  officialC: source("contract-official-c"),
  practitionerD: source("contract-practitioner-d", { layer: "practitioner" }),
  communityE: source("contract-community-e", { layer: "community" }),
};

async function createDatabase(prefix = "agent-radar-concept-contract-") {
  const directory = await mkdtemp(`${os.tmpdir()}/${prefix}`);
  process.env.RADAR_DATA_DIR = directory;
  const database = openDatabase();
  upsertSourceCatalog(database, Object.values(SOURCES));
  return { database, directory };
}

async function closeDatabase(database, directory) {
  database.close();
  delete process.env.RADAR_DATA_DIR;
  await rm(directory, { recursive: true, force: true });
}

function insertEvidence(database, sourceValue, suffix, {
  publishDecision = "publish",
  publishedAt = "2026-08-03T05:00:00.000Z",
} = {}) {
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
    originalExcerpt: "Agent 工程知识证据。",
    contentText: "来源解释了状态、恢复、权限和验收边界。",
    publishedAt,
    discoveredAt: "2026-08-03T05:10:00.000Z",
    contentHash: `${sourceValue.id}:${suffix}`,
    relevanceScore: 10,
    signalSlug: `contract-${sourceValue.id}-${suffix}`,
    conceptSlug: "contract-knowledge",
    title: `${suffix} 的中文工程结论`,
    summary: "这条材料提供可核验的工程机制和边界。",
    implication: "需要把结论绑定到原始证据并保留修订历史。",
    topic: "概念",
    stage: "Emerging",
    accent: "engineering",
    tags: ["concept-knowledge"],
    analysisMode: "deepseek",
    publishDecision,
    editorialScore: 88,
    aiRelevanceScore: 90,
    noveltyScore: 82,
    evidenceScore: sourceValue.layer === "community" ? 48 : 84,
    eventKey: `${sourceValue.id}:${suffix}`,
    candidateConcept: publishDecision === "watch" ? "待验证知识边界" : "",
  });
  return {
    url,
    originalTitle: `${suffix} original evidence`,
    sourceName: sourceValue.name,
    sourceLayer: sourceValue.layer,
    independentGroup: sourceValue.independentGroup,
    publishedAt,
  };
}

const KNOWLEDGE_FIELDS = [
  "definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta",
  "aliases", "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs",
  "failureModes", "securityRisks", "operationalConcerns", "applicability", "nonApplicability", "controversies",
];

function payload({
  slug = "contract-knowledge",
  canonicalName = "契约知识对象",
  aliases = ["契约知识别名"],
  evidence = [],
  claims = [{
    key: "authority-boundary",
    text: "知识更新必须绑定原始证据并保留可恢复的最后有效版本。",
    kind: "constraint",
    confidence: 0.88,
  }],
  relations = [],
  overrides = {},
} = {}) {
  const concept = {
    slug,
    canonicalName,
    aliases,
    stage: "emerging",
    heat: 50,
    maturity: 50,
    definition: "该知识对象用独立来源和追加式修订维护高级智能编程工程结论。",
    nonDefinition: "它不是根据共同出现自动生成的标签，也不是没有来源的术语包装。",
    problem: "静态概念容易在更新失败、名称合并和证据变化后丢失权威工程含义。",
    whyNow: "智能编程工程变化加快，需要可恢复、可追溯并能持续修订的知识对象。",
    origin: "当前命名来自多份工程材料的归纳，最早起源仍按原始证据继续核验。",
    evolution: ["从静态术语索引演进为证据驱动的追加式知识修订账本。"],
    mechanism: "系统先验证来源、主张和概念关系，再把有效修订写入权威账本并生成公开投影。",
    architecture: "文章存储、概念修订、证据绑定、关系校验和原子快照共同组成知识链。",
    designConstraints: ["任何公开主张都必须具有当前可发布的证据链接。"],
    implementationPatterns: ["通过追加式修订和最后有效版本回退保护知识连续性。"],
    antiPatterns: ["仅因两个术语共同出现就建立强概念关系。"],
    tradeoffs: ["增加审计和存储成本，换取知识变化的可解释性。"],
    failureModes: ["当前载荷损坏会导致正式概念从公开快照静默消失。"],
    securityRisks: ["未验证的模型链接可能把伪造来源写进权威知识。"],
    operationalConcerns: ["需要监控损坏回退、修订积压和公开投影状态。"],
    applicability: ["适用于需要持续吸收多来源工程证据的高级知识库。"],
    nonApplicability: ["不适用于没有原始来源支撑的一次性术语猜测。"],
    controversies: ["概念名称稳定之前，候选含义仍可能需要合并或重定向。"],
    dailyDelta: "本次修订补充了权威关系、回退与证据合并边界。",
    lastMeaningfulChange: "2026-08-03T06:00:00.000Z",
    ...overrides,
  };
  const normalizedEvidence = evidence.map((item) => ({
    ...item,
    supports: item.supports || claims.map((claim) => claim.key),
    stance: item.stance || "support",
  }));
  return {
    concept,
    claims,
    evidence: normalizedEvidence,
    citations: KNOWLEDGE_FIELDS
      .filter((field) => typeof concept[field] === "string" || (Array.isArray(concept[field]) && concept[field].length > 0))
      .map((field) => ({ field, evidenceUrls: normalizedEvidence.map((item) => item.url) })),
    relations,
  };
}

function apply(database, knowledge, analyzedAt = "2026-08-03T06:00:00.000Z", reason = "契约测试建立知识") {
  return applyConceptKnowledgeRevision(database, knowledge, {
    provider: "contract-test",
    model: "contract-test-model",
    analyzedAt,
    reason,
  });
}

test("relation parser treats an empty known-concept set as authoritative and rejects a dangling target", () => {
  const evidence = [{
    url: "https://contract-official-a.example.test/relation-evidence",
    originalTitle: "Relation evidence",
    sourceName: "Relation source",
    sourceLayer: "official",
    independentGroup: "relation-source",
  }];
  const candidate = payload({
    evidence,
    relations: [{
      type: "depends-on",
      targetSlug: "never-established-target",
      explanation: "两个术语只在同一材料出现，不能据此生成悬空关系。",
      evidenceUrls: [evidence[0].url],
      confidence: 0.41,
    }],
  });

  assert.throws(
    () => parseConceptKnowledgeAnalysis(candidate, {
      allowedEvidenceUrls: [evidence[0].url],
      knownConceptSlugs: [],
    }),
    /关系|target|已知|正式/u,
    "knownConceptSlugs=[] 明确表示当前没有合法目标，不得被解释成关闭校验",
  );
});

test("authoritative revision writer rejects a dangling co-occurrence relation before revision or graph publication", async () => {
  const { database, directory } = await createDatabase("agent-radar-dangling-relation-");
  try {
    const first = insertEvidence(database, SOURCES.officialA, "dangling-a");
    const second = insertEvidence(database, SOURCES.practitionerB, "dangling-b");
    const candidate = payload({
      evidence: [first, second],
      relations: [{
        type: "depends-on",
        targetSlug: "unknown-cooccurring-term",
        explanation: "来源只让两个术语共同出现，没有建立可解释的工程依赖。",
        evidenceUrls: [first.url],
        confidence: 0.38,
      }],
    });
    let failure = null;
    try {
      apply(database, candidate);
    } catch (error) {
      failure = error;
    }
    const snapshot = await buildSnapshot(database);
    assert.deepEqual({
      rejected: Boolean(failure),
      knowledgeRows: database.prepare("SELECT COUNT(*) AS count FROM concept_knowledge").get().count,
      revisionRows: database.prepare("SELECT COUNT(*) AS count FROM concept_revisions").get().count,
      relationRows: database.prepare("SELECT COUNT(*) AS count FROM concept_revision_relations").get().count,
      graphEdges: snapshot.relations.length,
    }, {
      rejected: true,
      knowledgeRows: 0,
      revisionRows: 0,
      relationRows: 0,
      graphEdges: 0,
    }, "悬空共同出现关系必须在权威写入边界整体拒绝，不能只依赖 graph 最后过滤");
  } finally {
    await closeDatabase(database, directory);
  }
});

test("corrupt current payload falls back to the latest valid append-only revision with an observable recovered state", async () => {
  const { database, directory } = await createDatabase("agent-radar-corrupt-current-");
  try {
    const official = insertEvidence(database, SOURCES.officialA, "recovery-official");
    const practitioner = insertEvidence(database, SOURCES.practitionerB, "recovery-practitioner");
    apply(database, payload({
      slug: "last-good-concept",
      canonicalName: "最后有效知识",
      aliases: ["Last Good Knowledge"],
      evidence: [official, practitioner],
    }));
    database.prepare("UPDATE concept_knowledge SET payload_json = ? WHERE slug = ?")
      .run('{"concept":', "last-good-concept");

    const direct = getConceptKnowledge(database, "last-good-concept");
    const listed = listConceptKnowledge(database).find((entry) => entry?.concept?.slug === "last-good-concept");
    const snapshot = await buildSnapshot(database);
    const projected = snapshot.concepts.find((concept) => concept.slug === "last-good-concept");

    assert.deepEqual({
      directName: direct?.concept?.canonicalName,
      directIntegrity: direct?.concept?.integrityStatus,
      directRecoveredRevision: direct?.concept?.recoveredRevision,
      listedName: listed?.concept?.canonicalName,
      listedIntegrity: listed?.concept?.integrityStatus,
      snapshotName: projected?.canonicalName,
      snapshotIntegrity: projected?.integrityStatus,
      snapshotRecoveredRevision: projected?.recoveredRevision,
    }, {
      directName: "最后有效知识",
      directIntegrity: "recovered",
      directRecoveredRevision: 1,
      listedName: "最后有效知识",
      listedIntegrity: "recovered",
      snapshotName: "最后有效知识",
      snapshotIntegrity: "recovered",
      snapshotRecoveredRevision: 1,
    }, "current payload 故障不能让正式知识静默消失；get/list/snapshot 都必须公开回退状态和修订号");
  } finally {
    await closeDatabase(database, directory);
  }
});

test("merge creates a canonical revision that folds old claims, evidence and citations while keeping aliases and redirect provenance", async () => {
  const { database, directory } = await createDatabase("agent-radar-merge-fold-");
  try {
    const canonicalA = insertEvidence(database, SOURCES.officialA, "canonical-a");
    const canonicalB = insertEvidence(database, SOURCES.practitionerB, "canonical-b");
    const legacyC = insertEvidence(database, SOURCES.officialC, "legacy-c");
    const legacyD = insertEvidence(database, SOURCES.practitionerD, "legacy-d");
    const legacyWatch = insertEvidence(database, SOURCES.communityE, "legacy-watch", { publishDecision: "watch" });

    apply(database, payload({
      slug: "canonical-runtime",
      canonicalName: "规范运行时知识",
      aliases: ["Canonical Runtime"],
      evidence: [canonicalA, canonicalB],
      claims: [{
        key: "canonical-state-boundary",
        text: "规范概念明确了状态提交与外部副作用之间的工程边界。",
        kind: "mechanism",
        confidence: 0.87,
      }],
    }), "2026-08-03T06:00:00.000Z", "建立规范概念");

    apply(database, payload({
      slug: "legacy-runtime",
      canonicalName: "旧版运行时知识",
      aliases: ["旧运行时别名", "Legacy Runtime"],
      claims: [
        {
          key: "legacy-recovery-rule",
          text: "旧名称下的独立实践补充了中断恢复的幂等约束。",
          kind: "pattern",
          confidence: 0.81,
        },
        {
          key: "watch-only-observation",
          text: "社区观察提出尚未正式验证的恢复命名分歧。",
          kind: "controversy",
          confidence: 0.51,
        },
      ],
      evidence: [
        { ...legacyC, supports: ["legacy-recovery-rule"] },
        { ...legacyD, supports: ["legacy-recovery-rule"] },
        { ...legacyWatch, supports: ["watch-only-observation"], stance: "context" },
      ],
    }), "2026-08-03T06:10:00.000Z", "建立待合并旧概念");

    const mergeReason = "名称不同但机制、边界和工程证据已经归一";
    mergeConceptKnowledge(database, {
      fromSlug: "legacy-runtime",
      intoSlug: "canonical-runtime",
      reason: mergeReason,
      mergedAt: "2026-08-03T07:00:00.000Z",
    });

    const canonical = getConceptKnowledge(database, "canonical-runtime");
    const byOldAlias = getConceptKnowledge(database, "旧运行时别名");
    const redirect = getConceptKnowledge(database, "legacy-runtime");
    const revisions = listConceptKnowledgeRevisions(database, "canonical-runtime");
    const latest = revisions[0];
    const rawEvidenceUrls = latest?.payload?.evidence?.map((item) => item.url).sort() || [];
    const rawClaimKeys = latest?.payload?.claims?.map((item) => item.key).sort() || [];
    const rawMechanismCitations = latest?.payload?.citations
      ?.find((item) => item.field === "mechanism")?.evidenceUrls?.sort() || [];
    const publicEvidenceUrls = canonical?.concept?.evidence?.map((item) => item.url).sort() || [];
    const publicClaimKeys = canonical?.concept?.claims?.map((item) => item.key).sort() || [];

    assert.deepEqual({
      canonicalRevisionCount: revisions.length,
      latestPreviousRevision: latest?.previousRevision,
      latestChangeReason: latest?.changeReason,
      rawEvidenceUrls,
      rawClaimKeys,
      rawMechanismCitations,
      publicEvidenceUrls,
      publicClaimKeys,
      canonicalAliases: canonical?.concept?.aliases?.filter((item) => /旧版运行时知识|旧运行时别名|Legacy Runtime/u.test(item)).sort(),
      aliasResolvesTo: byOldAlias?.concept?.slug,
      redirectTo: redirect?.redirectTo,
      mergeReason: redirect?.mergeReason,
    }, {
      canonicalRevisionCount: 2,
      latestPreviousRevision: 1,
      latestChangeReason: mergeReason,
      rawEvidenceUrls: [canonicalA.url, canonicalB.url, legacyC.url, legacyD.url, legacyWatch.url].sort(),
      rawClaimKeys: ["canonical-state-boundary", "legacy-recovery-rule", "watch-only-observation"].sort(),
      rawMechanismCitations: [canonicalA.url, canonicalB.url, legacyC.url, legacyD.url, legacyWatch.url].sort(),
      publicEvidenceUrls: [canonicalA.url, canonicalB.url, legacyC.url, legacyD.url].sort(),
      publicClaimKeys: ["canonical-state-boundary", "legacy-recovery-rule"].sort(),
      canonicalAliases: ["Legacy Runtime", "旧版运行时知识", "旧运行时别名"].sort(),
      aliasResolvesTo: "canonical-runtime",
      redirectTo: "canonical-runtime",
      mergeReason,
    }, "merge 必须生成新的 canonical 权威修订并合并证据链；旧 slug 永久重定向但 watch 观察不得进入正式公开投影");
  } finally {
    await closeDatabase(database, directory);
  }
});

test("live snapshot declares the dynamic concept-knowledge schema independently of the overall snapshot version", async () => {
  const { database, directory } = await createDatabase("agent-radar-schema-marker-");
  try {
    const official = insertEvidence(database, SOURCES.officialA, "schema-official");
    const practitioner = insertEvidence(database, SOURCES.practitionerB, "schema-practitioner");
    apply(database, payload({
      slug: "schema-concept",
      canonicalName: "动态知识协议概念",
      evidence: [official, practitioner],
    }));
    const snapshot = await buildSnapshot(database);
    assert.deepEqual({
      version: snapshot.version,
      knowledgeSchemaVersion: snapshot.knowledgeSchemaVersion,
      conceptCount: snapshot.concepts.length,
    }, {
      version: 1,
      knowledgeSchemaVersion: 1,
      conceptCount: 1,
    }, "快照总协议可保持 v1，但必须显式声明动态概念知识协议版本，供 loader 拒绝旧静态 concepts v1");
  } finally {
    await closeDatabase(database, directory);
  }
});

test("controlled engineering themes survive analysis, authoritative revision storage and snapshot projection", async () => {
  const { database, directory } = await createDatabase("agent-radar-concept-theme-roundtrip-");
  try {
    const official = insertEvidence(database, SOURCES.officialA, "theme-official");
    const practitioner = insertEvidence(database, SOURCES.practitionerB, "theme-practitioner");
    const themed = payload({
      slug: "themed-runtime-contract",
      canonicalName: "受控主题运行契约",
      aliases: ["Themed Runtime Contract"],
      evidence: [official, practitioner],
      overrides: {
        themes: ["agent-runtime"],
      },
    });

    const parsed = parseConceptKnowledgeAnalysis(themed, {
      allowedEvidenceUrls: [official.url, practitioner.url],
      knownConceptSlugs: [],
    });
    const applied = apply(database, parsed);
    const stored = getConceptKnowledge(database, "themed-runtime-contract")?.concept;
    const projected = (await buildSnapshot(database)).concepts
      .find((concept) => concept.slug === "themed-runtime-contract");

    assert.deepEqual({
      parsed: parsed.concept.themes,
      applied: applied.concept.themes,
      stored: stored?.themes,
      projected: projected?.themes,
    }, {
      parsed: ["agent-runtime"],
      applied: ["agent-runtime"],
      stored: ["agent-runtime"],
      projected: ["agent-runtime"],
    }, "受控主题必须从 LLM 分析协议贯穿 SQLite 权威 revision 到公开 snapshot，不能只在页面临时猜测");
  } finally {
    await closeDatabase(database, directory);
  }
});

test("concept analysis rejects empty or unknown engineering themes before they can enter authoritative knowledge", () => {
  const evidence = [{
    url: "https://contract-official-a.example.test/theme-contract",
    originalTitle: "Theme contract evidence",
    sourceName: "Theme contract source",
    sourceLayer: "official",
    independentGroup: "theme-contract-source",
  }];
  const missingTheme = payload({ evidence, overrides: { themes: [] } });
  const unknownTheme = payload({ evidence, overrides: { themes: ["vendor-magic-dashboard"] } });

  assert.throws(
    () => parseConceptKnowledgeAnalysis(missingTheme, {
      allowedEvidenceUrls: [evidence[0].url],
      knownConceptSlugs: [],
    }),
    /theme|主题/u,
    "新知识对象至少需要一个受控工程主题，不能生成无法导航的无主题条目",
  );
  assert.throws(
    () => parseConceptKnowledgeAnalysis(unknownTheme, {
      allowedEvidenceUrls: [evidence[0].url],
      knownConceptSlugs: [],
    }),
    /theme|主题/u,
    "厂商或模型临时创造的未知主题不得污染受控主题目录",
  );
});

test("snapshot maintenance decays stale lifecycle without articles and appends auditable cooling and archived revisions", async () => {
  const { database, directory } = await createDatabase("agent-radar-lifecycle-maintenance-");
  try {
    const oldPublishedAt = "2025-01-01T00:00:00.000Z";
    const evidence = [
      insertEvidence(database, SOURCES.officialA, "lifecycle-official", { publishedAt: oldPublishedAt }),
      insertEvidence(database, SOURCES.practitionerB, "lifecycle-practitioner", { publishedAt: oldPublishedAt }),
      insertEvidence(database, SOURCES.officialC, "lifecycle-independent", { publishedAt: oldPublishedAt }),
    ];
    const initialMeaningfulChange = "2025-01-01T01:00:00.000Z";
    apply(database, payload({
      slug: "stale-lifecycle-concept",
      canonicalName: "过期生命周期概念",
      aliases: ["Stale Lifecycle Concept"],
      evidence,
      overrides: {
        supersededBy: "next-generation-runtime",
        lastMeaningfulChange: initialMeaningfulChange,
      },
    }), initialMeaningfulChange, "建立已验证概念");
    const initial = getConceptKnowledge(database, "stale-lifecycle-concept")?.concept;
    assert.equal(initial?.stage, "validated", "三个独立公开支持组应先建立 validated 概念");
    const initialHeat = initial?.heat;

    const knowledgeModule = await import("../radar/concept-knowledge.mjs");
    assert.equal(
      typeof knowledgeModule.maintainConceptKnowledgeLifecycles,
      "function",
      "生产必须提供无新文章也可执行的确定性 lifecycle maintenance API",
    );

    await knowledgeModule.maintainConceptKnowledgeLifecycles(database, {
      now: "2025-08-03T00:00:00.000Z",
    });
    const cooling = getConceptKnowledge(database, "stale-lifecycle-concept")?.concept;
    const coolingSnapshot = await buildSnapshot(database);
    const coolingPublic = coolingSnapshot.concepts.find((concept) => concept.slug === "stale-lifecycle-concept");
    assert.deepEqual({
      stage: cooling?.stage,
      heatDecayed: Number(cooling?.heat) < Number(initialHeat),
      lastMeaningfulChange: cooling?.lastMeaningfulChange,
      snapshotStage: coolingPublic?.stage,
    }, {
      stage: "cooling",
      heatDecayed: true,
      lastMeaningfulChange: initialMeaningfulChange,
      snapshotStage: "cooling",
    }, "时间推进本身应衰减 heat 并进入 cooling，但不能伪造一次语义知识变化");

    await knowledgeModule.maintainConceptKnowledgeLifecycles(database, {
      now: "2025-08-04T00:00:00.000Z",
    });
    const archived = getConceptKnowledge(database, "stale-lifecycle-concept")?.concept;
    const archivedSnapshot = await buildSnapshot(database);
    const revisions = listConceptKnowledgeRevisions(database, "stale-lifecycle-concept");
    assert.deepEqual({
      stage: archived?.stage,
      lastMeaningfulChange: archived?.lastMeaningfulChange,
      publicAfterArchive: archivedSnapshot.concepts.some((concept) => concept.slug === "stale-lifecycle-concept"),
      revisions: revisions.map((revision) => ({
        revision: revision.revision,
        provider: revision.provider,
        analyzedAt: revision.analyzedAt,
      })),
    }, {
      stage: "archived",
      lastMeaningfulChange: initialMeaningfulChange,
      publicAfterArchive: false,
      revisions: [
        { revision: 3, provider: "system-lifecycle", analyzedAt: "2025-08-04T00:00:00.000Z" },
        { revision: 2, provider: "system-lifecycle", analyzedAt: "2025-08-03T00:00:00.000Z" },
        { revision: 1, provider: "contract-test", analyzedAt: initialMeaningfulChange },
      ],
    }, "满足 superseded 条件后必须追加 archived 系统修订，并保留原始 meaningful-change 时间");
  } finally {
    await closeDatabase(database, directory);
  }
});

test("merge CLI resumes snapshot publication idempotently after the database merge already committed", async () => {
  const { database, directory } = await createDatabase("agent-radar-merge-resume-");
  const runDirectory = `${directory}/run`;
  try {
    const official = insertEvidence(database, SOURCES.officialA, "合并官方证据");
    const practitioner = insertEvidence(database, SOURCES.practitionerB, "合并实践证据");
    apply(database, payload({
      slug: "resume-old-concept",
      canonicalName: "待合并旧概念",
      aliases: ["Resume Old Concept"],
      evidence: [official, practitioner],
    }), "2026-08-03T05:00:00.000Z", "建立待合并概念");
    apply(database, payload({
      slug: "resume-canonical-concept",
      canonicalName: "合并规范概念",
      aliases: ["Resume Canonical Concept"],
      evidence: [official, practitioner],
    }), "2026-08-03T05:10:00.000Z", "建立规范概念");
    database.close();

    // A directory at the final snapshot path makes the atomic rename fail only
    // after the authoritative SQLite merge has committed.
    await mkdir(`${directory}/radar-snapshot.json`);
    const arguments_ = [
      "scripts/merge-concepts.mjs",
      "--from", "resume-old-concept",
      "--into", "resume-canonical-concept",
      "--reason", "两个名称已经证实描述同一工程机制",
    ];
    const environment = { RADAR_DATA_DIR: directory, RADAR_RUN_DIR: runDirectory };
    const first = await runNodeCommand(arguments_, environment);
    assert.notEqual(first.code, 0, `首次运行应只在 snapshot 发布阶段失败：${first.stdout}\n${first.stderr}`);

    const afterFailure = openDatabase();
    const oldRow = afterFailure.prepare("SELECT merged_into FROM concept_knowledge WHERE slug = ?")
      .get("resume-old-concept");
    const revisionAfterFailure = afterFailure.prepare("SELECT current_revision FROM concept_knowledge WHERE slug = ?")
      .get("resume-canonical-concept").current_revision;
    afterFailure.close();
    assert.equal(oldRow?.merged_into, "resume-canonical-concept", "反例前提：数据库合并已经提交");
    assert.equal(revisionAfterFailure, 2, "首次合并只应追加一个 canonical revision");

    await rm(`${directory}/radar-snapshot.json`, { recursive: true, force: true });
    const resumed = await runNodeCommand(arguments_, environment);
    assert.equal(resumed.code, 0, `同一命令必须识别已提交合并并只续发 snapshot：${resumed.stdout}\n${resumed.stderr}`);

    const afterResume = openDatabase();
    const revisionAfterResume = afterResume.prepare("SELECT current_revision FROM concept_knowledge WHERE slug = ?")
      .get("resume-canonical-concept").current_revision;
    afterResume.close();
    const snapshot = JSON.parse(await readFile(`${directory}/radar-snapshot.json`, "utf8"));
    assert.deepEqual({
      revisionAfterResume,
      redirect: snapshot.conceptRedirects?.["resume-old-concept"]?.redirectTo,
    }, {
      revisionAfterResume: revisionAfterFailure,
      redirect: "resume-canonical-concept",
    }, "resume 只能发布已提交状态，不能重复追加修订");
  } finally {
    if (database?.isOpen) database.close();
    delete process.env.RADAR_DATA_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});

test("merge redirects every inbound relation to the canonical target, unions evidence and removes duplicates and self loops", async () => {
  const { database, directory } = await createDatabase("agent-radar-merge-inbound-relations-");
  try {
    const official = insertEvidence(database, SOURCES.officialA, "relation-official");
    const practitioner = insertEvidence(database, SOURCES.practitionerB, "relation-practitioner");
    const independent = insertEvidence(database, SOURCES.officialC, "relation-independent");
    const evidence = [official, practitioner, independent];

    apply(database, payload({
      slug: "relation-old-target",
      canonicalName: "关系旧目标",
      aliases: ["Relation Old Target"],
      evidence,
    }), "2026-08-03T05:00:00.000Z", "建立旧目标");
    apply(database, payload({
      slug: "relation-canonical-target",
      canonicalName: "关系规范目标",
      aliases: ["Relation Canonical Target"],
      evidence,
      relations: [{
        type: "depends-on",
        targetSlug: "relation-old-target",
        explanation: "规范目标在合并前仍引用旧目标，合并后必须消除自环。",
        evidenceUrls: [independent.url],
        confidence: 0.8,
      }],
    }), "2026-08-03T05:10:00.000Z", "建立规范目标");
    apply(database, payload({
      slug: "relation-external-source",
      canonicalName: "关系外部来源",
      aliases: ["Relation External Source"],
      evidence,
      relations: [{
        type: "depends-on",
        targetSlug: "relation-old-target",
        explanation: "外部来源原本依赖旧目标提供恢复边界。",
        evidenceUrls: [official.url],
        confidence: 0.7,
      }, {
        type: "depends-on",
        targetSlug: "relation-canonical-target",
        explanation: "外部来源也直接依赖规范目标的状态约束。",
        evidenceUrls: [practitioner.url],
        confidence: 0.9,
      }],
    }), "2026-08-03T05:20:00.000Z", "建立外部关系来源");

    mergeConceptKnowledge(database, {
      fromSlug: "relation-old-target",
      intoSlug: "relation-canonical-target",
      reason: "两个目标名称已经证实描述同一工程机制",
      mergedAt: "2026-08-03T06:00:00.000Z",
    });
    const snapshot = await buildSnapshot(database);
    const inbound = snapshot.relations.filter((relation) => (
      relation.from === "关系外部来源" && relation.relationType === "depends-on"
    ));
    assert.deepEqual(inbound.map((relation) => ({
      to: relation.to,
      evidenceUrls: relation.evidenceUrls.slice().sort(),
    })), [{
      to: "关系规范目标",
      evidenceUrls: [official.url, practitioner.url].sort(),
    }], "指向旧 slug 和规范 slug 的重复入边必须重定向并合并证据，而不是静默丢失旧边");
    assert.equal(
      snapshot.relations.some((relation) => relation.from === relation.to),
      false,
      "目标合并后形成的自环必须被移除",
    );
  } finally {
    await closeDatabase(database, directory);
  }
});

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function startNextServer(dataDirectory) {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectPath,
    env: {
      ...process.env,
      NODE_ENV: "production",
      RADAR_DATA_DIR: dataDirectory,
      RADAR_AI_PROVIDER: "rules",
      RADAR_DISABLE_AI: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before ready:\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
      if (response.ok) return { child, baseUrl, output: () => output };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill("SIGTERM");
  throw new Error(`Next.js did not become ready:\n${output}`);
}

test("SSR loader rejects legacy static concept snapshots and formal concept search covers every engineering knowledge field", async (t) => {
  const { database, directory } = await createDatabase("agent-radar-search-contract-");
  let server;
  try {
    const official = insertEvidence(database, SOURCES.officialA, "search-official");
    const practitioner = insertEvidence(database, SOURCES.practitionerB, "search-practitioner");
    apply(database, payload({
      slug: "searchable-formal-concept",
      canonicalName: "可检索正式知识对象",
      aliases: ["锚定别名词"],
      evidence: [official, practitioner],
      overrides: {
        mechanism: "因果闸门机制在副作用发生前验证状态、权限和验收责任。",
        implementationPatterns: ["棋盘式编排模式把任务所有权和恢复点显式放入执行结构。"],
        failureModes: ["幽灵重放故障会在检查点落后于外部副作用时重复执行。"],
        applicability: ["跨仓库长事务任务具有多阶段副作用和人工验收边界。"],
        controversies: ["局部自治争议集中在子智能体能否独立提交不可逆修改。"],
      },
    }));
    const generated = await buildSnapshot(database);
    const validSnapshot = { ...generated, knowledgeSchemaVersion: 1 };
    await writeFile(`${directory}/radar-snapshot.json`, JSON.stringify(validSnapshot));
    database.close();
    delete process.env.RADAR_DATA_DIR;

    server = await startNextServer(directory);
    t.after(async () => {
      if (server?.child && server.child.exitCode === null) server.child.kill("SIGTERM");
      await rm(directory, { recursive: true, force: true });
    });

    for (const [field, query] of [
      ["aliases", "锚定别名词"],
      ["mechanism", "因果闸门机制"],
      ["implementationPatterns", "棋盘式编排模式"],
      ["failureModes", "幽灵重放故障"],
      ["applicability", "跨仓库长事务任务"],
      ["controversies", "局部自治争议"],
    ]) {
      await t.test(`formal search matches ${field}`, async () => {
        const response = await fetch(`${server.baseUrl}/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        assert.equal(response.status, 200);
        const $ = load(await response.text());
        const conceptResult = $(".search-results a").filter((_index, node) => (
          $(node).attr("href") === "/concepts/searchable-formal-concept"
        ));
        assert.equal(conceptResult.length, 1, `${field} 中的可区分查询必须命中正式概念`);
        assert.equal(conceptResult.find("h2").text().trim(), "可检索正式知识对象");
      });
    }

    await t.test("legacy v1 snapshot without knowledge schema marker cannot masquerade as dynamic concepts", async () => {
      const legacy = structuredClone(validSnapshot);
      delete legacy.knowledgeSchemaVersion;
      legacy.concepts = [{
        slug: "legacy-static-concept",
        name: "旧静态概念不得公开",
        canonicalName: "旧静态概念不得公开",
        definition: "这是旧版静态配置内容，不能冒充动态知识。",
        stage: "Validated",
        temperature: 99,
        heat: 99,
        relation: "静态关系",
      }];
      await writeFile(`${directory}/radar-snapshot.json`, JSON.stringify(legacy));
      try {
        const response = await fetch(`${server.baseUrl}/concepts?legacy=${Date.now()}`, { cache: "no-store" });
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.doesNotMatch(html, /旧静态概念不得公开/u, "loader 必须把缺少知识协议标识的旧 v1 当作无效快照");
      } finally {
        await writeFile(`${directory}/radar-snapshot.json`, JSON.stringify(validSnapshot));
      }
    });
  } finally {
    if (database?.isOpen) database.close();
    delete process.env.RADAR_DATA_DIR;
    if (!server) await rm(directory, { recursive: true, force: true });
  }
});
