import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  insertArticle,
  openDatabase,
  upsertSourceCatalog,
} from "../radar/database.mjs";
import * as conceptKnowledge from "../radar/concept-knowledge.mjs";
import { analyzeConceptKnowledgeArticle } from "../radar/concept-analyze.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const conceptBackfillScript = path.join(projectRoot, "scripts", "backfill-concepts.mjs");
const conceptFetchHook = fileURLToPath(new URL("./fixtures/concept-backfill-fetch-hook.mjs", import.meta.url));

const SOURCE = {
  id: "multi-concept-source",
  name: "Multi Concept Source",
  homepage: "https://multi-concept.example.com",
  class: "一手工程",
  family: "official",
  layer: "official",
  priority: "P0",
  cadence: "4h",
  focus: "一篇材料中的多个独立工程概念",
  independentGroup: "multi-concept-source",
  language: "en",
};

const CITABLE_FIELDS = [
  "definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta",
  "aliases", "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs",
  "failureModes", "securityRisks", "operationalConcerns", "applicability", "nonApplicability", "controversies",
];

function articleInput(database, suffix = "shared-source", {
  contentHash = `${suffix}:hash-v1`,
  conceptSlug = "checkpoint-boundary",
} = {}) {
  const url = `${SOURCE.homepage}/${suffix}`;
  const originalTitle = `Independent checkpoint and delegation contracts: ${suffix}`;
  assert.equal(insertArticle(database, {
    url,
    sourceId: SOURCE.id,
    sourceName: SOURCE.name,
    sourceClass: SOURCE.class,
    sourceLayer: SOURCE.layer,
    sourceLanguage: SOURCE.language,
    independentGroup: SOURCE.independentGroup,
    originalTitle,
    originalExcerpt: "The source independently defines checkpoint boundaries and delegation review contracts.",
    contentText: "A coding-agent runtime needs durable checkpoint boundaries. Delegated workers separately require review contracts and evidence-bound acceptance.",
    publishedAt: "2026-08-03T01:00:00.000Z",
    discoveredAt: "2026-08-03T01:05:00.000Z",
    contentHash,
    relevanceScore: 10,
    signalSlug: `multi-concept-${suffix}`,
    conceptSlug,
    title: "同一材料同时定义检查点边界与委派审查契约",
    summary: "材料分别给出持久检查点边界和委派验收机制，两者不能被压扁为一个概念。",
    implication: "知识回填需要从单篇材料保留多个独立概念及各自证据。",
    topic: "工程",
    stage: "Emerging",
    accent: "engineering",
    tags: ["checkpoint", "delegation"],
    analysisMode: "deepseek",
    publishDecision: "publish",
    editorialScore: 90,
    aiRelevanceScore: 94,
    noveltyScore: 86,
    evidenceScore: 90,
    eventKey: `multi-concept:${suffix}`,
    candidateConcept: "",
  }), true);
  return database.prepare("SELECT * FROM articles WHERE url = ?").get(url);
}

function conceptPayload(article, {
  slug,
  canonicalName,
  revisionLabel = "首次抽取",
  identityAction = "create-new",
} = {}) {
  const claimKey = `${slug}-primary-claim`;
  const concept = {
    slug,
    canonicalName,
    aliases: [`${canonicalName}别名`, slug],
    stage: "candidate",
    heat: 55,
    maturity: 35,
    definition: `${canonicalName}把一个可独立验证的工程责任边界固化为具有证据和版本身份的知识对象。`,
    nonDefinition: `${canonicalName}不是文章标签，也不是把同一材料中的所有工程主张合并成一个宽泛术语。`,
    problem: `${canonicalName}解决多个独立工程机制被单篇文章粒度压扁后无法分别演进、引用和验证的问题。`,
    whyNow: "智能编程系统开始在同一设计文档中同时描述运行时恢复、委派、审查和验收，因此抽取粒度必须回到独立机制。",
    origin: "当前命名来自这份工程材料中的独立机制描述，更早的命名起源仍需要后续来源继续核验。",
    evolution: [`${revisionLabel}把该机制从文章级分类中拆出，并保留独立修订身份。`],
    mechanism: `${canonicalName}先绑定本次原文证据，再以独立 slug、主张键和修订号提交，不借用相邻概念的结论。`,
    architecture: "文章是共享输入，概念知识、主张、引用和修订账本分别持久化，回填审计再记录本篇文章产生的全部输出。",
    designConstraints: ["每个概念必须独立通过结构、中文和证据链接校验后才能进入同一文章事务。"],
    implementationPatterns: ["分析器返回概念集合，写入层先完成全量校验，再在同一事务中逐个追加独立修订。"],
    antiPatterns: ["只保留模型返回的第一个概念，或在第二个概念失败时留下第一个概念的半提交。"],
    tradeoffs: ["多概念抽取增加校验和审计成本，但避免把不同工程机制错误合并。"],
    failureModes: ["数组中后续概念无效而前序概念已经提交，会使文章审计与知识账本不一致。"],
    securityRisks: ["任一概念引用模型编造链接时，整篇文章结果都必须拒绝并保留最后有效知识。"],
    operationalConcerns: ["版本升级、定向强制修复和普通重跑必须共享 CAS、租约和幂等边界。"],
    applicability: ["适用于一篇来源同时提出多个可分别命名、实现和验证的工程机制。"],
    nonApplicability: ["不适用于只是同义复述、共同出现或没有独立机制证据的术语集合。"],
    controversies: [],
    dailyDelta: `${revisionLabel}：从同一原文中抽取 ${canonicalName}，并建立独立证据和修订。`,
    lastMeaningfulChange: "2026-08-03T02:00:00.000Z",
  };
  const evidence = [{
    url: article.url,
    originalTitle: article.original_title,
    sourceName: article.source_name,
    sourceLayer: article.source_layer,
    independentGroup: article.independent_group,
    supports: [claimKey],
    stance: "support",
    publishedAt: article.published_at,
  }];
  return {
    identityDecision: {
      action: identityAction,
      canonicalSlug: slug,
      confidence: 0.92,
      reason: identityAction === "reuse-existing"
        ? `${canonicalName}与已有规范概念的名称、定义和机制一致，本次只追加新证据或修订。`
        : `${canonicalName}具有独立问题、机制和修订身份，当前合法 fixture 不复用其他概念。`,
      comparedSlugs: identityAction === "reuse-existing" ? [slug] : [],
    },
    concept,
    claims: [{
      key: claimKey,
      text: `${canonicalName}必须拥有独立主张、证据绑定和追加式修订身份。`,
      kind: "mechanism",
      confidence: 0.9,
    }],
    evidence,
    citations: CITABLE_FIELDS.filter((field) => (
      typeof concept[field] === "string" ? concept[field].trim() : concept[field].length > 0
    )).map((field) => ({ field, evidenceUrls: [article.url] })),
    relations: [],
  };
}

async function withDatabase(prefix, run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  process.env.RADAR_DATA_DIR = directory;
  const database = openDatabase();
  try {
    upsertSourceCatalog(database, [SOURCE]);
    return await run(database, directory);
  } finally {
    try {
      database.close();
    } catch (error) {
      if (error?.code !== "ERR_INVALID_STATE") throw error;
    }
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(directory, { recursive: true, force: true });
  }
}

function revisionCount(database, slug) {
  return Number(database.prepare("SELECT COUNT(*) AS count FROM concept_revisions WHERE concept_slug = ?").get(slug).count);
}

function auditFor(database, url) {
  assert.equal(
    typeof conceptKnowledge.getConceptBackfillAudit,
    "function",
    "生产模块必须提供抽象的回填审计读取接口，不能让运维方猜测单 slug 旧表结构",
  );
  return conceptKnowledge.getConceptBackfillAudit(database, url);
}

test("one article can atomically validate and append multiple independent concept revisions bound to the same original evidence", async () => {
  await withDatabase("agent-radar-multi-concept-success-", async (database) => {
    const article = articleInput(database);
    const checkpoint = conceptPayload(article, {
      slug: "checkpoint-boundary",
      canonicalName: "检查点责任边界",
    });
    const delegation = conceptPayload(article, {
      slug: "delegation-review-contract",
      canonicalName: "委派审查契约",
    });

    const result = await conceptKnowledge.runConceptKnowledgeBackfill({
      database,
      articleUrls: [article.url],
      analyzeArticle: async () => ({
        payloads: [checkpoint, delegation],
        provider: "contract-test",
        model: "multi-concept-model",
        reason: "同一文章多概念抽取",
      }),
      batchSize: 1,
      concurrency: 1,
      now: "2026-08-03T02:00:00.000Z",
      knowledgeSchemaVersion: "concept-knowledge-v1",
      analyzerVersion: "multi-concept-extractor-v1",
    });

    assert.deepEqual({
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      checkpointRevisions: revisionCount(database, "checkpoint-boundary"),
      delegationRevisions: revisionCount(database, "delegation-review-contract"),
    }, {
      processedCount: 1,
      failedCount: 0,
      checkpointRevisions: 1,
      delegationRevisions: 1,
    }, "文章是一次回填工作单元，但两个独立概念必须各自形成 revision");

    for (const slug of ["checkpoint-boundary", "delegation-review-contract"]) {
      const evidence = database.prepare(`
        SELECT evidence_url
        FROM concept_revision_evidence
        WHERE concept_slug = ? AND revision = 1
      `).all(slug).map((row) => row.evidence_url);
      assert.deepEqual(evidence, [article.url], `${slug} 必须独立绑定同一篇原文，而不是只在文章级记录一次链接`);
    }
  });
});

test("one invalid concept rejects the whole article result and preserves every existing last-good revision", async () => {
  await withDatabase("agent-radar-multi-concept-atomic-", async (database) => {
    const baselineArticle = articleInput(database, "baseline");
    const baseline = conceptPayload(baselineArticle, {
      slug: "checkpoint-boundary",
      canonicalName: "检查点责任边界",
    });
    const seeded = await conceptKnowledge.runConceptKnowledgeBackfill({
      database,
      articleUrls: [baselineArticle.url],
      analyzeArticle: async () => ({ payload: baseline, provider: "contract-test", model: "seed-v1" }),
      batchSize: 1,
      now: "2026-08-03T02:00:00.000Z",
      knowledgeSchemaVersion: "concept-knowledge-v1",
      analyzerVersion: "multi-concept-extractor-v1",
    });
    assert.equal(seeded.processedCount, 1, "fixture 必须先通过生产回填链建立 last-good，而不是直接写概念表");

    const article = articleInput(database, "invalid-second-output");
    const validUpdate = conceptPayload(article, {
      slug: "checkpoint-boundary",
      canonicalName: "检查点责任边界",
      revisionLabel: "本应被整篇回滚的更新",
      identityAction: "reuse-existing",
    });
    const invalid = conceptPayload(article, {
      slug: "delegation-review-contract",
      canonicalName: "委派审查契约",
    });
    invalid.concept.definition = "";

    const result = await conceptKnowledge.runConceptKnowledgeBackfill({
      database,
      articleUrls: [article.url],
      analyzeArticle: async () => ({
        payloads: [validUpdate, invalid],
        provider: "contract-test",
        model: "multi-concept-model",
      }),
      batchSize: 1,
      now: "2026-08-03T03:00:00.000Z",
      knowledgeSchemaVersion: "concept-knowledge-v1",
      analyzerVersion: "multi-concept-extractor-v1",
    });

    assert.deepEqual({
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      checkpointRevisions: revisionCount(database, "checkpoint-boundary"),
      delegationRevisions: revisionCount(database, "delegation-review-contract"),
      backfillStatus: database.prepare("SELECT status FROM concept_backfill WHERE article_url = ?").get(article.url)?.status,
    }, {
      processedCount: 0,
      failedCount: 1,
      checkpointRevisions: 1,
      delegationRevisions: 0,
      backfillStatus: "failed",
    }, "采用全文章原子契约：任何一个概念无效时不得留下前序概念半提交，也不得破坏既有 last-good");
  });
});

test("backfill audit records every concept slug and revision once, while an unchanged rerun adds neither analysis nor duplicate output", async () => {
  await withDatabase("agent-radar-multi-concept-audit-", async (database) => {
    assert.equal(
      typeof conceptKnowledge.getConceptBackfillAudit,
      "function",
      "多输出回填必须提供稳定审计读取接口，返回该文章的版本边界、尝试次数与全部 slug/revision",
    );
    const article = articleInput(database, "audited-outputs");
    const outputs = [
      conceptPayload(article, { slug: "checkpoint-boundary", canonicalName: "检查点责任边界" }),
      conceptPayload(article, { slug: "delegation-review-contract", canonicalName: "委派审查契约" }),
    ];
    let calls = 0;
    const analyzeArticle = async () => {
      calls += 1;
      return { payloads: outputs, provider: "contract-test", model: "multi-concept-model" };
    };
    const options = {
      database,
      articleUrls: [article.url],
      analyzeArticle,
      batchSize: 1,
      now: "2026-08-03T04:00:00.000Z",
      knowledgeSchemaVersion: "concept-knowledge-v1",
      analyzerVersion: "multi-concept-extractor-v1",
    };

    const first = await conceptKnowledge.runConceptKnowledgeBackfill(options);
    assert.equal(first.processedCount, 1);
    const firstAudit = auditFor(database, article.url);
    assert.deepEqual(firstAudit.outputs, [
      { slug: "checkpoint-boundary", revision: 1 },
      { slug: "delegation-review-contract", revision: 1 },
    ], "审计必须记录同一文章产生的完整 slug/revision 集合，不能只保留最后一个 concept_slug");
    assert.equal(firstAudit.attemptCount, 1);
    assert.equal(firstAudit.knowledgeSchemaVersion, "concept-knowledge-v1");
    assert.equal(firstAudit.analyzerVersion, "multi-concept-extractor-v1");

    const rerun = await conceptKnowledge.runConceptKnowledgeBackfill({
      ...options,
      now: "2026-08-03T05:00:00.000Z",
    });
    const rerunAudit = auditFor(database, article.url);
    assert.deepEqual({
      processedCount: rerun.processedCount,
      skippedCount: rerun.skippedCount,
      calls,
      outputs: rerunAudit.outputs,
      attemptCount: rerunAudit.attemptCount,
      revisionCounts: outputs.map((item) => revisionCount(database, item.concept.slug)),
    }, {
      processedCount: 0,
      skippedCount: 1,
      calls: 1,
      outputs: firstAudit.outputs,
      attemptCount: 1,
      revisionCounts: [1, 1],
    }, "同版本、同内容的正常重跑必须跳过，不能重复分析、重复审计输出或追加 revision");
  });
});

test("content hash, knowledge schema version and analyzer version jointly define normal backfill idempotency", async () => {
  await withDatabase("agent-radar-concept-version-boundary-", async (database) => {
    const article = articleInput(database, "versioned-boundary");
    let calls = 0;
    const analyzeArticle = async () => {
      calls += 1;
      return {
        payload: conceptPayload(article, {
          slug: "versioned-concept-extraction",
          canonicalName: "版本化概念抽取",
          revisionLabel: `第 ${calls} 次真实分析`,
          identityAction: calls === 1 ? "create-new" : "reuse-existing",
        }),
        provider: "contract-test",
        model: "version-boundary-model",
      };
    };
    const execute = (knowledgeSchemaVersion, analyzerVersion, now) => conceptKnowledge.runConceptKnowledgeBackfill({
      database,
      articleUrls: [article.url],
      analyzeArticle,
      batchSize: 1,
      now,
      knowledgeSchemaVersion,
      analyzerVersion,
    });

    assert.equal((await execute("concept-knowledge-v1", "extractor-v1", "2026-08-03T06:00:00.000Z")).processedCount, 1);
    const sameVersion = await execute("concept-knowledge-v1", "extractor-v1", "2026-08-03T06:10:00.000Z");
    assert.equal(sameVersion.processedCount, 0);
    assert.equal(sameVersion.skippedCount, 1);
    assert.equal(calls, 1, "完全相同的幂等边界必须跳过 analyzer");

    assert.equal((await execute("concept-knowledge-v2", "extractor-v1", "2026-08-03T06:20:00.000Z")).processedCount, 1);
    assert.equal(calls, 2, "knowledge schema 升级必须重新分析同 URL、同 content_hash");
    assert.equal((await execute("concept-knowledge-v2", "extractor-v2", "2026-08-03T06:30:00.000Z")).processedCount, 1);
    assert.equal(calls, 3, "analyzer 版本升级必须重新分析同 URL、同 content_hash");

    const audit = auditFor(database, article.url);
    assert.equal(audit.knowledgeSchemaVersion, "concept-knowledge-v2");
    assert.equal(audit.analyzerVersion, "extractor-v2");
    assert.equal(audit.attemptCount, 3, "只有真实发生的三次分析进入审计；同版本 skip 不得伪造一次尝试");
    assert.deepEqual(audit.outputs, [{ slug: "versioned-concept-extraction", revision: 3 }]);
  });
});

test("P2 contract: authoritative content roles participate in backfill idempotency and remain auditable", async () => {
  await withDatabase("agent-radar-concept-input-contract-", async (database) => {
    const initialRoles = ["engineering-postmortem"];
    const changedRoles = ["podcast-transcript", "interview"];
    const catalogSource = (contentRoles) => ({ ...SOURCE, contentRoles });
    upsertSourceCatalog(database, [catalogSource(initialRoles)]);
    const article = articleInput(database, "authoritative-content-roles");
    // Historical articles are reprojected from the authoritative catalog; keep
    // the article body/hash fixed so this test isolates the input contract.
    upsertSourceCatalog(database, [catalogSource(initialRoles)]);
    const baselineHash = database.prepare("SELECT content_hash FROM articles WHERE url = ?").get(article.url).content_hash;

    let calls = 0;
    const observedRoles = [];
    const analyzeArticle = async (row) => {
      calls += 1;
      observedRoles.push(JSON.parse(row.content_roles_json));
      return {
        payload: conceptPayload(article, {
          slug: "content-role-input-contract",
          canonicalName: "内容角色输入契约",
          revisionLabel: `内容角色驱动的第 ${calls} 次分析`,
          identityAction: calls === 1 ? "create-new" : "reuse-existing",
        }),
        provider: "contract-test",
        model: "content-role-boundary-model",
      };
    };
    const execute = (now) => conceptKnowledge.runConceptKnowledgeBackfill({
      database,
      articleUrls: [article.url],
      analyzeArticle,
      batchSize: 1,
      concurrency: 1,
      now,
      knowledgeSchemaVersion: "concept-knowledge-v1",
      analyzerVersion: "content-role-extractor-v1",
    });

    const first = await execute("2026-08-03T06:40:00.000Z");
    assert.equal(first.processedCount, 1);
    assert.deepEqual(observedRoles, [initialRoles], "analyzer 必须收到文章当前的权威 content roles");
    const firstAudit = auditFor(database, article.url);

    const unchanged = await execute("2026-08-03T06:50:00.000Z");
    assert.deepEqual({
      processedCount: unchanged.processedCount,
      skippedCount: unchanged.skippedCount,
      calls,
      attemptCount: auditFor(database, article.url).attemptCount,
    }, {
      processedCount: 0,
      skippedCount: 1,
      calls: 1,
      attemptCount: 1,
    }, "content roles 不变时必须保持幂等，不能伪造 analysis attempt");

    upsertSourceCatalog(database, [catalogSource(changedRoles)]);
    const reprojected = database.prepare("SELECT content_hash, content_roles_json FROM articles WHERE url = ?").get(article.url);
    assert.equal(reprojected.content_hash, baselineHash, "catalog 角色变更不能靠篡改正文 content_hash 绕过输入边界");
    assert.deepEqual(JSON.parse(reprojected.content_roles_json), changedRoles, "历史文章必须同步权威 source content roles");

    const changed = await execute("2026-08-03T07:00:00.000Z");
    assert.deepEqual({
      processedCount: changed.processedCount,
      skippedCount: changed.skippedCount,
      calls,
      observedRoles,
    }, {
      processedCount: 1,
      skippedCount: 0,
      calls: 2,
      observedRoles: [initialRoles, changedRoles],
    }, "content_hash/schema/analyzer 都未变时，权威 content roles 变化仍必须使 completed 文章重新进入 backfill");

    const changedAudit = auditFor(database, article.url);
    assert.equal(typeof firstAudit.inputContractHash, "string", "审计必须持久化 analyzer 完整输入契约的稳定指纹");
    assert.ok(firstAudit.inputContractHash.length >= 16, "输入契约指纹不能是空占位符");
    assert.notEqual(changedAudit.inputContractHash, firstAudit.inputContractHash, "审计边界必须明确证明本次不是正文或版本变化，而是输入契约变化");
    assert.equal(changedAudit.attemptCount, 2, "角色变化产生一次真实、可审计的新 attempt");
    const attempts = database.prepare(`
      SELECT input_contract_hash
      FROM concept_backfill_attempts
      WHERE article_url = ?
      ORDER BY id
    `).all(article.url);
    assert.deepEqual(
      attempts.map((item) => item.input_contract_hash),
      [firstAudit.inputContractHash, changedAudit.inputContractHash],
      "attempt ledger 必须保留变更前后两个输入契约，而不是只覆盖 current state",
    );
  });
});

test("concepts:backfill --url forces one targeted reanalysis, while a normal CLI rerun keeps current-version skip semantics", async () => {
  await withDatabase("agent-radar-concept-force-cli-", async (database, directory) => {
    const article = articleInput(database, "force-cli");
    const baseline = conceptPayload(article, {
      slug: "targeted-repair-contract",
      canonicalName: "定向修复契约",
      revisionLabel: "初次回填",
    });
    const seeded = await conceptKnowledge.runConceptKnowledgeBackfill({
      database,
      articleUrls: [article.url],
      analyzeArticle: async () => ({ payload: baseline, provider: "contract-test", model: "seed-model" }),
      batchSize: 1,
      now: "2026-08-03T07:00:00.000Z",
    });
    assert.equal(seeded.processedCount, 1, "fixture 必须通过生产回填链形成 completed current hash");

    const repaired = conceptPayload(article, {
      slug: "targeted-repair-contract",
      canonicalName: "定向修复契约",
      revisionLabel: "--url 强制定向修复",
      identityAction: "reuse-existing",
    });
    const runCli = (args, plan) => spawnSync(process.execPath, [
      "--import", conceptFetchHook, conceptBackfillScript, ...args,
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        RADAR_DATA_DIR: directory,
        RADAR_RUN_DIR: path.join(directory, "run"),
        RADAR_AI_PROVIDER: "deepseek",
        DEEPSEEK_API_KEY: "concept-force-cli-test-key",
        RADAR_DEEPSEEK_CONCEPT_MODEL: "deepseek-contract-test",
        RADAR_CONCEPT_ANALYSIS_ATTEMPTS: "1",
        RADAR_TEST_CONCEPT_BACKFILL_PLAN: JSON.stringify(plan),
      },
      encoding: "utf8",
      timeout: 20_000,
    });

    database.close();
    const forced = runCli(
      ["--url", article.url, "--batch-size", "1", "--max-batches", "2"],
      [repaired, repaired],
    );
    assert.equal(forced.status, 0, `--url 定向修复必须成功执行 analyzer：\n${forced.stderr}\n${forced.stdout}`);
    const inspected = openDatabase();
    try {
      assert.equal(revisionCount(inspected, "targeted-repair-contract"), 2, "已 completed 的 current hash 仍必须被 --url 强制重新分析并追加有效修订");
      const afterForce = auditFor(inspected, article.url);
      assert.equal(afterForce.attemptCount, 2, "强制修复是可审计的新尝试");
      assert.deepEqual(afterForce.outputs, [{ slug: "targeted-repair-contract", revision: 2 }]);
    } finally {
      inspected.close();
    }

    const normal = runCli(["--batch-size", "1", "--max-batches", "2"], []);
    assert.equal(normal.status, 0, `不带 --url 的正常重跑必须安全跳过且不访问 provider：\n${normal.stderr}\n${normal.stdout}`);
    const afterNormal = openDatabase();
    try {
      assert.equal(revisionCount(afterNormal, "targeted-repair-contract"), 2);
      assert.equal(auditFor(afterNormal, article.url).attemptCount, 2, "正常重跑不能把 skip 伪装成第三次审计尝试");
    } finally {
      afterNormal.close();
    }
  });
});

test("concepts:backfill keeps every explicit --url forced across multiple batches", async () => {
  await withDatabase("agent-radar-concept-force-multi-cli-", async (database, directory) => {
    const firstArticle = articleInput(database, "force-batch-a", { conceptSlug: "force-batch-a-contract" });
    const secondArticle = articleInput(database, "force-batch-b", { conceptSlug: "force-batch-b-contract" });
    const fixtures = [
      [firstArticle, "force-batch-a-contract", "跨批次强制契约 A"],
      [secondArticle, "force-batch-b-contract", "跨批次强制契约 B"],
    ];
    for (const [article, slug, canonicalName] of fixtures) {
      const seeded = await conceptKnowledge.runConceptKnowledgeBackfill({
        database,
        articleUrls: [article.url],
        analyzeArticle: async () => ({
          payload: conceptPayload(article, { slug, canonicalName, revisionLabel: "初次回填" }),
          provider: "contract-test",
          model: "seed-model",
        }),
        batchSize: 1,
        now: "2026-08-03T07:00:00.000Z",
      });
      assert.equal(seeded.processedCount, 1);
    }

    const repairPlan = fixtures.map(([article, slug, canonicalName]) => conceptPayload(article, {
      slug,
      canonicalName,
      revisionLabel: "跨批次 --url 强制修复",
      identityAction: "reuse-existing",
    }));
    database.close();
    const forced = spawnSync(process.execPath, [
      "--import", conceptFetchHook,
      conceptBackfillScript,
      "--url", firstArticle.url,
      "--url", secondArticle.url,
      "--batch-size", "1",
      "--max-batches", "3",
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        RADAR_DATA_DIR: directory,
        RADAR_RUN_DIR: path.join(directory, "run"),
        RADAR_AI_PROVIDER: "deepseek",
        DEEPSEEK_API_KEY: "concept-force-multi-cli-key",
        RADAR_DEEPSEEK_CONCEPT_MODEL: "deepseek-force-multi-contract",
        RADAR_CONCEPT_ANALYSIS_ATTEMPTS: "1",
        RADAR_TEST_CONCEPT_BACKFILL_PLAN: JSON.stringify(repairPlan),
      },
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(forced.status, 0, `跨批次显式修复必须全部成功：\n${forced.stderr}\n${forced.stdout}`);

    const inspected = openDatabase();
    try {
      for (const [, slug] of fixtures) {
        assert.equal(revisionCount(inspected, slug), 2, `${slug} 不能因落在第二批而恢复 completed skip`);
      }
      assert.equal(auditFor(inspected, firstArticle.url).attemptCount, 2);
      assert.equal(auditFor(inspected, secondArticle.url).attemptCount, 2);
    } finally {
      inspected.close();
    }
  });
});

test("a forced targeted repair still obeys article content CAS and leaves an auditable retry path", async () => {
  await withDatabase("agent-radar-concept-force-cas-", async (database) => {
    const article = articleInput(database, "force-cas", { contentHash: "force-cas-v1" });
    const baseline = conceptPayload(article, {
      slug: "forced-cas-contract",
      canonicalName: "强制修复并发契约",
      revisionLabel: "初始有效知识",
    });
    const baseOptions = {
      database,
      articleUrls: [article.url],
      batchSize: 1,
      knowledgeSchemaVersion: "concept-knowledge-v1",
      analyzerVersion: "multi-concept-extractor-v1",
    };
    const seeded = await conceptKnowledge.runConceptKnowledgeBackfill({
      ...baseOptions,
      analyzeArticle: async () => ({ payload: baseline, provider: "contract-test", model: "force-cas-model" }),
      now: "2026-08-03T07:10:00.000Z",
    });
    assert.equal(seeded.processedCount, 1);

    let forcedCalls = 0;
    const stale = await conceptKnowledge.runConceptKnowledgeBackfill({
      ...baseOptions,
      force: true,
      analyzeArticle: async (currentArticle) => {
        forcedCalls += 1;
        database.prepare("UPDATE articles SET content_hash = ? WHERE url = ?").run("force-cas-v2", currentArticle.url);
        return {
          payload: conceptPayload(currentArticle, {
            slug: "forced-cas-contract",
            canonicalName: "强制修复并发契约",
            revisionLabel: "分析期间已过期的修复结果",
            identityAction: "reuse-existing",
          }),
          provider: "contract-test",
          model: "force-cas-model",
        };
      },
      now: "2026-08-03T07:20:00.000Z",
    });
    assert.deepEqual({
      forcedCalls,
      processedCount: stale.processedCount,
      conflictCount: stale.conflictCount,
      revisionCount: revisionCount(database, "forced-cas-contract"),
      backfillStatus: database.prepare("SELECT status FROM concept_backfill WHERE article_url = ?").get(article.url)?.status,
    }, {
      forcedCalls: 1,
      processedCount: 0,
      conflictCount: 1,
      revisionCount: 1,
      backfillStatus: "conflict",
    }, "--url/force 只能绕过 completed skip，绝不能绕过分析后的 article content_hash CAS");

    const currentArticle = database.prepare("SELECT * FROM articles WHERE url = ?").get(article.url);
    const retry = await conceptKnowledge.runConceptKnowledgeBackfill({
      ...baseOptions,
      force: true,
      analyzeArticle: async () => ({
        payload: conceptPayload(currentArticle, {
          slug: "forced-cas-contract",
          canonicalName: "强制修复并发契约",
          revisionLabel: "CAS 冲突后的安全重试",
          identityAction: "reuse-existing",
        }),
        provider: "contract-test",
        model: "force-cas-model",
      }),
      now: "2026-08-03T07:30:00.000Z",
    });
    assert.equal(retry.processedCount, 1, "CAS 冲突释放租约后，定向修复必须能够针对新 hash 安全重试");
    const audit = auditFor(database, article.url);
    assert.deepEqual({
      status: audit.status,
      attemptCount: audit.attemptCount,
      contentHash: audit.contentHash,
      outputs: audit.outputs,
    }, {
      status: "completed",
      attemptCount: 3,
      contentHash: "force-cas-v2",
      outputs: [{ slug: "forced-cas-contract", revision: 2 }],
    }, "审计必须区分初次完成、CAS 冲突和修复成功三次真实尝试，并只投影最后一次有效输出");
  });
});

test("provider adapter accepts and deterministically validates multiple concept objects from one article", async () => {
  await withDatabase("agent-radar-concept-multi-provider-", async (database) => {
    const article = articleInput(database, "provider-multiple");
    const payloads = [
      conceptPayload(article, { slug: "checkpoint-boundary", canonicalName: "检查点责任边界" }),
      conceptPayload(article, { slug: "delegation-review-contract", canonicalName: "委派审查契约" }),
    ];
    const analyzed = await analyzeConceptKnowledgeArticle(article, {
      provider: "deepseek",
      knownConcepts: [],
      maxAttempts: 1,
      now: "2026-08-03T08:00:00.000Z",
      environment: {
        DEEPSEEK_API_KEY: "multi-provider-test-key",
        RADAR_DEEPSEEK_CONCEPT_MODEL: "deepseek-contract-test",
        RADAR_DEEPSEEK_CONCEPT_MAX_TOKENS: "6000",
        RADAR_DEEPSEEK_CONCEPT_TIMEOUT_MS: "10000",
      },
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{
          finish_reason: "stop",
          message: { content: JSON.stringify({ concepts: payloads }) },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    });

    assert.equal(Array.isArray(analyzed), true, "多概念 provider 输出必须返回逐项通过确定性校验的 payload 数组");
    assert.deepEqual(analyzed.map((item) => item.concept.slug), [
      "checkpoint-boundary",
      "delegation-review-contract",
    ]);
    for (const item of analyzed) {
      assert.equal(item.evidence[0].url, article.url);
      assert.equal(item.evidence[0].originalTitle, article.original_title);
    }
  });
});
