import { open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import {
  getArticleCount,
  getLatestRun,
  getModelLandscapeState,
  getPublishedArticlesForBackfill,
  getRecentArticles,
  getRecentCandidateArticles,
  getRecentCommunityWatchArticles,
  getSnapshotPath,
  getSourceHealth,
  openDatabase,
} from "./database.mjs";
import { isLlmEditorialReady } from "./editorial.mjs";

const conceptsUrl = new URL("../config/concepts.json", import.meta.url);
const modelAliasesUrl = new URL("../config/model-aliases.json", import.meta.url);

const RELATIONS = [
  { from: "Agent Manager", type: "操作", to: "Multi-agent Orchestration", note: "人的控制平面" },
  { from: "Multi-agent Orchestration", type: "约束于", to: "Graph Engineering", note: "协调策略进入执行图" },
  { from: "Graph Engineering", type: "依赖", to: "Durable Execution", note: "检查点、重试、暂停" },
  { from: "Agent Harness", type: "承载", to: "Context Engineering", note: "运行时组织可见上下文" },
  { from: "Agent Manager", type: "观察", to: "Agent Harness", note: "任务状态、审批与遥测" },
  { from: "Coding Agent", type: "运行于", to: "Agent Harness", note: "工具循环与权限边界" },
  { from: "Agent Harness", type: "连接", to: "Model Context Protocol", note: "工具与数据协议" },
];

const PLAYBOOKS = [
  { title: "从单 Agent 到 Agent Manager", description: "判断何时值得并行、如何拆边界，以及主 Agent 应保留哪些决策。", steps: 6, maturity: "可执行" },
  { title: "执行图设计检查表", description: "为节点契约、状态归属、重试、人工审批和失败恢复建立最小约束。", steps: 9, maturity: "可执行" },
  { title: "新概念溯源协议", description: "区分最早抓取、最早命名、机制先例和首次规模化采用。", steps: 7, maturity: "可执行" },
  { title: "Agent 生产证据协议", description: "用任务结果、trace、失败恢复和人工验收区分演示能力与生产能力。", steps: 8, maturity: "可执行" },
];

function dateValue(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function eventAt(row) {
  return row.published_at || row.discovered_at;
}

function recencyLabel(value, now = Date.now()) {
  const difference = Math.max(0, now - dateValue(value));
  const hours = Math.floor(difference / 3_600_000);
  if (hours < 1) return "刚刚发现";
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  if (days < 31) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export function sourceLayerFromClass(sourceClass = "") {
  if (/中文社区|英文社区|社区讨论|社区/.test(sourceClass)) return "community";
  if (/实践者|概念雷达/.test(sourceClass)) return "practitioner";
  return "official";
}

function sourceLayer(row) {
  return ["official", "practitioner", "community"].includes(row.source_layer)
    ? row.source_layer
    : sourceLayerFromClass(row.source_class);
}

function inferLanguage(row) {
  if (["zh", "en", "mixed"].includes(row.source_language)) return row.source_language;
  if (/中文/.test(row.source_class || "")) return "zh";
  if (/英文/.test(row.source_class || "")) return "en";
  return /[\u3400-\u9fff]/.test(row.original_title || row.title || "") ? "zh" : "en";
}

function layerWeight(layer) {
  return layer === "official" ? 3 : layer === "practitioner" ? 2 : 1;
}

function evidenceKind(sourceClass, layer = sourceLayerFromClass(sourceClass)) {
  if (layer === "practitioner") return "independent";
  if (layer === "community") return "origin";
  if (/项目发布|更新日志|一手工程|官方/.test(sourceClass)) return "implementation";
  return "origin";
}

function sourceMixFor(articles) {
  const groups = new Map();
  for (const article of articles) {
    const group = article.independent_group || article.source_id || article.source_name;
    const layer = sourceLayer(article);
    const previous = groups.get(group);
    if (!previous || layerWeight(layer) > layerWeight(previous)) groups.set(group, layer);
  }
  const mix = { official: 0, practitioner: 0, community: 0 };
  for (const layer of groups.values()) mix[layer] += 1;
  return mix;
}

function verificationFor(sourceMix) {
  if (sourceMix.official > 0 && sourceMix.practitioner + sourceMix.community > 0) {
    return { verificationState: "cross-verified", confidence: "较高" };
  }
  if (sourceMix.official > 0) return { verificationState: "official-only", confidence: "中等" };
  if (sourceMix.practitioner > 0) {
    return {
      verificationState: sourceMix.practitioner + sourceMix.community > 1 ? "independently-observed" : "practitioner-only",
      confidence: "中等",
    };
  }
  return { verificationState: "community-only", confidence: "待溯源" };
}

function boundedHeat(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

export function computeSignalHeat(rows, { now = Date.now() } = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const totalEngagement = safeRows.reduce((sum, row) => {
    const value = Number(row?.engagement_count || row?.engagementCount || 0);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  const ages = safeRows.map((row) => Math.max(0, Number(now) - dateValue(eventAt(row)))).filter(Number.isFinite);
  const freshestAge = ages.length ? Math.min(...ages) : Number.POSITIVE_INFINITY;
  const recentCount = ages.filter((age) => age <= 24 * 3_600_000).length;
  const independentGroups = new Set(safeRows.map((row) => row?.independent_group || row?.source_id).filter(Boolean));
  const engagement = boundedHeat((Math.log1p(totalEngagement) / Math.log1p(10_000)) * 100);
  const freshness = boundedHeat(Number.isFinite(freshestAge) ? 100 * Math.exp(-freshestAge / (72 * 3_600_000)) : 0);
  const velocity = boundedHeat(recentCount ? 30 + Math.log2(recentCount + 1) * 22 : 0);
  const participation = boundedHeat(independentGroups.size ? 18 + Math.log2(independentGroups.size + 1) * 24 : 0);
  const score = boundedHeat(engagement * 0.35 + freshness * 0.25 + velocity * 0.2 + participation * 0.2);
  const rounded = (value) => Math.round(value * 10) / 10;
  return {
    engagement: rounded(engagement),
    freshness: rounded(freshness),
    velocity: rounded(velocity),
    participation: rounded(participation),
    score: rounded(score),
  };
}

function groupSignals(rows) {
  const groups = new Map();
  for (const row of rows.filter((article) => article.publish_decision === "publish")) {
    const current = groups.get(row.signal_slug) || [];
    current.push(row);
    groups.set(row.signal_slug, current);
  }

  return [...groups.entries()].flatMap(([slug, articles]) => {
    const representativeCandidates = articles.filter(isLlmEditorialReady);
    if (!representativeCandidates.length) return [];
    const sorted = [...representativeCandidates].sort((left, right) => {
      const layerDifference = layerWeight(sourceLayer(right)) - layerWeight(sourceLayer(left));
      return layerDifference
        || Number(right.editorial_score || 0) - Number(left.editorial_score || 0)
        || Number(right.relevance_score || 0) - Number(left.relevance_score || 0)
        || dateValue(eventAt(right)) - dateValue(eventAt(left))
        || String(left.url).localeCompare(String(right.url));
    });
    const representative = sorted[0];
    const newestAt = articles.reduce((latest, article) => dateValue(eventAt(article)) > dateValue(latest) ? eventAt(article) : latest, eventAt(articles[0]));
    const sources = [];
    const seenUrls = new Set();
    const independentGroups = new Set();
    const evidence = [];
    for (const article of [...articles].sort((left, right) => {
      return layerWeight(sourceLayer(right)) - layerWeight(sourceLayer(left)) || dateValue(eventAt(right)) - dateValue(eventAt(left));
    })) {
      independentGroups.add(article.independent_group);
      if (!seenUrls.has(article.url)) {
        seenUrls.add(article.url);
        sources.push({
          sourceId: article.source_id,
          name: article.source_name,
          href: article.url,
          layer: sourceLayer(article),
          originalTitle: article.original_title,
          language: inferLanguage(article),
          publishedAt: eventAt(article),
        });
      }
      if (evidence.length < 5 && !evidence.some((node) => node.label === article.source_name)) {
        evidence.push({ label: article.source_name, kind: evidenceKind(article.source_class, sourceLayer(article)) });
      }
    }
    if (evidence.length < 2 && representative.stage === "Spark") {
      evidence.push({ label: "等待独立来源交叉验证", kind: "conflict" });
    }
    const sourceMix = sourceMixFor(articles);
    const { verificationState, confidence } = verificationFor(sourceMix);
    const representativeSource = sources.find((source) => source.href === representative.url);
    let publicSources = sources.slice(0, 8);
    if (representativeSource && !publicSources.some((source) => source.href === representativeSource.href)) {
      publicSources = [...publicSources.slice(0, 7), representativeSource];
    }
    return [{
      slug,
      eyebrow: `${representative.source_class} · ${recencyLabel(newestAt)}`,
      title: representative.title,
      summary: representative.summary,
      implication: representative.implication,
      stage: representative.stage,
      topic: representative.topic,
      recency: recencyLabel(newestAt),
      evidenceCount: articles.length,
      independentSources: independentGroups.size,
      confidence,
      verificationState,
      sourceMix,
      heat: computeSignalHeat(articles),
      accent: representative.accent,
      evidence,
      representativeSource,
      sources: publicSources,
      publishedAt: newestAt,
      discoveredAt: representative.discovered_at,
      analysisMode: representative.analysis_mode,
      conceptSlug: representative.concept_slug,
      relevanceScore: Math.max(...articles.map((article) => article.relevance_score)),
    }];
  }).sort((left, right) => {
    const verificationWeight = { "cross-verified": 4, "official-only": 3, "independently-observed": 2, "practitioner-only": 1, "community-only": 0 };
    const leftDay = Math.floor(dateValue(left.publishedAt) / 86_400_000);
    const rightDay = Math.floor(dateValue(right.publishedAt) / 86_400_000);
    return rightDay - leftDay || (verificationWeight[right.verificationState] || 0) - (verificationWeight[left.verificationState] || 0) || right.relevanceScore - left.relevanceScore || dateValue(right.publishedAt) - dateValue(left.publishedAt);
  });
}

function weekKey(value) {
  const date = new Date(value);
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day - yearStart) / 86_400_000) + 1) / 7);
  return `${day.getUTCFullYear()} / W${String(week).padStart(2, "0")}`;
}

function buildDigests(signals) {
  const weeks = new Map();
  for (const signal of signals) {
    const key = weekKey(signal.publishedAt || signal.discoveredAt);
    const values = weeks.get(key) || [];
    values.push(signal);
    weeks.set(key, values);
  }
  return [...weeks.entries()].slice(0, 8).map(([period, values]) => ({
    period,
    title: values[0].title,
    summary: `本周收录 ${values.length} 个有效信号。领先变化：${values[0].summary}`,
    signals: values.length,
    state: "自动生成",
  }));
}

async function buildConcepts(signals) {
  const catalog = JSON.parse(await readFile(conceptsUrl, "utf8"));
  const now = Date.now();
  return catalog.map((concept) => {
    const related = signals.filter((signal) => signal.conceptSlug === concept.slug);
    const recent = related.filter((signal) => now - dateValue(signal.publishedAt) <= 30 * 86_400_000).length;
    const temperature = Math.max(20, Math.min(96, concept.baseTemperature + Math.min(20, recent * 4) - (related.length ? 0 : 12)));
    return {
      slug: concept.slug,
      name: concept.name,
      definition: concept.definition,
      stage: related[0]?.stage || concept.stage,
      temperature,
      relation: concept.relation,
      signalCount: related.length,
    };
  }).sort((left, right) => right.temperature - left.temperature);
}

function mapSources(rows) {
  const now = Date.now();
  return rows.map((source) => {
    const lastSuccess = dateValue(source.last_success_at);
    const cadenceHours = Number(String(source.cadence || "").match(/^(1|2|4|8|12|24)h$/)?.[1] || 24);
    const staleAfter = cadenceHours * 1.5 * 3_600_000 + 15 * 60_000;
    let status = "待首次采集";
    if (source.last_status === "error") status = "异常";
    else if (["success", "degraded"].includes(source.last_status) && now - lastSuccess > staleAfter) status = "延迟";
    else if (source.last_status === "degraded") status = "降级";
    else if (source.last_status === "success") status = "正常";
    return {
      id: source.source_id,
      name: source.name,
      class: source.source_class,
      layer: sourceLayer(source),
      family: source.source_family || "official",
      independentGroup: source.independent_group || source.source_id,
      language: ["zh", "en", "mixed"].includes(source.language)
        ? source.language
        : (/中文/.test(source.source_class || "") ? "zh" : /英文/.test(source.source_class || "") ? "en" : "en"),
      priority: source.priority,
      cadence: source.cadence,
      status,
      focus: source.focus,
      href: source.homepage,
      lastAttemptAt: source.last_attempt_at,
      lastSuccessAt: source.last_success_at,
      lastError: source.last_error,
      itemCount: Number(source.item_count || 0),
    };
  });
}

const COVERAGE_LAYERS = ["official", "practitioner", "community"];
const COVERAGE_FAMILIES = ["official", "repository", "practitioner", "community", "research"];

function emptyCoverageBucket() {
  return { configured: 0, available: 0, effective: 0 };
}

export function buildSourceCoverage(sources, effectiveSourceIds = new Set()) {
  const byLayer = Object.fromEntries(COVERAGE_LAYERS.map((key) => [key, emptyCoverageBucket()]));
  const byFamily = Object.fromEntries(COVERAGE_FAMILIES.map((key) => [key, emptyCoverageBucket()]));
  const total = emptyCoverageBucket();
  const configuredGroups = new Set();
  const availableGroups = new Set();
  const effectiveGroups = new Set();
  for (const source of sources || []) {
    const available = ["正常", "降级"].includes(source.status);
    const effective = Boolean(source.id && effectiveSourceIds.has(source.id));
    const independentGroup = source.independentGroup || source.id;
    if (independentGroup) configuredGroups.add(independentGroup);
    if (available && independentGroup) availableGroups.add(independentGroup);
    if (effective && independentGroup) effectiveGroups.add(independentGroup);
    total.configured += 1;
    if (available) total.available += 1;
    if (effective) total.effective += 1;
    for (const [collection, key] of [[byLayer, source.layer], [byFamily, source.family]]) {
      if (!collection[key]) collection[key] = emptyCoverageBucket();
      collection[key].configured += 1;
      if (available) collection[key].available += 1;
      if (effective) collection[key].effective += 1;
    }
  }
  return {
    total,
    byLayer,
    byFamily,
    independentGroups: {
      configured: configuredGroups.size,
      available: availableGroups.size,
      effective: effectiveGroups.size,
    },
  };
}

export function normalizeSourceCoverage(coverage, legacyStatus = {}) {
  if (coverage && coverage.total && coverage.byLayer && coverage.byFamily) {
    return {
      ...coverage,
      independentGroups: coverage.independentGroups || { configured: 0, available: 0, effective: 0 },
    };
  }
  return {
    total: {
      configured: Number(legacyStatus.sourceCount || 0),
      available: Number(legacyStatus.availableSourceCount ?? (
        Number(legacyStatus.healthySourceCount || 0) + Number(legacyStatus.degradedSourceCount || 0)
      )),
      effective: 0,
    },
    byLayer: {},
    byFamily: {},
    independentGroups: { configured: 0, available: 0, effective: 0 },
  };
}

function buildDiscussionPulses(rows) {
  return rows
    .filter((row) => row.publish_decision === "watch")
    .filter((row) => sourceLayer(row) === "community")
    .filter(isLlmEditorialReady)
    .map((row) => ({
      sourceId: row.source_id,
      sourceName: row.source_name,
      href: row.url,
      originalTitle: row.original_title,
      summary: row.summary,
      implication: row.implication,
      language: inferLanguage(row),
      publishedAt: eventAt(row),
      heat: computeSignalHeat([row]),
      verificationState: "community-only",
      confidence: "待溯源",
    }));
}

function emptyLayerCounts() {
  return { total: 0, official: 0, practitioner: 0, community: 0 };
}

function countPulseRows(rows) {
  const counts = emptyLayerCounts();
  for (const row of rows) {
    counts.total += 1;
    counts[sourceLayer(row)] += 1;
  }
  return counts;
}

function buildCandidateConcepts(rows) {
  const candidates = new Map();
  for (const row of rows) {
    const name = String(row.candidate_concept || "").trim();
    if (!name || row.publish_decision === "reject") continue;
    const key = name.toLocaleLowerCase();
    const candidate = candidates.get(key) || {
      name,
      signalSlugs: new Set(),
      sources: new Map(),
      lastSeenAt: eventAt(row),
    };
    if (row.publish_decision === "publish") candidate.signalSlugs.add(row.signal_slug);
    if (!candidate.sources.has(row.url)) {
      candidate.sources.set(row.url, {
        name: row.source_name,
        href: row.url,
        layer: sourceLayer(row),
        language: inferLanguage(row),
        originalTitle: row.original_title,
        publishedAt: eventAt(row),
      });
    }
    if (dateValue(eventAt(row)) > dateValue(candidate.lastSeenAt)) candidate.lastSeenAt = eventAt(row);
    candidates.set(key, candidate);
  }

  return [...candidates.values()].map((candidate) => {
    const sources = [...candidate.sources.values()].sort((left, right) => {
      return layerWeight(right.layer) - layerWeight(left.layer)
        || dateValue(right.publishedAt) - dateValue(left.publishedAt);
    });
    return {
      name: candidate.name,
      signalCount: candidate.signalSlugs.size,
      evidenceCount: sources.length,
      highestEvidenceLayer: sources[0]?.layer || "community",
      lastSeenAt: candidate.lastSeenAt,
      sources: sources.slice(0, 8),
    };
  }).sort((left, right) => dateValue(right.lastSeenAt) - dateValue(left.lastSeenAt)
    || right.evidenceCount - left.evidenceCount
    || left.name.localeCompare(right.name));
}

async function buildModelPulses(rows) {
  let catalog;
  try {
    catalog = JSON.parse(await readFile(modelAliasesUrl, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(catalog)) return [];
  const now = Date.now();
  const day = 86_400_000;
  return catalog.flatMap((model) => {
    const aliases = [model.name, ...(model.aliases || [])].filter(Boolean).map((value) => String(value).toLowerCase());
    const matched = rows.filter((row) => row.publish_decision === "publish").filter((row) => {
      const haystack = `${row.original_title || ""} ${row.original_excerpt || ""} ${row.title || ""} ${row.summary || ""} ${row.tags_json || ""}`.toLowerCase();
      return aliases.some((alias) => haystack.includes(alias));
    }).sort((left, right) => dateValue(eventAt(right)) - dateValue(eventAt(left)));
    const days7Rows = matched.filter((row) => now - dateValue(eventAt(row)) >= 0 && now - dateValue(eventAt(row)) <= 7 * day);
    const days30Rows = matched.filter((row) => now - dateValue(eventAt(row)) >= 0 && now - dateValue(eventAt(row)) <= 30 * day);
    if (!days30Rows.length) return [];
    return [{
      modelId: model.modelId,
      name: model.name,
      windows: {
        days7: countPulseRows(days7Rows),
        days30: countPulseRows(days30Rows),
      },
      sources: days30Rows.slice(0, 8).map((row) => ({
        name: row.source_name,
        href: row.url,
        layer: sourceLayer(row),
        language: inferLanguage(row),
        originalTitle: row.original_title,
        publishedAt: eventAt(row),
      })),
    }];
  }).sort((left, right) => right.windows.days7.total - left.windows.days7.total || right.windows.days30.total - left.windows.days30.total || left.name.localeCompare(right.name));
}

export async function buildSnapshot(database) {
  const articleRows = getRecentArticles(database, Number(process.env.RADAR_SNAPSHOT_ARTICLES || 320));
  const candidateRows = getRecentCandidateArticles(database, Number(process.env.RADAR_SNAPSHOT_CANDIDATES || 120));
  const discussionRows = getRecentCommunityWatchArticles(database, Number(process.env.RADAR_SNAPSHOT_DISCUSSIONS || 160));
  const signals = groupSignals(articleRows).slice(0, Number(process.env.RADAR_SNAPSHOT_SIGNALS || 80));
  const discussionPulses = buildDiscussionPulses(discussionRows);
  const sources = mapSources(getSourceHealth(database));
  const effectiveSourceIds = new Set([
    ...signals.flatMap((signal) => signal.sources).map((source) => source.sourceId),
    ...discussionPulses.map((pulse) => pulse.sourceId),
  ].filter(Boolean));
  const coverage = buildSourceCoverage(sources, effectiveSourceIds);
  const sourceCoverage = { total: coverage.total, byLayer: coverage.byLayer, byFamily: coverage.byFamily };
  const latestRun = getLatestRun(database);
  const successfulRun = database.prepare("SELECT * FROM runs WHERE status IN ('success', 'partial') ORDER BY id DESC LIMIT 1").get() || null;
  const analysisModes = new Set(articleRows.map((article) => article.analysis_mode));
  const analysisMode = analysisModes.size > 1
    ? "mixed"
    : analysisModes.values().next().value || "rules";
  const lastSuccessfulAt = successfulRun?.finished_at || null;
  const configuredProvider = latestRun?.configured_provider || "rules";
  const runAnalysisMode = latestRun?.analysis_mode || "none";
  const modelLandscapeState = getModelLandscapeState(database);
  const publicSignals = signals.map((signal) => {
    const publicSignal = {
      ...signal,
      sources: signal.sources.map((source) => {
        const publicSource = { ...source };
        delete publicSource.sourceId;
        return publicSource;
      }),
      representativeSource: signal.representativeSource
        ? { ...signal.representativeSource }
        : signal.representativeSource,
    };
    if (publicSignal.representativeSource) delete publicSignal.representativeSource.sourceId;
    delete publicSignal.relevanceScore;
    return publicSignal;
  });
  return {
    version: 1,
    status: {
      mode: articleRows.length ? "live" : "seed",
      generatedAt: new Date().toISOString(),
      lastRunAt: latestRun?.finished_at || null,
      lastSuccessfulAt,
      runStatus: latestRun?.status || "never",
      analysisMode,
      configuredProvider,
      runAnalysisMode,
      sourceCount: sources.length,
      healthySourceCount: sources.filter((source) => source.status === "正常").length,
      degradedSourceCount: sources.filter((source) => source.status === "降级").length,
      availableSourceCount: sources.filter((source) => ["正常", "降级"].includes(source.status)).length,
      sourceCoverage,
      sourceGroupCoverage: coverage.independentGroups,
      signalCount: signals.length,
      articleCount: getArticleCount(database),
      stale: !lastSuccessfulAt || Date.now() - dateValue(lastSuccessfulAt) > 12 * 3_600_000,
    },
    signals: publicSignals,
    discussionPulses,
    concepts: await buildConcepts(signals),
    candidateConcepts: buildCandidateConcepts(candidateRows),
    modelPulses: await buildModelPulses(articleRows),
    modelLandscape: {
      ...modelLandscapeState,
      stale: !modelLandscapeState.lastSuccessAt || Date.now() - dateValue(modelLandscapeState.lastSuccessAt) > 48 * 3_600_000,
    },
    sources,
    relations: RELATIONS,
    playbooks: PLAYBOOKS,
    digests: buildDigests(signals),
  };
}

export function getPublicEditorialBacklog(database) {
  return getPublishedArticlesForBackfill(database).filter((article) => !isLlmEditorialReady(article));
}

export function assertPublicEditorialReady(database) {
  const backlog = getPublicEditorialBacklog(database);
  if (!backlog.length) return;
  const preview = backlog.slice(0, 5).map((article) => article.url).join("、");
  throw new Error(`公开中文编辑 backlog 未就绪（${backlog.length} 条），快照发布已阻断：${preview}`);
}

export async function writeSnapshotAtomic(snapshot) {
  const readinessDatabase = openDatabase();
  try {
    assertPublicEditorialReady(readinessDatabase);
  } finally {
    readinessDatabase.close();
  }
  const target = getSnapshotPath();
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
    const directory = await open(dirname(target), "r");
    await directory.sync();
    await directory.close();
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
