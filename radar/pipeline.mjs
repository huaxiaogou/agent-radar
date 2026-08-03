import { readFile } from "node:fs/promises";
import { contentHash, enrichItem, discoverSourceItemsWithDiagnostics } from "./fetch.mjs";
import { analyzeItem, chooseSignalSlug, resolveAnalysisProvider, scoreRelevance, shouldExploreCandidate } from "./analyze.mjs";
import { createConceptKnowledgeAnalyzer } from "./concept-analyze.mjs";
import {
  CONCEPT_ANALYZER_VERSION,
  CONCEPT_KNOWLEDGE_SCHEMA_VERSION,
  conceptArticleInputContractHash,
  listConceptKnowledge,
  maintainConceptKnowledgeLifecycles,
  runConceptKnowledgeBackfill,
} from "./concept-knowledge.mjs";
import {
  articleExists,
  beginRun,
  finishRun,
  getModelLandscapeState,
  getRecentClusterCandidates,
  getSourceHealth,
  insertArticle,
  openDatabase,
  markModelLandscapeFailure,
  replaceModelLandscape,
  retireWatchedArticle,
  updateSourceHealth,
  upsertSourceCatalog,
} from "./database.mjs";
import { loadSourceCatalog } from "./catalog.mjs";
import { buildSnapshot, writeSnapshotAtomic } from "./snapshot.mjs";
import {
  discoverModelLandscape,
  isModelLandscapeDue,
  MODEL_LANDSCAPE_SOURCE,
} from "./model-landscape.mjs";

const bootstrapConceptsPromise = readFile(new URL("../config/concepts.json", import.meta.url), "utf8")
  .then((value) => JSON.parse(value));

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

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function selectConceptRetryUrls(database, {
  limit,
  excludeUrls = [],
  now = new Date().toISOString(),
} = {}) {
  const retryLimit = positiveInteger(limit, 4);
  const excluded = new Set(excludeUrls);
  return database.prepare(`
    SELECT a.url, a.content_hash, a.content_roles_json,
           b.content_hash AS backfill_content_hash,
           b.input_contract_hash, b.knowledge_schema_version, b.analyzer_version, b.status,
           lease.content_hash AS lease_content_hash, lease.lease_expires_at
    FROM articles a
    LEFT JOIN concept_backfill b ON b.article_url = a.url
    LEFT JOIN concept_backfill_leases lease ON lease.article_url = a.url
    WHERE a.publish_decision IN ('publish', 'watch')
    ORDER BY
      CASE
        WHEN b.article_url IS NULL OR b.content_hash <> a.content_hash THEN 0
        ELSE 1
      END,
      COALESCE(b.attempted_at, a.discovered_at),
      a.url
  `).all()
    .filter((row) => {
      if (excluded.has(row.url)) return false;
      const completedCurrentContract = row.status === "completed"
        && row.backfill_content_hash === row.content_hash
        && row.input_contract_hash === conceptArticleInputContractHash(row)
        && row.knowledge_schema_version === CONCEPT_KNOWLEDGE_SCHEMA_VERSION
        && row.analyzer_version === CONCEPT_ANALYZER_VERSION;
      if (completedCurrentContract) return false;
      const leased = row.lease_content_hash === row.content_hash
        && new Date(row.lease_expires_at || 0).getTime() > new Date(now).getTime();
      return !leased;
    })
    .map((row) => row.url)
    .slice(0, retryLimit);
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

function finalRelevanceScore(ruleScore, analysis, explorationCandidate = false) {
  const aiScore = Number(analysis.relevanceScore);
  if (!Number.isFinite(aiScore)) return ruleScore;
  const blended = Math.round((ruleScore + (aiScore - 50) / 12.5) * 10) / 10;
  const explorationFloor = explorationCandidate ? Math.round(aiScore) / 10 : 0;
  return Math.max(0, Math.min(100, Math.max(blended, explorationFloor)));
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
  const match = /^(1|2|4|8|12|24)h$/.exec(String(source?.cadence || "").trim());
  if (!match) throw new Error(`来源采集周期 cadence 无效：${source?.cadence || "未配置"}`);
  if (trigger !== "systemd") return true;
  if (!lastAttemptAt) return true;
  const nowTime = new Date(now).getTime();
  const lastAttemptTime = new Date(lastAttemptAt).getTime();
  if (!Number.isFinite(nowTime)) throw new Error(`当前调度时间无效：${now}`);
  if (!Number.isFinite(lastAttemptTime)) return true;
  return nowTime - lastAttemptTime >= Number(match[1]) * 3_600_000;
}

export async function runIngestion({
  trigger = "manual",
  logger = console,
  fetchOptions = {},
  modelLandscapeFetcher = discoverModelLandscape,
} = {}) {
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
  const modelLandscapeState = getModelLandscapeState(database);
  const modelLandscapeDue = isModelLandscapeDue({
    trigger,
    lastSuccessAt: modelLandscapeState.lastSuccessAt,
    now: startedAt,
  });
  const modelLandscapePromise = modelLandscapeDue
    ? modelLandscapeFetcher(fetchOptions)
      .then((models) => ({ ok: true, models }))
      .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : Promise.resolve({ ok: true, skipped: true, models: modelLandscapeState.models });
  let runFinished = false;
  let persistedResult = null;

  try {
    const discoveryResults = await mapLimit(
      dueSources,
      Number(process.env.RADAR_SOURCE_CONCURRENCY || 4),
      async (source) => {
        const attemptedAt = new Date().toISOString();
        try {
          const discovery = await discoverSourceItemsWithDiagnostics(source, fetchOptions);
          const diagnostic = discovery.diagnostics.map((entry) => (
            `${entry.role}[${entry.index}] ${entry.endpoint} [${entry.code}] ${entry.message}`
          )).join("; ") || null;
          const endpoint = `${discovery.endpoint.role}[${discovery.endpoint.index}] ${discovery.endpoint.url}`;
          logger.info?.(`[source:${source.id}] discovered=${discovery.items.length} status=${discovery.status} endpoint=${endpoint}`);
          if (diagnostic) logger.warn?.(`[source:${source.id}] degraded diagnostics=${diagnostic}`);
          return {
            source,
            attemptedAt,
            items: discovery.items,
            status: discovery.status,
            error: diagnostic,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error?.(`[source:${source.id}] ${message}`);
          return { source, attemptedAt, items: [], status: "error", error: message };
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
          sourceFamily: result.source.family,
          sourceLanguage: result.source.language,
          sourceFocus: result.source.focus,
          contentRoles: result.source.contentRoles || [],
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
    const enrichmentDegradedItems = enrichedItems.filter((item) => item.enrichmentStatus === "degraded");
    const enrichmentDiagnosticsBySource = new Map();
    for (const item of enrichmentDegradedItems) {
      const diagnostic = `[${item.enrichmentError?.code || "FETCH_ERROR"}] ${item.enrichmentError?.message || "详情正文抓取失败；已使用 excerpt-only 内容"}`;
      const diagnostics = enrichmentDiagnosticsBySource.get(item.sourceId) || [];
      if (!diagnostics.includes(diagnostic)) diagnostics.push(diagnostic);
      enrichmentDiagnosticsBySource.set(item.sourceId, diagnostics);
      logger.warn?.(`[source:${item.sourceId}] detail enrichment degraded ${diagnostic}`);
    }
    const enrichmentDegradedCount = enrichmentDegradedItems.length;
    const enriched = enrichedItems.flatMap((item) => {
      const relevanceScore = scoreRelevance(item, { alwaysRelevant: item.alwaysRelevant });
      const explorationCandidate = shouldExploreCandidate(item, {
        family: item.sourceFamily,
        layer: item.sourceLayer,
      });
      if (relevanceScore < discoveryThreshold && !explorationCandidate) {
        skippedCount += 1;
        return [];
      }
      return [{ ...item, relevanceScore, explorationCandidate }];
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

    const ranked = analyzed.map(({ item, analysis }) => {
      // 互动只负责把低规则相关性的近期社区候选送进编辑分析，绝不能授权公开。
      // 即使外部模型返回 publish/100 分，也必须确定性地停留在 watch 区域。
      const explorationOnly = item.explorationCandidate === true && item.relevanceScore < discoveryThreshold;
      const guardedAnalysis = explorationOnly && analysis.publishDecision === "publish"
        ? { ...analysis, publishDecision: "watch" }
        : analysis;
      return {
        item,
        analysis: guardedAnalysis,
        relevanceScore: finalRelevanceScore(item.relevanceScore, guardedAnalysis, item.explorationCandidate),
      };
    });
    let retiredCount = 0;
    for (const { item, analysis, relevanceScore } of ranked) {
      if (analysis.publishDecision === "reject" && retireWatchedArticle(database, persistedArticle(item, analysis, relevanceScore))) {
        retiredCount += 1;
      }
    }
    const isWatchedConceptCandidate = ({ item, analysis, relevanceScore }) => {
      return analysis.publishDecision === "watch"
        && relevanceScore >= discoveryThreshold
        && (
          item.explorationCandidate === true
          || Boolean(String(analysis.candidateConcept || "").trim())
        );
    };
    const publishable = ranked.flatMap(({ item, analysis, relevanceScore }) => {
      if (analysis.publishDecision !== "publish" || relevanceScore < publishThreshold) {
        if (!isWatchedConceptCandidate({ item, analysis, relevanceScore })) skippedCount += 1;
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
    const insertedArticleUrls = [];
    for (const { item, analysis, relevanceScore } of [...publishable, ...watchedConceptCandidates]) {
      const isPublished = analysis.publishDecision === "publish" && relevanceScore >= publishThreshold;
      const signalSlug = chooseSignalSlug(item, analysis, clusterCandidates);
      const article = persistedArticle(item, analysis, relevanceScore, signalSlug);
      if (!insertArticle(database, article)) {
        if (isPublished) skippedCount += 1;
        continue;
      }
      insertedArticleUrls.push(article.url);
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

    let conceptUpdatedCount = 0;
    let conceptSkippedCount = 0;
    let conceptFailureCount = 0;
    let conceptBackfillError = null;
    const conceptIncrementalLimit = positiveInteger(
      process.env.RADAR_CONCEPT_INCREMENTAL_BATCH_SIZE,
      20,
    );
    const newConceptArticleUrls = insertedArticleUrls.slice(0, conceptIncrementalLimit);
    const conceptRetryLimit = Math.min(
      positiveInteger(process.env.RADAR_CONCEPT_RETRY_BATCH_SIZE, 4),
      Math.max(0, conceptIncrementalLimit - newConceptArticleUrls.length),
    );
    const conceptRetryUrls = analysisProvider !== "rules" && trigger !== "test" && conceptRetryLimit > 0
      ? selectConceptRetryUrls(database, {
        limit: conceptRetryLimit,
        excludeUrls: insertedArticleUrls,
      })
      : [];
    // 新文章与历史 backlog 共享同一增量预算。新文章绝对优先，未选中的新文章
    // 不写入 backfill 状态，继续作为 SQLite pending 留待下一轮恢复。
    const conceptArticleUrls = [...newConceptArticleUrls, ...conceptRetryUrls];
    if (conceptArticleUrls.length > 0 && analysisProvider !== "rules" && trigger !== "test") {
      try {
        const bootstrapConcepts = await bootstrapConceptsPromise;
        const knownConcepts = () => {
          const bySlug = new Map();
          for (const item of [...bootstrapConcepts, ...listConceptKnowledge(database)]) {
            const concept = item?.concept || item;
            if (concept?.slug) bySlug.set(concept.slug, concept);
          }
          return [...bySlug.values()];
        };
        const analyzeArticle = createConceptKnowledgeAnalyzer({
          database,
          provider: analysisProvider,
          knownConcepts,
          reason: newConceptArticleUrls.length > 0
            ? "新文章优先与失败 backlog 有界概念更新"
            : "失败 backlog 有界概念重试",
        });
        const conceptResult = await runConceptKnowledgeBackfill({
          database,
          analyzeArticle,
          batchSize: conceptArticleUrls.length,
          concurrency: Number(process.env.RADAR_CONCEPT_ANALYSIS_CONCURRENCY || 4),
          now: new Date().toISOString(),
          articleUrls: conceptArticleUrls,
          onProgress: (event) => {
            const category = event.errorCategory ? ` category=${event.errorCategory}` : "";
            const elapsed = event.phase === "completed" ? ` elapsedMs=${event.elapsedMs}` : "";
            logger.info?.(`[concept:${event.articleIndex}/${event.batchSize}] ${event.phase === "started" ? "started" : event.status}${elapsed}${category} ${event.articleUrl}`);
          },
        });
        conceptUpdatedCount = Number(conceptResult.processedCount || 0);
        conceptSkippedCount = Number(conceptResult.skippedCount || 0);
        conceptFailureCount = Number(conceptResult.failedCount || 0) + Number(conceptResult.conflictCount || 0);
        for (const failure of conceptResult.failures || []) {
          logger.error?.(`[concept:${failure.url || "unknown"}] ${failure.error || failure.status || "analysis failed"}`);
        }
      } catch {
        conceptFailureCount = conceptArticleUrls.length;
        conceptBackfillError = "concept incremental backfill failed";
        logger.error?.(`[concept:incremental] ${conceptBackfillError}`);
      }
    }

    const failedSources = discoveryResults.filter((result) => result.status === "error").length;
    const degradedSourceIds = new Set(discoveryResults
      .filter((result) => result.status === "degraded")
      .map((result) => result.source.id));
    for (const sourceId of enrichmentDiagnosticsBySource.keys()) degradedSourceIds.add(sourceId);
    const degradedSourceCount = degradedSourceIds.size;
    for (const result of discoveryResults) {
      const enrichmentDiagnostics = enrichmentDiagnosticsBySource.get(result.source.id) || [];
      const diagnostics = [result.error, ...enrichmentDiagnostics].filter(Boolean);
      const status = result.status === "error"
        ? "error"
        : degradedSourceIds.has(result.source.id) ? "degraded" : "success";
      updateSourceHealth(database, result.source, {
        attemptedAt: result.attemptedAt,
        status,
        error: [...new Set(diagnostics)].join("; ") || null,
        itemCount: acceptedBySource.get(result.source.id) || 0,
      });
    }

    const modelLandscapeResult = await modelLandscapePromise;
    let modelLandscapeErrorCount = 0;
    if (modelLandscapeResult.skipped) {
      logger.info?.(`[models:artificial-analysis] cadence-skipped items=${modelLandscapeState.itemCount}`);
    } else if (modelLandscapeResult.ok) {
      replaceModelLandscape(database, {
        sourceName: MODEL_LANDSCAPE_SOURCE.name,
        sourceUrl: MODEL_LANDSCAPE_SOURCE.url,
        methodologyUrl: MODEL_LANDSCAPE_SOURCE.methodologyUrl,
        attemptedAt: new Date().toISOString(),
        models: modelLandscapeResult.models,
      });
      logger.info?.(`[models:artificial-analysis] discovered=${modelLandscapeResult.models.length}`);
    } else {
      modelLandscapeErrorCount = 1;
      markModelLandscapeFailure(database, {
        attemptedAt: new Date().toISOString(),
        error: modelLandscapeResult.error,
      });
      logger.error?.(`[models:artificial-analysis] ${modelLandscapeResult.error}`);
    }

    let status = dueSources.length > 0 && failedSources === dueSources.length && !modelLandscapeResult.ok
      ? "failed"
      : failedSources || degradedSourceCount || analysisFallbackCount || conceptFailureCount || modelLandscapeErrorCount ? "partial" : "success";
    const actualAnalysisModes = new Set(analyzed.map(({ analysis }) => analysis.analysisMode).filter(Boolean));
    const runAnalysisMode = actualAnalysisModes.size > 1
      ? "mixed"
      : actualAnalysisModes.values().next().value || "none";
    const message = [
      `${dueSources.length}/${sources.length} sources due`,
      `${cadenceSkippedSources} cadence-skipped`,
      `${dueSources.length - failedSources}/${dueSources.length} due sources available`,
      degradedSourceCount ? `${degradedSourceCount} degraded sources` : null,
      enrichmentDegradedCount ? `${enrichmentDegradedCount} detail enrichment degradations (excerpt-only)` : null,
      `${acceptedCount} new articles`,
      watchedCount ? `${watchedCount} watched candidates` : null,
      retiredCount ? `${retiredCount} retired candidates` : null,
      analysisRepairCount ? `${analysisRepairCount} AI repairs` : null,
      analysisFallbackCount ? `${analysisFallbackCount} AI fallbacks` : null,
      conceptUpdatedCount ? `${conceptUpdatedCount} concept knowledge revisions` : null,
      conceptSkippedCount ? `${conceptSkippedCount} concept analyses skipped` : null,
      conceptFailureCount ? `${conceptFailureCount} concept analyses failed (last-good retained)` : null,
      conceptBackfillError ? `concept analysis error: ${conceptBackfillError}` : null,
      modelLandscapeResult.skipped
        ? `model landscape cadence-skipped (${modelLandscapeState.itemCount} retained)`
        : modelLandscapeResult.ok
          ? `${modelLandscapeResult.models.length} model landscape points refreshed`
          : `model landscape retained after failure: ${modelLandscapeResult.error}`,
    ].filter(Boolean).join("; ");
    const result = {
      finishedAt: new Date().toISOString(),
      status,
      fetchedCount,
      acceptedCount,
      watchedCount,
      retiredCount,
      skippedCount,
      errorCount: failedSources + degradedSourceCount + analysisFallbackCount + conceptFailureCount + modelLandscapeErrorCount,
      degradedSourceCount,
      enrichmentDegradedCount,
      analysisRepairCount,
      conceptUpdatedCount,
      conceptSkippedCount,
      conceptFailureCount,
      configuredProvider: analysisProvider,
      runAnalysisMode,
      analysisMode: runAnalysisMode,
      message,
    };
    finishRun(database, runId, result);
    runFinished = true;
    persistedResult = result;

    if (status === "failed") throw new Error("所有来源采集失败，保留上一次成功快照");
    const lifecycleMaintenance = maintainConceptKnowledgeLifecycles(database, { now: result.finishedAt });
    if (lifecycleMaintenance.failedCount > 0) {
      const preview = lifecycleMaintenance.failures.slice(0, 3)
        .map((failure) => `${failure.slug}:${failure.error}`).join("、");
      throw new Error(`概念生命周期维护失败，保留上一次成功快照：${preview}`);
    }
    const snapshot = await buildSnapshot(database);
    await writeSnapshotAtomic(snapshot);
    return {
      runId,
      ...result,
      snapshot: {
        ...snapshot.status,
        signals: snapshot.signals,
        discussionPulses: snapshot.discussionPulses,
      },
    };
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
