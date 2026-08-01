import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

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
      FOREIGN KEY(source_id) REFERENCES source_health(source_id)
    );

    CREATE INDEX IF NOT EXISTS articles_published_idx ON articles(COALESCE(published_at, discovered_at) DESC);
    CREATE INDEX IF NOT EXISTS articles_signal_idx ON articles(signal_slug);
    CREATE INDEX IF NOT EXISTS articles_concept_idx ON articles(concept_slug);
  `);
  return database;
}

export function upsertSourceCatalog(database, sources) {
  const statement = database.prepare(`
    INSERT INTO source_health (
      source_id, name, homepage, source_class, priority, cadence, focus, independent_group
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      name = excluded.name,
      homepage = excluded.homepage,
      source_class = excluded.source_class,
      priority = excluded.priority,
      cadence = excluded.cadence,
      focus = excluded.focus,
      independent_group = excluded.independent_group
  `);
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
    );
  }
}

export function beginRun(database, trigger, startedAt, analysisMode) {
  const result = database.prepare(`
    INSERT INTO runs (trigger, started_at, status, analysis_mode)
    VALUES (?, ?, 'running', ?)
  `).run(trigger, startedAt, analysisMode);
  return Number(result.lastInsertRowid);
}

export function finishRun(database, runId, result) {
  database.prepare(`
    UPDATE runs SET
      finished_at = ?, status = ?, fetched_count = ?, accepted_count = ?,
      skipped_count = ?, error_count = ?, analysis_mode = ?, message = ?
    WHERE id = ?
  `).run(
    result.finishedAt,
    result.status,
    result.fetchedCount,
    result.acceptedCount,
    result.skippedCount,
    result.errorCount,
    result.analysisMode,
    result.message || null,
    runId,
  );
}

export function updateSourceHealth(database, source, result) {
  database.prepare(`
    UPDATE source_health SET
      last_attempt_at = ?,
      last_success_at = CASE WHEN ? = 'success' THEN ? ELSE last_success_at END,
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
  return Boolean(database.prepare("SELECT 1 FROM articles WHERE url = ? LIMIT 1").get(url));
}

export function insertArticle(database, article) {
  const result = database.prepare(`
    INSERT OR IGNORE INTO articles (
      url, source_id, source_name, source_class, independent_group,
      original_title, original_excerpt, content_text, published_at, discovered_at,
      content_hash, relevance_score, signal_slug, concept_slug, title, summary,
      implication, topic, stage, accent, tags_json, analysis_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    article.url,
    article.sourceId,
    article.sourceName,
    article.sourceClass,
    article.independentGroup,
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
  );
  return Number(result.changes) > 0;
}

export function getRecentArticles(database, limit = 240) {
  return database.prepare(`
    SELECT * FROM articles
    ORDER BY COALESCE(published_at, discovered_at) DESC
    LIMIT ?
  `).all(limit);
}

export function getRecentClusterCandidates(database, sinceIso) {
  return database.prepare(`
    SELECT signal_slug, concept_slug, original_title, tags_json, independent_group,
           COALESCE(published_at, discovered_at) AS event_at
    FROM articles
    WHERE COALESCE(published_at, discovered_at) >= ?
    ORDER BY event_at DESC
  `).all(sinceIso);
}

export function getSourceHealth(database) {
  return database.prepare("SELECT * FROM source_health ORDER BY priority, name").all();
}

export function getLatestRun(database) {
  return database.prepare("SELECT * FROM runs WHERE status != 'running' ORDER BY id DESC LIMIT 1").get() || null;
}

export function getArticleCount(database) {
  const row = database.prepare("SELECT COUNT(*) AS count FROM articles").get();
  return Number(row?.count || 0);
}
