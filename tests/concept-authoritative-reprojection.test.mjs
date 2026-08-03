import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import { test } from "node:test";

import {
  getSnapshotPath,
  insertArticle,
  openDatabase,
  retireWatchedArticle,
  upsertSourceCatalog,
} from "../radar/database.mjs";
import {
  getConceptKnowledge,
  listConceptKnowledgeRevisions,
  maintainConceptKnowledgeLifecycles,
  runConceptKnowledgeBackfill,
} from "../radar/concept-knowledge.mjs";
import { buildSnapshot, writeSnapshotAtomic } from "../radar/snapshot.mjs";

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
];

async function withDatabase(prefix, run) {
  const directory = await mkdtemp(`${os.tmpdir()}/${prefix}`);
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  process.env.RADAR_DATA_DIR = directory;
  const database = openDatabase();
  try {
    await run(database, directory);
  } finally {
    database.close();
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(directory, { recursive: true, force: true });
  }
}

function source({
  id,
  name,
  sourceClass,
  independentGroup,
  layer,
  language,
}) {
  return {
    id,
    name,
    homepage: `https://${id}.example.test`,
    class: sourceClass,
    family: layer === "community" ? "community" : layer,
    layer,
    priority: "P0",
    cadence: "4h",
    focus: "权威来源元数据与概念生命周期",
    independentGroup,
    language,
    contentRoles: ["engineering-practice"],
  };
}

function articleInput(sourceValue, suffix, {
  publishDecision = "publish",
  conceptSlug = "authoritative-reprojection",
  publishedAt = "2026-08-03T01:00:00.000Z",
} = {}) {
  return {
    url: `${sourceValue.homepage}/${suffix}`,
    sourceId: sourceValue.id,
    sourceName: sourceValue.name,
    sourceClass: sourceValue.class,
    independentGroup: sourceValue.independentGroup,
    sourceLayer: sourceValue.layer,
    sourceLanguage: sourceValue.language,
    contentRoles: sourceValue.contentRoles,
    engagementCount: 12,
    originalTitle: `${sourceValue.name} ${suffix} original evidence`,
    originalExcerpt: "The source describes an auditable checkpoint and recovery contract for coding agents.",
    contentText: "The engineering report describes checkpoints, recovery boundaries, implementation constraints, and operational verification.",
    publishedAt,
    discoveredAt: publishedAt,
    contentHash: `${sourceValue.id}:${suffix}:v1`,
    relevanceScore: 96,
    signalSlug: `${conceptSlug}-${suffix}`,
    conceptSlug,
    title: `${suffix} 的可审计智能体工程证据`,
    summary: "材料给出了检查点、恢复边界、实现约束和运行验证，可回到原始链接复核。",
    implication: "概念知识必须跟随权威文章状态和来源目录修订重新投影。",
    topic: "概念",
    stage: "Emerging",
    accent: "engineering",
    tags: ["concept-governance", "evidence"],
    analysisMode: "deepseek",
    publishDecision,
    editorialScore: 91,
    aiRelevanceScore: 94,
    noveltyScore: 82,
    evidenceScore: 88,
    eventKey: `${conceptSlug}:${suffix}`,
    candidateConcept: publishDecision === "watch" ? "权威证据重投影" : "",
  };
}

function conceptPayload(article, {
  slug = "authoritative-reprojection",
  canonicalName = "权威证据重投影",
  aliases = ["来源元数据重算", "Authoritative Evidence Reprojection"],
  claimKey = "authoritative-evidence-reprojection",
  claimText = "概念当前投影必须由文章状态和来源目录的权威元数据重新裁决。",
  relations = [],
} = {}) {
  const concept = {
    slug,
    canonicalName,
    aliases,
    stage: "candidate",
    heat: 60,
    maturity: 50,
    definition: "权威证据重投影是在保留不可变历史修订的同时，按当前文章状态和来源目录重算概念的公开依赖、独立性与成熟度。",
    nonDefinition: "它不是删除旧修订，也不是允许已拒绝材料继续充当当前公开证据。",
    problem: "文章撤回或来源身份纠正后，旧证据元数据可能继续污染概念公开投影和成熟度。",
    whyNow: "持续采集会产生候选撤回和目录纠正，知识生命周期必须能确定性收敛。",
    origin: "这一约束来自追加式知识账本对当前权威状态与历史审计并存的要求。",
    evolution: ["从只追加文章分析演进为基于当前权威元数据的可审计重投影。"],
    mechanism: "系统保留旧 revision，并以当前 articles 与 source catalog 重新水合证据、计算独立来源组和生命周期。",
    architecture: "来源目录、文章账本、概念 revision、生命周期维护器和原子快照发布器共同形成闭环。",
    designConstraints: ["Reject 证据只能留在历史审计，不得继续成为当前公开依赖。"],
    implementationPatterns: ["目录纠正后同步历史文章，并追加一条按当前元数据生成的新 revision。"],
    antiPatterns: ["为解决脏投影直接删除旧 revision 或清空审计历史。"],
    tradeoffs: ["增加重投影 revision 数量，以换取可追溯性和当前状态正确性。"],
    failureModes: ["同组织被旧分组拆开后会被误算为多份独立验证。"],
    securityRisks: ["撤回材料若仍可公开引用，会把不可信内容伪装成有效证据。"],
    operationalConcerns: ["生命周期重算失败不得阻断后续所有快照发布。"],
    applicability: ["适用于持续抓取、候选审核和来源治理并存的工程知识库。"],
    nonApplicability: ["不适用于没有原始链接和修订审计要求的一次性摘要。"],
    controversies: [],
    dailyDelta: "本次按当前权威状态重新裁决证据依赖、来源独立性与成熟度。",
    lastMeaningfulChange: article.discovered_at,
  };
  const citedFields = [
    ...CITABLE_TEXT_FIELDS,
    ...CITABLE_ARRAY_FIELDS.filter((field) => concept[field].length > 0),
  ];
  return {
    concept,
    claims: [{
      key: claimKey,
      text: claimText,
      kind: "mechanism",
      confidence: 0.92,
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
    citations: citedFields.map((field) => ({ field, evidenceUrls: [article.url] })),
    relations,
  };
}

function currentArticle(database, url) {
  return database.prepare("SELECT * FROM articles WHERE url = ?").get(url);
}

async function analyzeArticles(database, articles, payloadOptions = {}) {
  const byUrl = new Map(articles.map((article) => [article.url, article]));
  return runConceptKnowledgeBackfill({
    database,
    articleUrls: articles.map((article) => article.url),
    batchSize: articles.length,
    concurrency: 1,
    now: "2026-08-03T03:00:00.000Z",
    analyzeArticle: async (article) => {
      const options = typeof payloadOptions === "function"
        ? payloadOptions(article, byUrl.get(article.url))
        : payloadOptions;
      return conceptPayload(article, options);
    },
  });
}

test("rejecting a previously watched concept evidence archives only the current projection while retaining append-only audit history and publishable snapshots", async () => {
  await withDatabase("agent-radar-watch-reject-lifecycle-", async (database) => {
    const watchSource = source({
      id: "watch-retirement-source",
      name: "Watch Retirement Source",
      sourceClass: "实践观察",
      independentGroup: "watch-retirement-org",
      layer: "practitioner",
      language: "en",
    });
    upsertSourceCatalog(database, [watchSource]);

    const watched = articleInput(watchSource, "candidate-evidence", {
      publishDecision: "watch",
      conceptSlug: "retired-watch-concept",
    });
    assert.equal(insertArticle(database, watched), true);
    const analyzed = await analyzeArticles(database, [watched], {
      slug: "retired-watch-concept",
      canonicalName: "被撤回候选概念",
      claimKey: "watch-candidate-observation",
      claimText: "候选观察在审核完成前只能进入候选知识投影。",
    });
    assert.equal(analyzed.processedCount, 1);

    const before = getConceptKnowledge(database, "retired-watch-concept")?.concept;
    const beforeSnapshot = await buildSnapshot(database);
    assert.deepEqual({
      stage: before?.stage,
      revision: before?.revision,
      candidateVisible: beforeSnapshot.candidateConcepts.some((item) => item.slug === "retired-watch-concept"),
    }, {
      stage: "candidate",
      revision: 1,
      candidateVisible: true,
    });

    assert.equal(retireWatchedArticle(database, { ...watched, publishDecision: "reject" }), true);
    assert.equal(currentArticle(database, watched.url).publish_decision, "reject");

    const maintenance = maintainConceptKnowledgeLifecycles(database, {
      now: "2026-08-03T04:00:00.000Z",
    });
    assert.deepEqual(maintenance.failures, [], "Reject 不得令生命周期维护永久失败并冻结后续快照发布");
    assert.equal(maintenance.updatedCount, 1, "撤回必须追加一条当前归档 revision，而不是静默保留候选或删除历史");

    const revisions = listConceptKnowledgeRevisions(database, "retired-watch-concept");
    const current = getConceptKnowledge(database, "retired-watch-concept")?.concept;
    assert.deepEqual({
      revisionNumbers: revisions.map((revision) => revision.revision),
      historicalEvidenceUrls: revisions.at(-1)?.payload?.evidence?.map((item) => item.url),
      currentStage: current?.stage,
      currentEvidenceUrls: current?.evidence?.map((item) => item.url),
      currentClaimCount: current?.claims?.length,
      currentCitationCount: current?.citations?.length,
    }, {
      revisionNumbers: [2, 1],
      historicalEvidenceUrls: [watched.url],
      currentStage: "archived",
      currentEvidenceUrls: [],
      currentClaimCount: 0,
      currentCitationCount: 0,
    }, "旧 revision 可保留 Reject URL 审计，但当前归档投影不得继续依赖它");

    const snapshot = await buildSnapshot(database);
    assert.equal(snapshot.concepts.some((item) => item.slug === "retired-watch-concept"), false);
    assert.equal(snapshot.candidateConcepts.some((item) => item.slug === "retired-watch-concept"), false);
    await writeSnapshotAtomic(snapshot);
    const publishedSnapshot = JSON.parse(await readFile(getSnapshotPath(), "utf8"));
    assert.equal(publishedSnapshot.concepts.some((item) => item.slug === "retired-watch-concept"), false);
    assert.equal(publishedSnapshot.candidateConcepts.some((item) => item.slug === "retired-watch-concept"), false);
  });
});

test("source catalog corrections synchronize historical article identity and append a reprojected lifecycle revision without preserving false independence or stale community maturity", async () => {
  await withDatabase("agent-radar-source-catalog-reprojection-", async (database) => {
    const legacyOfficial = source({
      id: "same-org-official-feed",
      name: "Legacy Official Feed",
      sourceClass: "旧官方分类",
      independentGroup: "same-org-split-a",
      layer: "official",
      language: "en",
    });
    const legacyCommunity = source({
      id: "same-org-field-feed",
      name: "Legacy Community Mirror",
      sourceClass: "旧社区分类",
      independentGroup: "same-org-split-b",
      layer: "community",
      language: "en",
    });
    upsertSourceCatalog(database, [legacyOfficial, legacyCommunity]);

    const officialArticle = articleInput(legacyOfficial, "official-contract");
    const communityArticle = articleInput(legacyCommunity, "field-contract", {
      publishedAt: "2026-08-03T02:00:00.000Z",
    });
    assert.equal(insertArticle(database, officialArticle), true);
    assert.equal(insertArticle(database, communityArticle), true);

    assert.equal((await analyzeArticles(database, [officialArticle], {
      claimKey: "official-contract",
      claimText: "官方材料定义了可审计检查点的基础契约。",
    })).processedCount, 1);
    assert.equal((await analyzeArticles(database, [communityArticle], {
      claimKey: "field-contract",
      claimText: "现场材料补充了恢复失败时的运行边界。",
    })).processedCount, 1);

    const before = getConceptKnowledge(database, "authoritative-reprojection")?.concept;
    const beforeRevisions = listConceptKnowledgeRevisions(database, "authoritative-reprojection");
    assert.deepEqual({
      stage: before?.stage,
      independentSourceGroups: before?.independentSourceGroups,
      maturity: before?.maturity,
      revisionCount: beforeRevisions.length,
    }, {
      stage: "candidate",
      independentSourceGroups: 2,
      maturity: 75,
      revisionCount: 2,
    }, "该 fixture 必须先真实形成“同组织误拆成两个独立组 + community 未计入实践者成熟度”的旧投影");

    const correctedOfficial = {
      ...legacyOfficial,
      name: "Unified Runtime Engineering",
      class: "统一组织官方工程",
      independentGroup: "unified-runtime-org",
      language: "zh",
    };
    const correctedPractitioner = {
      ...legacyCommunity,
      name: "Unified Runtime Field Notes",
      class: "统一组织实践记录",
      family: "practitioner",
      layer: "practitioner",
      independentGroup: "unified-runtime-org",
      language: "zh",
    };
    upsertSourceCatalog(database, [correctedOfficial, correctedPractitioner]);

    const synchronizedArticles = database.prepare(`
      SELECT source_id, source_name, source_class, independent_group, source_layer, source_language
      FROM articles
      ORDER BY source_id
    `).all().map((row) => ({ ...row }));
    assert.deepEqual(synchronizedArticles, [
      {
        source_id: correctedPractitioner.id,
        source_name: correctedPractitioner.name,
        source_class: correctedPractitioner.class,
        independent_group: "unified-runtime-org",
        source_layer: "practitioner",
        source_language: "zh",
      },
      {
        source_id: correctedOfficial.id,
        source_name: correctedOfficial.name,
        source_class: correctedOfficial.class,
        independent_group: "unified-runtime-org",
        source_layer: "official",
        source_language: "zh",
      },
    ], "source catalog 的权威身份纠正必须同事务同步到该来源全部历史 articles");

    const maintenance = maintainConceptKnowledgeLifecycles(database, {
      now: "2026-08-03T05:00:00.000Z",
    });
    assert.deepEqual(maintenance.failures, [], "目录纠正后的确定性重投影不得被 formal last-good 保护误阻断");
    assert.equal(maintenance.updatedCount, 1);

    const after = getConceptKnowledge(database, "authoritative-reprojection")?.concept;
    const afterRevisions = listConceptKnowledgeRevisions(database, "authoritative-reprojection");
    assert.deepEqual({
      stage: after?.stage,
      independentSourceGroups: after?.independentSourceGroups,
      maturity: after?.maturity,
      evidence: after?.evidence?.map((item) => ({
        url: item.url,
        sourceName: item.sourceName,
        sourceLayer: item.sourceLayer,
        independentGroup: item.independentGroup,
      })).sort((left, right) => left.url.localeCompare(right.url)),
      revisionNumbers: afterRevisions.map((revision) => revision.revision),
    }, {
      stage: "candidate",
      independentSourceGroups: 1,
      maturity: 100,
      evidence: [
        {
          url: communityArticle.url,
          sourceName: correctedPractitioner.name,
          sourceLayer: "practitioner",
          independentGroup: "unified-runtime-org",
        },
        {
          url: officialArticle.url,
          sourceName: correctedOfficial.name,
          sourceLayer: "official",
          independentGroup: "unified-runtime-org",
        },
      ].sort((left, right) => left.url.localeCompare(right.url)),
      revisionNumbers: [3, 2, 1],
    }, "同组织不得继续形成独立验证；旧 community 必须按 practitioner 重新计算成熟度并追加当前 revision");

    const oldestEvidence = afterRevisions.at(-1)?.payload?.evidence?.[0];
    assert.deepEqual({
      independentGroup: oldestEvidence?.independentGroup,
      sourceLayer: oldestEvidence?.sourceLayer,
    }, {
      independentGroup: "same-org-split-a",
      sourceLayer: "official",
    }, "目录纠正只能追加新投影，不得覆写或删除旧 revision 的审计证据");

    const snapshot = await buildSnapshot(database);
    assert.equal(snapshot.concepts.some((item) => item.slug === "authoritative-reprojection"), false);
    assert.equal(snapshot.candidateConcepts.some((item) => item.slug === "authoritative-reprojection"), true);
  });
});

test("lifecycle archival removes formal inbound relations append-only and keeps atomic snapshot publication live", async () => {
  await withDatabase("agent-radar-archived-relation-target-", async (database) => {
    const sourceOfficial = source({
      id: "relation-source-official",
      name: "Relation Source Official",
      sourceClass: "官方工程",
      independentGroup: "relation-source-official-org",
      layer: "official",
      language: "en",
    });
    const sourcePractitioner = source({
      id: "relation-source-practitioner",
      name: "Relation Source Practitioner",
      sourceClass: "实践验证",
      independentGroup: "relation-source-practitioner-org",
      layer: "practitioner",
      language: "zh",
    });
    const targetOfficial = source({
      id: "relation-target-official",
      name: "Relation Target Official",
      sourceClass: "官方工程",
      independentGroup: "relation-target-official-org",
      layer: "official",
      language: "en",
    });
    const targetPractitioner = source({
      id: "relation-target-practitioner",
      name: "Relation Target Practitioner",
      sourceClass: "实践验证",
      independentGroup: "relation-target-practitioner-org",
      layer: "practitioner",
      language: "zh",
    });
    upsertSourceCatalog(database, [sourceOfficial, sourcePractitioner, targetOfficial, targetPractitioner]);

    const targetArticles = [
      articleInput(targetOfficial, "target-official-evidence", {
        conceptSlug: "b-formal-relation-target",
        publishedAt: "2026-08-03T00:10:00.000Z",
      }),
      articleInput(targetPractitioner, "target-practitioner-evidence", {
        conceptSlug: "b-formal-relation-target",
        publishedAt: "2026-08-03T00:20:00.000Z",
      }),
    ];
    const sourceArticles = [
      articleInput(sourceOfficial, "source-official-evidence", {
        conceptSlug: "a-formal-relation-source",
        publishedAt: "2026-08-03T00:30:00.000Z",
      }),
      articleInput(sourcePractitioner, "source-practitioner-evidence", {
        conceptSlug: "a-formal-relation-source",
        publishedAt: "2026-08-03T00:40:00.000Z",
      }),
    ];
    for (const article of [...targetArticles, ...sourceArticles]) {
      assert.equal(insertArticle(database, article), true, "fixture 必须通过生产文章入口形成权威 publish 证据");
    }

    const targetBackfill = await analyzeArticles(database, targetArticles, (article) => ({
      slug: "b-formal-relation-target",
      canonicalName: "即将退役的正式关系目标",
      aliases: ["关系目标恢复契约", "Relation Target Recovery Contract"],
      claimKey: article.url.includes("practitioner") ? "target-field-contract" : "target-official-contract",
      claimText: article.url.includes("practitioner")
        ? "独立实践材料验证目标概念的恢复约束。"
        : "官方材料定义目标概念的恢复约束。",
    }));
    assert.deepEqual({ processedCount: targetBackfill.processedCount, failures: targetBackfill.failures }, {
      processedCount: 2,
      failures: [],
    });

    const sourceBackfill = await analyzeArticles(database, sourceArticles, (article) => ({
      slug: "a-formal-relation-source",
      canonicalName: "保留中的正式关系来源",
      aliases: ["关系来源运行契约", "Relation Source Runtime Contract"],
      claimKey: article.url.includes("practitioner") ? "source-field-contract" : "source-official-contract",
      claimText: article.url.includes("practitioner")
        ? "独立实践材料验证来源概念依赖目标恢复边界。"
        : "官方材料定义来源概念的运行边界。",
      relations: article.url.includes("practitioner") ? [{
        type: "depends-on",
        targetSlug: "b-formal-relation-target",
        explanation: "来源概念依赖目标概念提供的恢复边界。",
        evidenceUrls: [article.url],
        confidence: 0.91,
      }] : [],
    }));
    assert.deepEqual({ processedCount: sourceBackfill.processedCount, failures: sourceBackfill.failures }, {
      processedCount: 2,
      failures: [],
    });

    const sourceBefore = getConceptKnowledge(database, "a-formal-relation-source")?.concept;
    const targetBefore = getConceptKnowledge(database, "b-formal-relation-target")?.concept;
    const sourceRevisionsBefore = listConceptKnowledgeRevisions(database, "a-formal-relation-source");
    assert.deepEqual({
      sourceStage: sourceBefore?.stage,
      targetStage: targetBefore?.stage,
      sourceRevisionCount: sourceRevisionsBefore.length,
      targetSlug: sourceBefore?.relations?.[0]?.targetSlug,
    }, {
      sourceStage: "emerging",
      targetStage: "emerging",
      sourceRevisionCount: 2,
      targetSlug: "b-formal-relation-target",
    }, "反例前提必须由真实 backfill 先形成两个 formal 端点和一条合法公开关系");

    database.prepare(`
      UPDATE articles
      SET publish_decision = 'reject'
      WHERE url IN (?, ?)
    `).run(targetArticles[0].url, targetArticles[1].url);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count
      FROM articles
      WHERE concept_slug = 'b-formal-relation-target'
        AND publish_decision IN ('publish', 'watch')
    `).get().count, 0, "目标失去全部 publish/watch 当前证据后必须进入生命周期退役路径");

    const firstMaintenance = maintainConceptKnowledgeLifecycles(database, {
      now: "2026-08-03T04:00:00.000Z",
    });
    const secondMaintenance = maintainConceptKnowledgeLifecycles(database, {
      now: "2026-08-03T04:10:00.000Z",
    });
    const sourceAfter = getConceptKnowledge(database, "a-formal-relation-source")?.concept;
    const targetAfter = getConceptKnowledge(database, "b-formal-relation-target")?.concept;
    const sourceRevisionsAfter = listConceptKnowledgeRevisions(database, "a-formal-relation-source");

    assert.deepEqual({
      firstFailures: firstMaintenance.failures,
      secondFailures: secondMaintenance.failures,
      targetStage: targetAfter?.stage,
      currentRelations: sourceAfter?.relations,
      sourceRevisionNumbers: sourceRevisionsAfter.map((revision) => revision.revision),
      previousRevisionTarget: sourceRevisionsAfter.find((revision) => (
        revision.payload?.relations?.some((relation) => relation.targetSlug === "b-formal-relation-target")
      ))?.payload?.relations?.[0]?.targetSlug,
    }, {
      firstFailures: [],
      secondFailures: [],
      targetStage: "archived",
      currentRelations: [],
      sourceRevisionNumbers: [3, 2, 1],
      previousRevisionTarget: "b-formal-relation-target",
    }, "目标归档必须安全追加来源修订删除悬空边，旧 revision 保持不可变，下一轮维护不得永久失败");

    const snapshot = await buildSnapshot(database);
    assert.equal(snapshot.concepts.some((concept) => concept.slug === "b-formal-relation-target"), false);
    assert.equal(snapshot.candidateConcepts.some((concept) => concept.slug === "b-formal-relation-target"), false);
    assert.equal(snapshot.relations.some((relation) => (
      relation.from === sourceAfter?.canonicalName
      || relation.to === targetBefore?.canonicalName
    )), false, "公开快照不得保留指向 archived 概念的关系");
    await writeSnapshotAtomic(snapshot);
    const publishedSnapshot = JSON.parse(await readFile(getSnapshotPath(), "utf8"));
    assert.equal(publishedSnapshot.relations.some((relation) => relation.to === targetBefore?.canonicalName), false);
  });
});
