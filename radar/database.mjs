import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((value) => value.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }
  return false;
}

function migrateRunConfiguredProvider(database) {
  database.exec("BEGIN IMMEDIATE");
  try {
    ensureColumn(database, "runs", "configured_provider", "TEXT");
    database.exec(`
      UPDATE runs
      SET configured_provider = CASE
        WHEN analysis_mode IN ('openai', 'deepseek', 'rules') THEN analysis_mode
        ELSE 'rules'
      END
      WHERE configured_provider IS NULL
         OR configured_provider NOT IN ('openai', 'deepseek', 'rules')
    `);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getDataDirectory() {
  return path.resolve(process.env.RADAR_DATA_DIR || path.join(projectRoot, ".data"));
}

export function getDatabasePath() {
  return path.join(getDataDirectory(), "agent-radar.sqlite");
}

export function getSnapshotPath() {
  return path.join(getDataDirectory(), "radar-snapshot.json");
}

export function openDatabase() {
  mkdirSync(getDataDirectory(), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(getDatabasePath());
  database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'partial', 'failed')),
      fetched_count INTEGER NOT NULL DEFAULT 0,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      analysis_mode TEXT NOT NULL DEFAULT 'rules',
      configured_provider TEXT NOT NULL DEFAULT 'rules',
      message TEXT
    );

    CREATE TABLE IF NOT EXISTS source_health (
      source_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      homepage TEXT NOT NULL,
      source_class TEXT NOT NULL,
      priority TEXT NOT NULL,
      cadence TEXT NOT NULL,
      focus TEXT NOT NULL,
      independent_group TEXT NOT NULL,
      source_layer TEXT,
      language TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      last_status TEXT NOT NULL DEFAULT 'never',
      item_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS articles (
      url TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_class TEXT NOT NULL,
      independent_group TEXT NOT NULL,
      source_layer TEXT,
      source_language TEXT,
      engagement_count INTEGER NOT NULL DEFAULT 0,
      original_title TEXT NOT NULL,
      original_excerpt TEXT NOT NULL,
      content_text TEXT NOT NULL,
      published_at TEXT,
      discovered_at TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      relevance_score INTEGER NOT NULL,
      signal_slug TEXT NOT NULL,
      concept_slug TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      implication TEXT NOT NULL,
      topic TEXT NOT NULL,
      stage TEXT NOT NULL,
      accent TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      analysis_mode TEXT NOT NULL,
      publish_decision TEXT NOT NULL DEFAULT 'publish',
      editorial_score INTEGER NOT NULL DEFAULT 0,
      ai_relevance_score INTEGER NOT NULL DEFAULT 0,
      novelty_score INTEGER NOT NULL DEFAULT 0,
      evidence_score INTEGER NOT NULL DEFAULT 0,
      event_key TEXT,
      candidate_concept TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(source_id) REFERENCES source_health(source_id)
    );

    CREATE INDEX IF NOT EXISTS articles_published_idx ON articles(COALESCE(published_at, discovered_at) DESC);
    CREATE INDEX IF NOT EXISTS articles_signal_idx ON articles(signal_slug);
    CREATE INDEX IF NOT EXISTS articles_concept_idx ON articles(concept_slug);
  `);
  ensureColumn(database, "source_health", "source_layer", "TEXT");
  ensureColumn(database, "source_health", "language", "TEXT");
  ensureColumn(database, "source_health", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "articles", "source_layer", "TEXT");
  ensureColumn(database, "articles", "source_language", "TEXT");
  ensureColumn(database, "articles", "engagement_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "articles", "publish_decision", "TEXT NOT NULL DEFAULT 'publish'");
  ensureColumn(database, "articles", "editorial_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "articles", "ai_relevance_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "articles", "novelty_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "articles", "evidence_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "articles", "event_key", "TEXT");
  ensureColumn(database, "articles", "candidate_concept", "TEXT NOT NULL DEFAULT ''");
  migrateRunConfiguredProvider(database);
  database.exec("CREATE INDEX IF NOT EXISTS articles_event_idx ON articles(concept_slug, event_key)");
  return database;
}

export function upsertSourceCatalog(database, sources) {
  const statement = database.prepare(`
    INSERT INTO source_health (
      source_id, name, homepage, source_class, priority, cadence, focus, independent_group,
      source_layer, language, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(source_id) DO UPDATE SET
      name = excluded.name,
      homepage = excluded.homepage,
      source_class = excluded.source_class,
      priority = excluded.priority,
      cadence = excluded.cadence,
      focus = excluded.focus,
      independent_group = excluded.independent_group,
      source_layer = excluded.source_layer,
      language = excluded.language,
      active = 1
  `);
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec("UPDATE source_health SET active = 0");
    for (const source of sources) {
      statement.run(
        source.id,
        source.name,
        source.homepage,
        source.class,
        source.priority,
        source.cadence,
        source.focus,
        source.independentGroup,
        source.layer || null,
        source.language || null,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function beginRun(database, trigger, startedAt, configuredProvider) {
  const result = database.prepare(`
    INSERT INTO runs (trigger, started_at, status, analysis_mode, configured_provider)
    VALUES (?, ?, 'running', 'none', ?)
  `).run(trigger, startedAt, configuredProvider);
  return Number(result.lastInsertRowid);
}

export function finishRun(database, runId, result) {
  database.prepare(`
    UPDATE runs SET
      finished_at = ?, status = ?, fetched_count = ?, accepted_count = ?,
      skipped_count = ?, error_count = ?, analysis_mode = ?,
      configured_provider = COALESCE(?, configured_provider), message = ?
    WHERE id = ?
  `).run(
    result.finishedAt,
    result.status,
    result.fetchedCount,
    result.acceptedCount,
    result.skippedCount,
    result.errorCount,
    result.runAnalysisMode || result.analysisMode || "none",
    result.configuredProvider || null,
    result.message || null,
    runId,
  );
}

export function updateSourceHealth(database, source, result) {
  database.prepare(`
    UPDATE source_health SET
      last_attempt_at = ?,
      last_success_at = CASE WHEN ? IN ('success', 'degraded') THEN ? ELSE last_success_at END,
      last_error = ?,
      last_status = ?,
      item_count = item_count + ?
    WHERE source_id = ?
  `).run(
    result.attemptedAt,
    result.status,
    result.attemptedAt,
    result.error || null,
    result.status,
    result.itemCount || 0,
    source.id,
  );
}

export function articleExists(database, url) {
  return Boolean(database.prepare("SELECT 1 FROM articles WHERE url = ? AND publish_decision IN ('publish', 'reject') LIMIT 1").get(url));
}

export function insertArticle(database, article) {
  const result = database.prepare(`
    INSERT INTO articles (
      url, source_id, source_name, source_class, independent_group, source_layer, source_language, engagement_count,
      original_title, original_excerpt, content_text, published_at, discovered_at,
      content_hash, relevance_score, signal_slug, concept_slug, title, summary,
      implication, topic, stage, accent, tags_json, analysis_mode, publish_decision,
      editorial_score, ai_relevance_score, novelty_score, evidence_score, event_key, candidate_concept
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      source_id = excluded.source_id,
      source_name = excluded.source_name,
      source_class = excluded.source_class,
      independent_group = excluded.independent_group,
      source_layer = excluded.source_layer,
      source_language = excluded.source_language,
      engagement_count = excluded.engagement_count,
      original_title = excluded.original_title,
      original_excerpt = excluded.original_excerpt,
      content_text = excluded.content_text,
      published_at = excluded.published_at,
      discovered_at = excluded.discovered_at,
      content_hash = excluded.content_hash,
      relevance_score = excluded.relevance_score,
      signal_slug = excluded.signal_slug,
      concept_slug = excluded.concept_slug,
      title = excluded.title,
      summary = excluded.summary,
      implication = excluded.implication,
      topic = excluded.topic,
      stage = excluded.stage,
      accent = excluded.accent,
      tags_json = excluded.tags_json,
      analysis_mode = excluded.analysis_mode,
      publish_decision = excluded.publish_decision,
      editorial_score = excluded.editorial_score,
      ai_relevance_score = excluded.ai_relevance_score,
      novelty_score = excluded.novelty_score,
      evidence_score = excluded.evidence_score,
      event_key = excluded.event_key,
      candidate_concept = excluded.candidate_concept
    WHERE articles.publish_decision = 'watch'
  `).run(
    article.url,
    article.sourceId,
    article.sourceName,
    article.sourceClass,
    article.independentGroup,
    article.sourceLayer || null,
    article.sourceLanguage || null,
    Number(article.engagementCount || 0),
    article.originalTitle,
    article.originalExcerpt,
    article.contentText,
    article.publishedAt || null,
    article.discoveredAt,
    article.contentHash,
    article.relevanceScore,
    article.signalSlug,
    article.conceptSlug,
    article.title,
    article.summary,
    article.implication,
    article.topic,
    article.stage,
    article.accent,
    JSON.stringify(article.tags),
    article.analysisMode,
    article.publishDecision || "publish",
    Number(article.editorialScore || 0),
    Number(article.aiRelevanceScore || 0),
    Number(article.noveltyScore || 0),
    Number(article.evidenceScore || 0),
    article.eventKey || null,
    article.candidateConcept || "",
  );
  return Number(result.changes) > 0;
}

export function retireWatchedArticle(database, article) {
  const result = database.prepare(`
    UPDATE articles SET
      source_id = ?,
      source_name = ?,
      source_class = ?,
      independent_group = ?,
      source_layer = ?,
      source_language = ?,
      engagement_count = ?,
      original_title = ?,
      original_excerpt = ?,
      content_text = ?,
      published_at = ?,
      discovered_at = ?,
      content_hash = ?,
      relevance_score = ?,
      concept_slug = ?,
      title = ?,
      summary = ?,
      implication = ?,
      topic = ?,
      stage = ?,
      accent = ?,
      tags_json = ?,
      analysis_mode = ?,
      publish_decision = 'reject',
      editorial_score = ?,
      ai_relevance_score = ?,
      novelty_score = ?,
      evidence_score = ?,
      event_key = ?,
      candidate_concept = ''
    WHERE url = ? AND publish_decision = 'watch'
  `).run(
    article.sourceId,
    article.sourceName,
    article.sourceClass,
    article.independentGroup,
    article.sourceLayer || null,
    article.sourceLanguage || null,
    Number(article.engagementCount || 0),
    article.originalTitle,
    article.originalExcerpt,
    article.contentText,
    article.publishedAt || null,
    article.discoveredAt,
    article.contentHash,
    article.relevanceScore,
    article.conceptSlug,
    article.title,
    article.summary,
    article.implication,
    article.topic,
    article.stage,
    article.accent,
    JSON.stringify(article.tags || []),
    article.analysisMode,
    Number(article.editorialScore || 0),
    Number(article.aiRelevanceScore || 0),
    Number(article.noveltyScore || 0),
    Number(article.evidenceScore || 0),
    article.eventKey || null,
    article.url,
  );
  return Number(result.changes) > 0;
}

export function getRecentArticles(database, limit = 240) {
  return database.prepare(`
    SELECT * FROM articles
    WHERE publish_decision = 'publish'
    ORDER BY COALESCE(published_at, discovered_at) DESC
    LIMIT ?
  `).all(limit);
}

export function getPublishedArticlesForBackfill(database) {
  return database.prepare(`
    SELECT * FROM articles
    WHERE publish_decision = 'publish'
    ORDER BY COALESCE(published_at, discovered_at) DESC, url ASC
  `).all();
}

export function updatePublishedArticleEditorial(database, article) {
  const result = database.prepare(`
    UPDATE articles SET
      title = ?,
      summary = ?,
      implication = ?,
      analysis_mode = ?
    WHERE url = ?
      AND content_hash = ?
      AND publish_decision = 'publish'
      AND title = ?
      AND summary = ?
      AND implication = ?
      AND analysis_mode = ?
  `).run(
    article.title,
    article.summary,
    article.implication,
    article.analysisMode,
    article.url,
    article.contentHash,
    article.expectedTitle,
    article.expectedSummary,
    article.expectedImplication,
    article.expectedAnalysisMode,
  );
  return Number(result.changes) === 1;
}

export function getRecentCandidateArticles(database, limit = 120) {
  return database.prepare(`
    SELECT * FROM articles
    WHERE publish_decision != 'reject' AND candidate_concept != ''
    ORDER BY COALESCE(published_at, discovered_at) DESC
    LIMIT ?
  `).all(limit);
}

export function getRecentClusterCandidates(database, sinceIso) {
  return database.prepare(`
    SELECT signal_slug, concept_slug, original_title, tags_json, independent_group, event_key,
           COALESCE(published_at, discovered_at) AS event_at
    FROM articles
    WHERE publish_decision = 'publish' AND COALESCE(published_at, discovered_at) >= ?
    ORDER BY event_at DESC
  `).all(sinceIso);
}

export function getSourceHealth(database) {
  return database.prepare("SELECT * FROM source_health WHERE active = 1 ORDER BY priority, name").all();
}

export function getLatestRun(database) {
  return database.prepare("SELECT * FROM runs WHERE status != 'running' ORDER BY id DESC LIMIT 1").get() || null;
}

export function getArticleCount(database) {
  const row = database.prepare("SELECT COUNT(*) AS count FROM articles WHERE publish_decision = 'publish'").get();
  return Number(row?.count || 0);
}
