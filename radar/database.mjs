import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeSourceContentRoles } from "./catalog.mjs";
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
      source_family TEXT,
      language TEXT,
      content_roles_json TEXT NOT NULL DEFAULT '[]',
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
      content_roles_json TEXT NOT NULL DEFAULT '[]',
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

    CREATE TABLE IF NOT EXISTS model_landscape (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      source_name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      methodology_url TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '[]',
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      item_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS concept_knowledge (
      slug TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('candidate', 'emerging', 'validated', 'contested', 'cooling', 'archived')),
      heat REAL NOT NULL DEFAULT 0 CHECK(heat >= 0 AND heat <= 100),
      maturity REAL NOT NULL DEFAULT 0 CHECK(maturity >= 0 AND maturity <= 100),
      current_revision INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      merged_into TEXT,
      merge_reason TEXT,
      merged_at TEXT,
      FOREIGN KEY(merged_into) REFERENCES concept_knowledge(slug)
    );

    CREATE TABLE IF NOT EXISTS concept_aliases (
      alias_key TEXT PRIMARY KEY,
      alias_text TEXT NOT NULL,
      concept_slug TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(concept_slug) REFERENCES concept_knowledge(slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concept_revisions (
      concept_slug TEXT NOT NULL,
      revision INTEGER NOT NULL,
      previous_revision INTEGER,
      payload_json TEXT NOT NULL,
      changed_fields_json TEXT NOT NULL,
      field_diff_json TEXT NOT NULL DEFAULT '{}',
      confidence REAL NOT NULL DEFAULT 0,
      needs_review INTEGER NOT NULL DEFAULT 1,
      review_reasons_json TEXT NOT NULL DEFAULT '[]',
      material_change INTEGER NOT NULL DEFAULT 1,
      delta_json TEXT NOT NULL DEFAULT '{}',
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      change_reason TEXT NOT NULL,
      analyzed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(concept_slug, revision),
      FOREIGN KEY(concept_slug) REFERENCES concept_knowledge(slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concept_revision_claims (
      concept_slug TEXT NOT NULL,
      revision INTEGER NOT NULL,
      claim_key TEXT NOT NULL,
      claim_text TEXT NOT NULL,
      claim_kind TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidence_urls_json TEXT NOT NULL,
      PRIMARY KEY(concept_slug, revision, claim_key),
      FOREIGN KEY(concept_slug, revision) REFERENCES concept_revisions(concept_slug, revision) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concept_revision_evidence (
      concept_slug TEXT NOT NULL,
      revision INTEGER NOT NULL,
      evidence_url TEXT NOT NULL,
      original_title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_layer TEXT NOT NULL,
      independent_group TEXT NOT NULL,
      stance TEXT NOT NULL,
      published_at TEXT,
      engagement_count INTEGER NOT NULL DEFAULT 0,
      supports_json TEXT NOT NULL,
      PRIMARY KEY(concept_slug, revision, evidence_url),
      FOREIGN KEY(concept_slug, revision) REFERENCES concept_revisions(concept_slug, revision) ON DELETE CASCADE,
      FOREIGN KEY(evidence_url) REFERENCES articles(url)
    );

    CREATE TABLE IF NOT EXISTS concept_revision_relations (
      concept_slug TEXT NOT NULL,
      revision INTEGER NOT NULL,
      relation_type TEXT NOT NULL,
      target_slug TEXT NOT NULL,
      explanation TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidence_urls_json TEXT NOT NULL,
      PRIMARY KEY(concept_slug, revision, relation_type, target_slug),
      FOREIGN KEY(concept_slug, revision) REFERENCES concept_revisions(concept_slug, revision) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concept_revision_citations (
      concept_slug TEXT NOT NULL,
      revision INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      evidence_urls_json TEXT NOT NULL,
      PRIMARY KEY(concept_slug, revision, field_name),
      FOREIGN KEY(concept_slug, revision) REFERENCES concept_revisions(concept_slug, revision) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concept_backfill (
      article_url TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      input_contract_hash TEXT,
      knowledge_schema_version TEXT NOT NULL DEFAULT 'concept-knowledge-v1',
      analyzer_version TEXT NOT NULL DEFAULT 'concept-analyzer-v2',
      status TEXT NOT NULL CHECK(status IN ('completed', 'failed', 'conflict')),
      attempted_at TEXT NOT NULL,
      completed_at TEXT,
      last_error TEXT,
      concept_slug TEXT,
      revision INTEGER,
      current_attempt_id INTEGER,
      FOREIGN KEY(article_url) REFERENCES articles(url) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concept_backfill_leases (
      article_url TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      owner_token TEXT NOT NULL,
      claimed_at TEXT NOT NULL,
      lease_expires_at TEXT NOT NULL,
      FOREIGN KEY(article_url) REFERENCES articles(url) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concept_backfill_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_url TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      input_contract_hash TEXT,
      knowledge_schema_version TEXT NOT NULL,
      analyzer_version TEXT NOT NULL,
      owner_token TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'conflict', 'superseded')),
      attempted_at TEXT NOT NULL,
      completed_at TEXT,
      last_error TEXT,
      FOREIGN KEY(article_url) REFERENCES articles(url) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concept_backfill_outputs (
      attempt_id INTEGER NOT NULL,
      output_index INTEGER NOT NULL,
      concept_slug TEXT NOT NULL,
      revision INTEGER NOT NULL,
      PRIMARY KEY(attempt_id, concept_slug),
      UNIQUE(attempt_id, output_index),
      FOREIGN KEY(attempt_id) REFERENCES concept_backfill_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY(concept_slug, revision) REFERENCES concept_revisions(concept_slug, revision)
    );

    CREATE INDEX IF NOT EXISTS articles_published_idx ON articles(COALESCE(published_at, discovered_at) DESC);
    CREATE INDEX IF NOT EXISTS articles_signal_idx ON articles(signal_slug);
    CREATE INDEX IF NOT EXISTS articles_concept_idx ON articles(concept_slug);
    CREATE INDEX IF NOT EXISTS concept_knowledge_stage_idx ON concept_knowledge(stage, updated_at DESC);
    CREATE INDEX IF NOT EXISTS concept_aliases_slug_idx ON concept_aliases(concept_slug);
    CREATE INDEX IF NOT EXISTS concept_revisions_time_idx ON concept_revisions(analyzed_at DESC);
    CREATE INDEX IF NOT EXISTS concept_backfill_status_idx ON concept_backfill(status, attempted_at);
    CREATE INDEX IF NOT EXISTS concept_backfill_leases_expiry_idx ON concept_backfill_leases(lease_expires_at);
    CREATE INDEX IF NOT EXISTS concept_backfill_attempts_article_idx ON concept_backfill_attempts(article_url, id DESC);
    CREATE INDEX IF NOT EXISTS concept_backfill_attempts_boundary_idx ON concept_backfill_attempts(article_url, content_hash, knowledge_schema_version, analyzer_version, status);
    CREATE INDEX IF NOT EXISTS concept_backfill_outputs_concept_idx ON concept_backfill_outputs(concept_slug, revision);

    CREATE TRIGGER IF NOT EXISTS concept_revisions_no_update
    BEFORE UPDATE ON concept_revisions
    BEGIN
      SELECT RAISE(ABORT, 'concept revisions are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS concept_revisions_no_delete
    BEFORE DELETE ON concept_revisions
    BEGIN
      SELECT RAISE(ABORT, 'concept revisions are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS concept_revision_claims_no_update
    BEFORE UPDATE ON concept_revision_claims
    BEGIN
      SELECT RAISE(ABORT, 'concept revision claims are append-only audit records');
    END;

    CREATE TRIGGER IF NOT EXISTS concept_revision_claims_no_delete
    BEFORE DELETE ON concept_revision_claims
    BEGIN
      SELECT RAISE(ABORT, 'concept revision claims are append-only audit records');
    END;

    CREATE TRIGGER IF NOT EXISTS concept_revision_evidence_no_update
    BEFORE UPDATE ON concept_revision_evidence
    BEGIN
      SELECT RAISE(ABORT, 'concept revision evidence is append-only audit data');
    END;

    CREATE TRIGGER IF NOT EXISTS concept_revision_evidence_no_delete
    BEFORE DELETE ON concept_revision_evidence
    BEGIN
      SELECT RAISE(ABORT, 'concept revision evidence is append-only audit data');
    END;

    CREATE TRIGGER IF NOT EXISTS concept_revision_relations_no_update
    BEFORE UPDATE ON concept_revision_relations
    BEGIN
      SELECT RAISE(ABORT, 'concept revision relations are append-only audit records');
    END;

    CREATE TRIGGER IF NOT EXISTS concept_revision_relations_no_delete
    BEFORE DELETE ON concept_revision_relations
    BEGIN
      SELECT RAISE(ABORT, 'concept revision relations are append-only audit records');
    END;

    CREATE TRIGGER IF NOT EXISTS concept_revision_citations_no_update
    BEFORE UPDATE ON concept_revision_citations
    BEGIN
      SELECT RAISE(ABORT, 'concept revision citations are append-only audit records');
    END;

    CREATE TRIGGER IF NOT EXISTS concept_revision_citations_no_delete
    BEFORE DELETE ON concept_revision_citations
    BEGIN
      SELECT RAISE(ABORT, 'concept revision citations are append-only audit records');
    END;
  `);
  ensureColumn(database, "source_health", "source_layer", "TEXT");
  ensureColumn(database, "source_health", "source_family", "TEXT");
  ensureColumn(database, "source_health", "language", "TEXT");
  ensureColumn(database, "source_health", "content_roles_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(database, "source_health", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "articles", "source_layer", "TEXT");
  ensureColumn(database, "articles", "source_language", "TEXT");
  ensureColumn(database, "articles", "content_roles_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(database, "articles", "engagement_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "articles", "publish_decision", "TEXT NOT NULL DEFAULT 'publish'");
  ensureColumn(database, "articles", "editorial_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "articles", "ai_relevance_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "articles", "novelty_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "articles", "evidence_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "articles", "event_key", "TEXT");
  ensureColumn(database, "articles", "candidate_concept", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "concept_revisions", "previous_revision", "INTEGER");
  ensureColumn(database, "concept_revisions", "field_diff_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(database, "concept_revisions", "confidence", "REAL NOT NULL DEFAULT 0");
  ensureColumn(database, "concept_revisions", "needs_review", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "concept_revisions", "review_reasons_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(database, "concept_revisions", "material_change", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "concept_revisions", "delta_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(database, "concept_backfill", "knowledge_schema_version", "TEXT NOT NULL DEFAULT 'concept-knowledge-v1'");
  // Existing rows predate analyzer versioning and were produced by the
  // single-concept extractor. Mark them v1 so the v2 multi-concept analyzer
  // gets one real migration pass instead of incorrectly treating them as done.
  ensureColumn(database, "concept_backfill", "analyzer_version", "TEXT NOT NULL DEFAULT 'concept-analyzer-v1'");
  // This column intentionally has no legacy default: an old completed row did
  // not record the analyzer's full input, so it must receive one safe
  // reprocessing pass instead of being declared current by assumption.
  ensureColumn(database, "concept_backfill", "input_contract_hash", "TEXT");
  ensureColumn(database, "concept_backfill_attempts", "input_contract_hash", "TEXT");
  ensureColumn(database, "concept_backfill", "current_attempt_id", "INTEGER");
  migrateRunConfiguredProvider(database);
  database.prepare(`
    INSERT OR IGNORE INTO model_landscape (
      id, source_name, source_url, methodology_url, payload_json, item_count
    ) VALUES (1, 'Artificial Analysis', 'https://artificialanalysis.ai/models',
      'https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-1/', '[]', 0)
  `).run();
  database.exec("CREATE INDEX IF NOT EXISTS articles_event_idx ON articles(concept_slug, event_key)");
  return database;
}

export function upsertSourceCatalog(database, sources) {
  const statement = database.prepare(`
    INSERT INTO source_health (
      source_id, name, homepage, source_class, priority, cadence, focus, independent_group,
      source_layer, source_family, language, content_roles_json, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(source_id) DO UPDATE SET
      name = excluded.name,
      homepage = excluded.homepage,
      source_class = excluded.source_class,
      priority = excluded.priority,
      cadence = excluded.cadence,
      focus = excluded.focus,
      independent_group = excluded.independent_group,
      source_layer = excluded.source_layer,
      source_family = excluded.source_family,
      language = excluded.language,
      content_roles_json = excluded.content_roles_json,
      active = 1
  `);
  const syncArticleSourceIdentity = database.prepare(`
    UPDATE articles
    SET source_name = ?,
        source_class = ?,
        independent_group = ?,
        source_layer = ?,
        source_language = ?,
        content_roles_json = ?
    WHERE source_id = ?
  `);
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec("UPDATE source_health SET active = 0");
    for (const source of sources) {
      const contentRolesJson = JSON.stringify(normalizeSourceContentRoles(source.contentRoles));
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
        source.family || null,
        source.language || null,
        contentRolesJson,
      );
      // The source catalog is authoritative for evidence identity and duties.
      // Update historical articles in the same transaction so lifecycle
      // reprojection never observes a half-corrected organization or layer.
      syncArticleSourceIdentity.run(
        source.name,
        source.class,
        source.independentGroup,
        source.layer || null,
        source.language || null,
        contentRolesJson,
        source.id,
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
      url, source_id, source_name, source_class, independent_group, source_layer, source_language, content_roles_json, engagement_count,
      original_title, original_excerpt, content_text, published_at, discovered_at,
      content_hash, relevance_score, signal_slug, concept_slug, title, summary,
      implication, topic, stage, accent, tags_json, analysis_mode, publish_decision,
      editorial_score, ai_relevance_score, novelty_score, evidence_score, event_key, candidate_concept
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      source_id = excluded.source_id,
      source_name = excluded.source_name,
      source_class = excluded.source_class,
      independent_group = excluded.independent_group,
      source_layer = excluded.source_layer,
      source_language = excluded.source_language,
      content_roles_json = excluded.content_roles_json,
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
    JSON.stringify(normalizeSourceContentRoles(article.contentRoles)),
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
      content_roles_json = ?,
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
    JSON.stringify(normalizeSourceContentRoles(article.contentRoles)),
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

export function getRecentCommunityWatchArticles(database, limit = 160) {
  return database.prepare(`
    SELECT * FROM articles
    WHERE publish_decision = 'watch'
      AND source_layer = 'community'
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

export function getModelLandscapeState(database) {
  const row = database.prepare("SELECT * FROM model_landscape WHERE id = 1").get();
  let models = [];
  try {
    const parsed = JSON.parse(row?.payload_json || "[]");
    if (Array.isArray(parsed)) models = parsed;
  } catch {}
  return {
    sourceName: row?.source_name || "Artificial Analysis",
    sourceUrl: row?.source_url || "https://artificialanalysis.ai/models",
    methodologyUrl: row?.methodology_url || "https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-1/",
    lastAttemptAt: row?.last_attempt_at || null,
    lastSuccessAt: row?.last_success_at || null,
    lastError: row?.last_error || null,
    itemCount: Number(row?.item_count || models.length),
    models,
  };
}

export function replaceModelLandscape(database, landscape) {
  const payload = JSON.stringify(landscape.models);
  database.prepare(`
    UPDATE model_landscape SET
      source_name = ?, source_url = ?, methodology_url = ?, payload_json = ?,
      last_attempt_at = ?, last_success_at = ?, last_error = NULL, item_count = ?
    WHERE id = 1
  `).run(
    landscape.sourceName,
    landscape.sourceUrl,
    landscape.methodologyUrl,
    payload,
    landscape.attemptedAt,
    landscape.attemptedAt,
    landscape.models.length,
  );
}

export function markModelLandscapeFailure(database, { attemptedAt, error }) {
  database.prepare(`
    UPDATE model_landscape SET last_attempt_at = ?, last_error = ? WHERE id = 1
  `).run(attemptedAt, error || "未知错误");
}
