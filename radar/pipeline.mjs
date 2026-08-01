import { contentHash, enrichItem, discoverSourceItems } from "./fetch.mjs";
import { analyzeItem, chooseSignalSlug, resolveAnalysisProvider, scoreRelevance } from "./analyze.mjs";
import {
  articleExists,
  beginRun,
  finishRun,
  getRecentClusterCandidates,
  insertArticle,
  openDatabase,
  updateSourceHealth,
  upsertSourceCatalog,
} from "./database.mjs";
import { loadSourceCatalog } from "./catalog.mjs";
import { buildSnapshot, writeSnapshotAtomic } from "./snapshot.mjs";

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function validPublishedAt(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || time > Date.now() + 24 * 3_600_000) return null;
  return new Date(time).toISOString();
}

function withinAgeLimit(value) {
  if (!value) return true;
  const maxDays = Number(process.env.RADAR_MAX_ITEM_AGE_DAYS || 120);
  return Date.now() - new Date(value).getTime() <= maxDays * 86_400_000;
}

function selectFairly(candidates, limit) {
  const queues = new Map();
  for (const candidate of candidates) {
    const queue = queues.get(candidate.sourceId) || [];
    queue.push(candidate);
    queues.set(candidate.sourceId, queue);
  }
  const selected = [];
  while (selected.length < limit) {
    let progressed = false;
    for (const queue of queues.values()) {
      const candidate = queue.shift();
      if (!candidate) continue;
      selected.push(candidate);
      progressed = true;
      if (selected.length >= limit) break;
    }
    if (!progressed) break;
  }
  return selected;
}

export async function runIngestion({ trigger = "manual", logger = console } = {}) {
  const sources = await loadSourceCatalog();
  const analysisProvider = resolveAnalysisProvider();
  const database = openDatabase();
  const startedAt = new Date().toISOString();
  const preferredAnalysisMode = analysisProvider;
  upsertSourceCatalog(database, sources);
  const runId = beginRun(database, trigger, startedAt, preferredAnalysisMode);
  let runFinished = false;
  let persistedResult = null;

  try {
    const discoveryResults = await mapLimit(
      sources,
      Number(process.env.RADAR_SOURCE_CONCURRENCY || 4),
      async (source) => {
        const attemptedAt = new Date().toISOString();
        try {
          const items = await discoverSourceItems(source);
          logger.info?.(`[source:${source.id}] discovered=${items.length}`);
          return { source, attemptedAt, items, error: null };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error?.(`[source:${source.id}] ${message}`);
          return { source, attemptedAt, items: [], error: message };
        }
      },
    );

    const seen = new Set();
    const candidates = [];
    let skippedCount = 0;
    let fetchedCount = 0;
    for (const result of discoveryResults) {
      fetchedCount += result.items.length;
      for (const rawItem of result.items) {
        const publishedAt = validPublishedAt(rawItem.publishedAt);
        const relevanceScore = scoreRelevance(rawItem, result.source);
        if (
          !rawItem.url || seen.has(rawItem.url) || articleExists(database, rawItem.url) ||
          !withinAgeLimit(publishedAt) || relevanceScore < Number(process.env.RADAR_RELEVANCE_THRESHOLD || 5)
        ) {
          skippedCount += 1;
          continue;
        }
        seen.add(rawItem.url);
        candidates.push({
          ...rawItem,
          publishedAt,
          relevanceScore,
          sourceId: result.source.id,
          sourceName: result.source.name,
          sourceClass: result.source.class,
          independentGroup: result.source.independentGroup,
        });
      }
    }

    candidates.sort((left, right) => right.relevanceScore - left.relevanceScore || new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0));
    const selected = selectFairly(candidates, Number(process.env.RADAR_MAX_NEW_ITEMS || 48));
    skippedCount += Math.max(0, candidates.length - selected.length);
    const enriched = await mapLimit(selected, Number(process.env.RADAR_FETCH_CONCURRENCY || 4), enrichItem);
    const maxAIItems = Number(process.env.RADAR_MAX_AI_ITEMS || 16);
    let analysisFallbackCount = 0;
    let analysisRepairCount = 0;
    const analyzed = await mapLimit(
      enriched,
      Number(process.env.RADAR_ANALYSIS_CONCURRENCY || 2),
      async (item, index) => {
        const result = await analyzeItem(item, index < maxAIItems ? analysisProvider : "rules");
        if (result.analysisError) {
          analysisFallbackCount += 1;
          logger.error?.(`[analysis:${item.url}] ${result.analysisError}`);
        }
        if (result.analysisWarning) {
          analysisRepairCount += 1;
          logger.warn?.(`[analysis-repair:${item.url}] ${result.analysisWarning}`);
        }
        return { item, analysis: result };
      },
    );

    const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
    const clusterCandidates = getRecentClusterCandidates(database, since).map((row) => ({ ...row }));
    const acceptedBySource = new Map();
    const acceptedAnalysisModes = new Set();
    let acceptedCount = 0;
    for (const { item, analysis } of analyzed) {
      const signalSlug = chooseSignalSlug(item, analysis, clusterCandidates);
      const discoveredAt = new Date().toISOString();
      const article = {
        ...item,
        originalTitle: item.title,
        originalExcerpt: item.excerpt || "",
        contentText: item.contentText || item.excerpt || "",
        discoveredAt,
        contentHash: contentHash(item.title, item.excerpt || "", item.contentText || ""),
        signalSlug,
        conceptSlug: analysis.conceptSlug,
        title: analysis.title,
        summary: analysis.summary,
        implication: analysis.implication,
        topic: analysis.topic,
        stage: analysis.stage,
        accent: analysis.accent,
        tags: analysis.tags,
        analysisMode: analysis.analysisMode,
      };
      if (!insertArticle(database, article)) {
        skippedCount += 1;
        continue;
      }
      acceptedCount += 1;
      acceptedAnalysisModes.add(analysis.analysisMode);
      acceptedBySource.set(item.sourceId, (acceptedBySource.get(item.sourceId) || 0) + 1);
      clusterCandidates.push({
        signal_slug: signalSlug,
        concept_slug: analysis.conceptSlug,
        original_title: item.title,
        tags_json: JSON.stringify(analysis.tags),
        independent_group: item.independentGroup,
      });
    }

    const failedSources = discoveryResults.filter((result) => result.error).length;
    for (const result of discoveryResults) {
      updateSourceHealth(database, result.source, {
        attemptedAt: result.attemptedAt,
        status: result.error ? "error" : "success",
        error: result.error,
        itemCount: acceptedBySource.get(result.source.id) || 0,
      });
    }

    let status = failedSources === sources.length ? "failed" : failedSources || analysisFallbackCount ? "partial" : "success";
    const analysisMode = acceptedAnalysisModes.size > 1
      ? "mixed"
      : acceptedAnalysisModes.values().next().value || "rules";
    const message = [
      `${sources.length - failedSources}/${sources.length} sources succeeded`,
      `${acceptedCount} new articles`,
      analysisRepairCount ? `${analysisRepairCount} AI repairs` : null,
      analysisFallbackCount ? `${analysisFallbackCount} AI fallbacks` : null,
    ].filter(Boolean).join("; ");
    const result = {
      finishedAt: new Date().toISOString(),
      status,
      fetchedCount,
      acceptedCount,
      skippedCount,
      errorCount: failedSources + analysisFallbackCount,
      analysisRepairCount,
      analysisMode,
      message,
    };
    finishRun(database, runId, result);
    runFinished = true;
    persistedResult = result;

    if (status === "failed") throw new Error("所有来源采集失败，保留上一次成功快照");
    const snapshot = await buildSnapshot(database);
    await writeSnapshotAtomic(snapshot);
    return { runId, ...result, snapshot: snapshot.status };
  } catch (error) {
    if (!runFinished) {
      finishRun(database, runId, {
        finishedAt: new Date().toISOString(),
        status: "failed",
        fetchedCount: 0,
        acceptedCount: 0,
        skippedCount: 0,
        errorCount: 1,
        analysisMode: preferredAnalysisMode,
        message: error instanceof Error ? error.message : String(error),
      });
    } else if (persistedResult?.status !== "failed") {
      finishRun(database, runId, {
        ...persistedResult,
        finishedAt: new Date().toISOString(),
        status: "failed",
        errorCount: persistedResult.errorCount + 1,
        message: `快照发布失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
    throw error;
  } finally {
    database.close();
  }
}
