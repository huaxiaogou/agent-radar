#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createConceptKnowledgeAnalyzer,
  resolveConceptAnalysisModel,
} from "../radar/concept-analyze.mjs";
import {
  getConceptKnowledgeStatus,
  listConceptKnowledge,
  maintainConceptKnowledgeLifecycles,
  runConceptKnowledgeBackfill,
} from "../radar/concept-knowledge.mjs";
import { openDatabase } from "../radar/database.mjs";
import { resolveAnalysisProvider } from "../radar/provider.mjs";
import { buildSnapshot, writeSnapshotAtomic } from "../radar/snapshot.mjs";
import { acquireTaskLock, projectRoot, releaseTaskLock } from "./task-lock.mjs";

try {
  process.loadEnvFile(path.join(projectRoot, ".env.production"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function positiveInteger(value, label, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} 必须是正整数`);
  return parsed;
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function optionValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function normalizeKnowledge(value) {
  return value?.concept || value;
}

function uniqueConcepts(concepts) {
  const bySlug = new Map();
  for (const value of concepts) {
    const concept = normalizeKnowledge(value);
    if (!concept?.slug) continue;
    bySlug.set(concept.slug, concept);
  }
  return [...bySlug.values()];
}

const batchSize = positiveInteger(
  optionValue("--batch-size") || process.env.RADAR_CONCEPT_BACKFILL_BATCH_SIZE,
  "RADAR_CONCEPT_BACKFILL_BATCH_SIZE",
  20,
);
const concurrency = positiveInteger(
  optionValue("--concurrency") || process.env.RADAR_CONCEPT_BACKFILL_CONCURRENCY,
  "RADAR_CONCEPT_BACKFILL_CONCURRENCY",
  4,
);
const maxBatches = positiveInteger(optionValue("--max-batches"), "--max-batches", 10000);
const articleUrls = optionValues("--url");
let remainingArticleUrls = [...new Set(articleUrls)];
const provider = resolveAnalysisProvider();
if (provider === "rules") throw new Error("concepts:backfill 需要配置 DeepSeek 或 OpenAI，不能使用 rules");
const model = resolveConceptAnalysisModel(provider);

let lockHandle;
let database;
try {
  lockHandle = await acquireTaskLock();
  database = openDatabase();
  const bootstrapConcepts = JSON.parse(await readFile(path.join(projectRoot, "config/concepts.json"), "utf8"));
  const knownConcepts = () => uniqueConcepts([
    ...bootstrapConcepts,
    ...listConceptKnowledge(database),
  ]);
  const analyzeArticle = createConceptKnowledgeAnalyzer({
    database,
    provider,
    knownConcepts,
    reason: "历史概念证据回溯",
  });

  const totals = {
    processedCount: 0,
    skippedCount: 0,
    conflictCount: 0,
    failedCount: 0,
    failures: [],
  };
  let hasMore = true;
  let noProgress = false;
  let batches = 0;
  while (hasMore && batches < maxBatches) {
    const batchNumber = batches + 1;
    const result = await runConceptKnowledgeBackfill({
      database,
      analyzeArticle,
      batchSize,
      concurrency,
      now: new Date().toISOString(),
      ...(articleUrls.length ? { articleUrls: remainingArticleUrls } : {}),
      onProgress: (event) => {
        const position = `${event.articleIndex}/${event.batchSize}`;
        if (event.phase === "started") {
          console.error(`[concepts:backfill] batch=${batchNumber} article=${position} started ${event.articleUrl}`);
          return;
        }
        const category = event.errorCategory ? ` category=${event.errorCategory}` : "";
        console.error(`[concepts:backfill] batch=${batchNumber} article=${position} ${event.status} elapsedMs=${event.elapsedMs}${category} ${event.articleUrl}`);
      },
      // --url is an explicit repair command: every requested URL remains
      // forced until it has been claimed in a batch. Lease ownership and the
      // post-analysis article content-hash CAS remain mandatory.
      force: articleUrls.length > 0,
    });
    batches += 1;
    totals.processedCount += Number(result.processedCount || 0);
    totals.skippedCount = Math.max(totals.skippedCount, Number(result.skippedCount || 0));
    totals.conflictCount += Number(result.conflictCount || 0);
    totals.failedCount += Number(result.failedCount || 0);
    totals.failures.push(...(result.failures || []));
    if (articleUrls.length) {
      const processedUrls = new Set(result.processedUrls || []);
      remainingArticleUrls = remainingArticleUrls.filter((url) => !processedUrls.has(url));
      hasMore = remainingArticleUrls.length > 0;
    } else {
      hasMore = result.hasMore === true;
    }
    console.error(`[concepts:backfill] batch=${batches} processed=${result.processedCount || 0} failed=${result.failedCount || 0} conflicts=${result.conflictCount || 0} hasMore=${hasMore}`);

    const progressCount = Number(result.processedCount || 0)
      + Number(result.failedCount || 0)
      + Number(result.conflictCount || 0);
    if (hasMore && progressCount === 0) {
      noProgress = true;
      console.error("[concepts:backfill] no-progress：仍有待处理文章，但本批次没有可领取任务；可能由其他 worker 的活跃租约持有，已停止本次回填以避免忙循环。");
      break;
    }

    // 同一坏输入如果没有任何进展会持续占据下一批；显式失败并留给修复后续跑。
    if (Number(result.failedCount || 0) > 0 && Number(result.processedCount || 0) === 0) break;
  }

  if (hasMore && batches >= maxBatches && !noProgress) {
    totals.failedCount += 1;
    totals.failures.push({ error: `达到 --max-batches=${maxBatches}，仍有待处理文章` });
  }

  const knowledgeStatus = getConceptKnowledgeStatus(database);
  if (totals.failedCount > 0 || hasMore) {
    console.error(JSON.stringify({
      service: "agent-radar",
      task: "concept-knowledge-backfill",
      status: "partial",
      provider,
      model,
      batchSize,
      concurrency,
      batches,
      hasMore,
      noProgress,
      stopReason: noProgress ? "active-lease-or-no-progress" : null,
      ...totals,
      knowledgeStatus,
    }, null, 2));
    process.exitCode = 1;
  } else {
    const lifecycleMaintenance = maintainConceptKnowledgeLifecycles(database, {
      now: new Date().toISOString(),
    });
    if (lifecycleMaintenance.failedCount > 0) {
      const preview = lifecycleMaintenance.failures.slice(0, 3)
        .map((failure) => `${failure.slug}:${failure.error}`).join("、");
      throw new Error(`概念生命周期维护失败，未发布新快照：${preview}`);
    }
    const snapshot = await buildSnapshot(database);
    await writeSnapshotAtomic(snapshot);
    console.log(JSON.stringify({
      service: "agent-radar",
      task: "concept-knowledge-backfill",
      status: "ok",
      provider,
      model,
      batchSize,
      concurrency,
      batches,
      hasMore: false,
      ...totals,
      knowledgeStatus,
      snapshot: snapshot.status,
    }, null, 2));
  }
} finally {
  database?.close();
  if (lockHandle) await releaseTaskLock(lockHandle);
}
