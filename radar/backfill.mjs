import { analyzeItemStrict } from "./analyze.mjs";
import { getPublishedArticlesForBackfill, updatePublishedArticleEditorial } from "./database.mjs";
import { isLlmEditorialReady } from "./editorial.mjs";
import { resolveAnalysisProvider } from "./provider.mjs";

const activeDatabases = new WeakSet();

function positiveConcurrency(value) {
  const concurrency = Number(value);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("RADAR_BACKFILL_CONCURRENCY 必须是正整数");
  }
  return concurrency;
}

function analysisInputFromRow(row) {
  return {
    url: row.url,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceClass: row.source_class,
    independentGroup: row.independent_group,
    sourceLayer: row.source_layer,
    sourceLanguage: row.source_language,
    engagementCount: Number(row.engagement_count || 0),
    title: row.original_title,
    excerpt: row.original_excerpt,
    contentText: row.content_text,
    publishedAt: row.published_at,
    discoveredAt: row.discovered_at,
    contentHash: row.content_hash,
    relevanceScore: Number(row.relevance_score || 0),
  };
}

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

export async function runAnalysisBackfill({
  database,
  concurrency = process.env.RADAR_BACKFILL_CONCURRENCY || 4,
  logger = console,
  analyze,
} = {}) {
  if (!database || typeof database.prepare !== "function") throw new Error("分析回填需要有效 database");
  if (activeDatabases.has(database)) throw new Error("该 database 的分析回填已在运行，禁止并行重入");

  const workerCount = positiveConcurrency(concurrency);
  const provider = analyze ? null : resolveAnalysisProvider();
  if (!analyze && provider === "rules") throw new Error("分析回填需要配置 DeepSeek 或 OpenAI，不能使用 rules");
  const analyzeItem = analyze || ((item) => analyzeItemStrict(item, provider));

  activeDatabases.add(database);
  try {
    const candidates = getPublishedArticlesForBackfill(database).filter((row) => row.analysis_mode === "rules");
    const results = await mapLimit(candidates, workerCount, async (row) => {
      try {
        const analysis = await analyzeItem(analysisInputFromRow(row));
        if (!isLlmEditorialReady(analysis)) {
          throw new Error("严格回填结果不是合格的中文 LLM 编辑内容");
        }
        const updated = updatePublishedArticleEditorial(database, {
          url: row.url,
          contentHash: row.content_hash,
          title: analysis.title,
          summary: analysis.summary,
          implication: analysis.implication,
          analysisMode: analysis.analysisMode,
          expectedTitle: row.title,
          expectedSummary: row.summary,
          expectedImplication: row.implication,
          expectedAnalysisMode: row.analysis_mode,
        });
        if (!updated) {
          logger.error?.(`[backfill:${row.url}] CAS 未命中，记录已变化或不再公开`);
          return { url: row.url, status: "conflict" };
        }
        logger.info?.(`[backfill:${row.url}] updated`);
        return { url: row.url, status: "updated" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error?.(`[backfill:${row.url}] ${message}`);
        return { url: row.url, status: "failed", error: message };
      }
    });
    const updatedCount = results.filter((result) => result.status === "updated").length;
    const conflictCount = results.filter((result) => result.status === "conflict").length;
    const failedCount = results.length - updatedCount;
    return {
      backlogCount: candidates.length,
      updatedCount,
      failedCount,
      conflictCount,
      failures: results.filter((result) => result.status !== "updated"),
    };
  } finally {
    activeDatabases.delete(database);
  }
}
