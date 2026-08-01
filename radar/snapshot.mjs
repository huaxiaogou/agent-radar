import { open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { getArticleCount, getLatestRun, getRecentArticles, getSnapshotPath, getSourceHealth } from "./database.mjs";

const conceptsUrl = new URL("../config/concepts.json", import.meta.url);

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

function evidenceKind(sourceClass) {
  if (/实践者|概念雷达/.test(sourceClass)) return "independent";
  if (/项目发布|更新日志|一手工程/.test(sourceClass)) return "implementation";
  return "origin";
}

function groupSignals(rows) {
  const groups = new Map();
  for (const row of rows) {
    const current = groups.get(row.signal_slug) || [];
    current.push(row);
    groups.set(row.signal_slug, current);
  }

  return [...groups.entries()].map(([slug, articles]) => {
    const sorted = [...articles].sort((left, right) => {
      const analysisWeight = Number(right.analysis_mode === "openai") - Number(left.analysis_mode === "openai");
      return analysisWeight || right.relevance_score - left.relevance_score || dateValue(eventAt(right)) - dateValue(eventAt(left));
    });
    const representative = sorted[0];
    const newestAt = articles.reduce((latest, article) => dateValue(eventAt(article)) > dateValue(latest) ? eventAt(article) : latest, eventAt(articles[0]));
    const sources = [];
    const seenUrls = new Set();
    const independentGroups = new Set();
    const evidence = [];
    for (const article of [...articles].sort((left, right) => dateValue(eventAt(left)) - dateValue(eventAt(right)))) {
      independentGroups.add(article.independent_group);
      if (!seenUrls.has(article.url)) {
        seenUrls.add(article.url);
        sources.push({ name: article.source_name, href: article.url });
      }
      if (evidence.length < 5 && !evidence.some((node) => node.label === article.source_name)) {
        evidence.push({ label: article.source_name, kind: evidenceKind(article.source_class) });
      }
    }
    if (evidence.length < 2 && representative.stage === "Spark") {
      evidence.push({ label: "等待独立来源交叉验证", kind: "conflict" });
    }
    const official = articles.some((article) => /一手|原始源|项目发布|更新日志/.test(article.source_class));
    const confidence = independentGroups.size >= 2 ? "较高" : official ? "中等" : "待溯源";
    return {
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
      accent: representative.accent,
      evidence,
      sources: sources.slice(0, 8),
      publishedAt: newestAt,
      discoveredAt: representative.discovered_at,
      analysisMode: representative.analysis_mode,
      conceptSlug: representative.concept_slug,
      relevanceScore: Math.max(...articles.map((article) => article.relevance_score)),
    };
  }).sort((left, right) => {
    const leftDay = Math.floor(dateValue(left.publishedAt) / 86_400_000);
    const rightDay = Math.floor(dateValue(right.publishedAt) / 86_400_000);
    return rightDay - leftDay || right.relevanceScore - left.relevanceScore || dateValue(right.publishedAt) - dateValue(left.publishedAt);
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
    let status = "待首次采集";
    if (source.last_status === "error") status = "异常";
    else if (source.last_status === "success" && now - lastSuccess > 24 * 3_600_000) status = "延迟";
    else if (source.last_status === "success") status = "正常";
    return {
      id: source.source_id,
      name: source.name,
      class: source.source_class,
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

export async function buildSnapshot(database) {
  const articleRows = getRecentArticles(database, Number(process.env.RADAR_SNAPSHOT_ARTICLES || 320));
  const signals = groupSignals(articleRows).slice(0, Number(process.env.RADAR_SNAPSHOT_SIGNALS || 80));
  const sources = mapSources(getSourceHealth(database));
  const latestRun = getLatestRun(database);
  const successfulRun = database.prepare("SELECT * FROM runs WHERE status IN ('success', 'partial') ORDER BY id DESC LIMIT 1").get() || null;
  const analysisModes = new Set(articleRows.map((article) => article.analysis_mode));
  const lastSuccessfulAt = successfulRun?.finished_at || null;
  const publicSignals = signals.map((signal) => {
    const publicSignal = { ...signal };
    delete publicSignal.conceptSlug;
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
      analysisMode: analysisModes.size > 1 ? "mixed" : analysisModes.has("openai") ? "openai" : "rules",
      sourceCount: sources.length,
      healthySourceCount: sources.filter((source) => source.status === "正常").length,
      signalCount: signals.length,
      articleCount: getArticleCount(database),
      stale: !lastSuccessfulAt || Date.now() - dateValue(lastSuccessfulAt) > 12 * 3_600_000,
    },
    signals: publicSignals,
    concepts: await buildConcepts(signals),
    sources,
    relations: RELATIONS,
    playbooks: PLAYBOOKS,
    digests: buildDigests(signals),
  };
}

export async function writeSnapshotAtomic(snapshot) {
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
