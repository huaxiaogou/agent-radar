import { contentHash, enrichItem, discoverSourceItems } from "./fetch.mjs";
import { analyzeItem, chooseSignalSlug, resolveAnalysisProvider, scoreRelevance } from "./analyze.mjs";
import {
  articleExists,
  beginRun,
  finishRun,
  getRecentClusterCandidates,
  getSourceHealth,
  insertArticle,
  openDatabase,
  retireWatchedArticle,
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

export function selectFairly(candidates, limit) {
  const queues = new Map();
  for (const candidate of candidates) {
    const queue = queues.get(candidate.sourceId) || [];
    queue.push(candidate);
    queues.set(candidate.sourceId, queue);
  }
  const selected = [];
  const enrichmentLimit = Math.max(limit, queues.size);
  while (selected.length < enrichmentLimit) {
    let progressed = false;
    for (const queue of queues.values()) {
      const candidate = queue.shift();
      if (!candidate) continue;
      selected.push(candidate);
      progressed = true;
      if (selected.length >= enrichmentLimit) break;
    }
    if (!progressed) break;
  }
  return selected;
}

function finalRelevanceScore(ruleScore, analysis) {
  const aiScore = Number(analysis.relevanceScore);
  if (!Number.isFinite(aiScore)) return ruleScore;
  return Math.max(0, Math.min(100, Math.round((ruleScore + (aiScore - 50) / 12.5) * 10) / 10));
}

function persistedArticle(item, analysis, relevanceScore, signalSlug = null) {
  return {
    ...item,
    originalTitle: item.title,
    originalExcerpt: item.excerpt || "",
    contentText: item.contentText || item.excerpt || "",
    discoveredAt: new Date().toISOString(),
    contentHash: contentHash(item.title, item.excerpt || "", item.contentText || ""),
    relevanceScore,
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
    publishDecision: analysis.publishDecision,
    editorialScore: analysis.editorialScore,
    aiRelevanceScore: analysis.relevanceScore,
    noveltyScore: analysis.noveltyScore,
    evidenceScore: analysis.evidenceScore,
    eventKey: analysis.eventKey,
    candidateConcept: analysis.candidateConcept,
  };
}

export function isSourceDue(source, { trigger = "manual", lastAttemptAt = null, now = new Date().toISOString() } = {}) {
  const match = /^(4|8|12|24)h$/.exec(String(source?.cadence || "").trim());
  if (!match) throw new Error(`来源采集周期 cadence 无效：${source?.cadence || "未配置"}`);
  if (trigger !== "systemd") return true;
  if (!lastAttemptAt) return true;
  const nowTime = new Date(now).getTime();
  const lastAttemptTime = new Date(lastAttemptAt).getTime();
  if (!Number.isFinite(nowTime)) throw new Error(`当前调度时间无效：${now}`);
  if (!Number.isFinite(lastAttemptTime)) return true;
  return nowTime - lastAttemptTime >= Number(match[1]) * 3_600_000;
}

export async function runIngestion({ trigger = "manual", logger = console, fetchOptions = {} } = {}) {
  const sources = await loadSourceCatalog();
  for (const source of sources) isSourceDue(source, { trigger: "manual" });
  const analysisProvider = resolveAnalysisProvider();
  const database = openDatabase();
  const startedAt = new Date().toISOString();
  upsertSourceCatalog(database, sources);
  const sourceHealth = new Map(getSourceHealth(database).map((source) => [source.source_id, source]));
  const dueSources = sources.filter((source) => isSourceDue(source, {
    trigger,
    lastAttemptAt: sourceHealth.get(source.id)?.last_attempt_at || null,
    now: startedAt,
  }));
  const cadenceSkippedSources = sources.length - dueSources.length;
  const runId = beginRun(database, trigger, startedAt, analysisProvider);
  let runFinished = false;
  let persistedResult = null;

  try {
    const discoveryResults = await mapLimit(
      dueSources,
      Number(process.env.RADAR_SOURCE_CONCURRENCY || 4),
      async (source) => {
        const attemptedAt = new Date().toISOString();
        try {
          const items = await discoverSourceItems(source, fetchOptions);
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
    const publishThreshold = Number(process.env.RADAR_RELEVANCE_THRESHOLD || 5);
    const discoveryThreshold = Number(process.env.RADAR_DISCOVERY_RELEVANCE_THRESHOLD || Math.min(3, publishThreshold));
    for (const result of discoveryResults) {
      fetchedCount += result.items.length;
      for (const rawItem of result.items) {
        const publishedAt = validPublishedAt(rawItem.publishedAt);
        const relevanceScore = scoreRelevance(rawItem, result.source);
        if (
          !rawItem.url || seen.has(rawItem.url) || articleExists(database, rawItem.url) ||
          !withinAgeLimit(publishedAt)
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
          sourceLayer: result.source.layer,
          sourceLanguage: result.source.language,
          sourceFocus: result.source.focus,
          alwaysRelevant: result.source.alwaysRelevant === true,
          engagementCount: Number(rawItem.engagementCount || 0),
        });
      }
    }

    candidates.sort((left, right) => right.relevanceScore - left.relevanceScore || new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0));
    const publishLimit = Number(process.env.RADAR_MAX_NEW_ITEMS || 48);
    const selected = selectFairly(candidates, candidates.length);
    const enrichedItems = await mapLimit(
      selected,
      Number(process.env.RADAR_FETCH_CONCURRENCY || 4),
      (item) => enrichItem(item, fetchOptions),
    );
    const enriched = enrichedItems.flatMap((item) => {
      const relevanceScore = scoreRelevance(item, { alwaysRelevant: item.alwaysRelevant });
      if (relevanceScore < discoveryThreshold) {
        skippedCount += 1;
        return [];
      }
      return [{ ...item, relevanceScore }];
    });
    let analysisFallbackCount = 0;
    let analysisRepairCount = 0;
    const analyzed = await mapLimit(
      enriched,
      Number(process.env.RADAR_ANALYSIS_CONCURRENCY || 2),
      async (item) => {
        const result = await analyzeItem(item, analysisProvider);
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

    const ranked = analyzed.map(({ item, analysis }) => ({
      item,
      analysis,
      relevanceScore: finalRelevanceScore(item.relevanceScore, analysis),
    }));
    let retiredCount = 0;
    for (const { item, analysis, relevanceScore } of ranked) {
      if (analysis.publishDecision === "reject" && retireWatchedArticle(database, persistedArticle(item, analysis, relevanceScore))) {
        retiredCount += 1;
      }
    }
    const isWatchedConceptCandidate = ({ analysis, relevanceScore }) => {
      return analysis.publishDecision === "watch"
        && relevanceScore >= discoveryThreshold
        && Boolean(String(analysis.candidateConcept || "").trim());
    };
    const publishable = ranked.flatMap(({ item, analysis, relevanceScore }) => {
      if (analysis.publishDecision !== "publish" || relevanceScore < publishThreshold) {
        if (!isWatchedConceptCandidate({ analysis, relevanceScore })) skippedCount += 1;
        return [];
      }
      return [{ item, analysis, relevanceScore }];
    }).sort((left, right) => {
      return right.relevanceScore - left.relevanceScore ||
        Number(right.analysis.editorialScore || 0) - Number(left.analysis.editorialScore || 0) ||
        Number(right.analysis.evidenceScore || 0) - Number(left.analysis.evidenceScore || 0) ||
        new Date(right.item.publishedAt || 0) - new Date(left.item.publishedAt || 0);
    }).slice(0, publishLimit);
    const watchedConceptCandidates = ranked.filter(isWatchedConceptCandidate);
    const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
    const clusterCandidates = getRecentClusterCandidates(database, since).map((row) => ({ ...row }));
    const acceptedBySource = new Map();
    let acceptedCount = 0;
    let watchedCount = 0;
    for (const { item, analysis, relevanceScore } of [...publishable, ...watchedConceptCandidates]) {
      const isPublished = analysis.publishDecision === "publish" && relevanceScore >= publishThreshold;
      const signalSlug = chooseSignalSlug(item, analysis, clusterCandidates);
      const article = persistedArticle(item, analysis, relevanceScore, signalSlug);
      if (!insertArticle(database, article)) {
        if (isPublished) skippedCount += 1;
        continue;
      }
      if (!isPublished) {
        watchedCount += 1;
        continue;
      }
      acceptedCount += 1;
      acceptedBySource.set(item.sourceId, (acceptedBySource.get(item.sourceId) || 0) + 1);
      clusterCandidates.push({
        signal_slug: signalSlug,
        concept_slug: analysis.conceptSlug,
        original_title: item.title,
        tags_json: JSON.stringify(analysis.tags),
        independent_group: item.independentGroup,
        event_key: analysis.eventKey,
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

    let status = dueSources.length > 0 && failedSources === dueSources.length
      ? "failed"
      : failedSources || analysisFallbackCount ? "partial" : "success";
    const actualAnalysisModes = new Set(analyzed.map(({ analysis }) => analysis.analysisMode).filter(Boolean));
    const runAnalysisMode = actualAnalysisModes.size > 1
      ? "mixed"
      : actualAnalysisModes.values().next().value || "none";
    const message = [
      `${dueSources.length}/${sources.length} sources due`,
      `${cadenceSkippedSources} cadence-skipped`,
      `${dueSources.length - failedSources}/${dueSources.length} due sources succeeded`,
      `${acceptedCount} new articles`,
      watchedCount ? `${watchedCount} watched candidates` : null,
      retiredCount ? `${retiredCount} retired candidates` : null,
      analysisRepairCount ? `${analysisRepairCount} AI repairs` : null,
      analysisFallbackCount ? `${analysisFallbackCount} AI fallbacks` : null,
    ].filter(Boolean).join("; ");
    const result = {
      finishedAt: new Date().toISOString(),
      status,
      fetchedCount,
      acceptedCount,
      watchedCount,
      retiredCount,
      skippedCount,
      errorCount: failedSources + analysisFallbackCount,
      analysisRepairCount,
      configuredProvider: analysisProvider,
      runAnalysisMode,
      analysisMode: runAnalysisMode,
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
        configuredProvider: analysisProvider,
        runAnalysisMode: "none",
        analysisMode: "none",
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
