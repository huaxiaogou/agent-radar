import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { ENGINEERING_THEMES, getEngineeringTheme } from "../lib/concept-themes";
import type { Concept, ConceptRevision } from "../lib/radar-data";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

function stageLabel(stage: string) {
  const normalized = stage.toLowerCase();
  if (normalized === "validated") return "Validated";
  if (normalized === "emerging") return "Emerging";
  if (normalized === "contested") return "Contested";
  if (normalized === "cooling") return "Cooling";
  if (normalized === "archived") return "Archived";
  return stage || "Candidate";
}

function changeDate(concept: Concept) {
  if (!concept.lastMeaningfulChange) return "等待首个知识修订";
  const date = new Date(concept.lastMeaningfulChange);
  if (Number.isNaN(date.getTime())) return concept.lastMeaningfulChange;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function safeHostname(href: string) {
  try { return new URL(href).hostname; } catch { return href; }
}

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function dayKey(value?: string | null) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
}

function revisionTime(revision: ConceptRevision) {
  return new Date(revision.analyzedAt || revision.createdAt || "").getTime();
}

function latestMaterialRevisionForDay(concept: Concept, targetDay: string) {
  return [...(concept.revisions || [])]
    .filter((revision) => Number(revision.revision || 0) > 1
      && revision.materialChange === true
      && dayKey(revision.analyzedAt || revision.createdAt) === targetDay)
    .sort((left, right) => revisionTime(right) - revisionTime(left)
      || Number(right.revision || 0) - Number(left.revision || 0))[0];
}

function isWithinRecentWindow(value: string | null | undefined, anchor: number, days: number) {
  const eventTime = new Date(value || "").getTime();
  return Number.isFinite(eventTime)
    && eventTime <= anchor
    && eventTime >= anchor - days * DAY_IN_MS;
}

function recentKnowledgeEventAt(concept: Concept, snapshotAt: number) {
  const eventTimes = [
    concept.createdAt,
    concept.lastMeaningfulChange,
    ...(concept.revisions || []).map((revision) => revision.analyzedAt || revision.createdAt),
    ...(concept.evidence || []).map((evidence) => evidence.publishedAt),
  ]
    .filter((value) => isWithinRecentWindow(value, snapshotAt, 7))
    .map((value) => new Date(value || "").getTime());
  return eventTimes.length ? Math.max(...eventTimes) : null;
}

function recentControversyEventAt(concept: Concept, snapshotAt: number) {
  const conflictEvidenceTimes = (concept.evidence || [])
    .filter((evidence) => (
      evidence.stance === "conflict"
      && evidence.publishDecision === "publish"
      && isWithinRecentWindow(evidence.publishedAt, snapshotAt, 7)
    ))
    .map((evidence) => new Date(evidence.publishedAt || "").getTime());
  const materialRevisionTimes = (concept.revisions || [])
    .filter((revision) => {
      const controversyChanged = revision.delta?.categories?.includes("controversies")
        || Object.hasOwn(revision.fieldDiff || {}, "controversies");
      return Number(revision.revision || 0) > 1
        && revision.materialChange === true
        && controversyChanged
        && isWithinRecentWindow(revision.analyzedAt || revision.createdAt, snapshotAt, 7);
    })
    .map((revision) => new Date(revision.analyzedAt || revision.createdAt || "").getTime());
  const eventTimes = [...conflictEvidenceTimes, ...materialRevisionTimes];
  return eventTimes.length ? Math.max(...eventTimes) : null;
}

function positiveHeatRevisionDelta(revision: ConceptRevision) {
  const difference = revision.fieldDiff?.heat || revision.fieldDiff?.temperature;
  if (!difference) return 0;
  const before = Number(difference.before);
  const after = Number(difference.after);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return Math.max(0, after - before);
}

function recentWarming(concept: Concept, snapshotAt: number) {
  const increases = (concept.revisions || []).flatMap((revision) => {
    const eventAt = revision.analyzedAt || revision.createdAt;
    const increase = positiveHeatRevisionDelta(revision);
    if (!increase || !isWithinRecentWindow(eventAt, snapshotAt, 7)) return [];
    return [{ increase, eventAt: revisionTime(revision) }];
  });
  if (!increases.length) return null;
  return {
    concept,
    totalIncrease: increases.reduce((total, item) => total + item.increase, 0),
    maxIncrease: Math.max(...increases.map((item) => item.increase)),
    latestAt: Math.max(...increases.map((item) => item.eventAt)),
  };
}

function uniqueConcepts(concepts: Concept[], limit = 3) {
  const seen = new Set<string>();
  return concepts.filter((concept) => {
    if (seen.has(concept.slug)) return false;
    seen.add(concept.slug);
    return true;
  }).slice(0, limit);
}

function LearningEntry({ category, label, concepts, empty }: {
  category: string;
  label: string;
  concepts: Concept[];
  empty: string;
}) {
  return (
    <section className="learning-entry" data-learning-category={category} aria-label={label}>
      <span>{label}</span>
      {concepts.length ? (
        <div className="learning-entry-list">
          {concepts.map((concept) => (
            <article
              data-learning-item
              data-concept-slug={concept.slug}
              data-concept-stage={concept.stage.toLowerCase()}
              key={concept.slug}
            >
              <Link href={`/concepts/${concept.slug}`}>{concept.name}</Link>
              <small>{concept.dailyDelta || concept.definition}</small>
            </article>
          ))}
        </div>
      ) : (
        <div className="learning-entry-empty" data-learning-empty>
          <b>暂无实质变化</b>
          <small>{empty}</small>
        </div>
      )}
    </section>
  );
}

function conceptsHref({ stage, theme }: { stage?: string; theme?: string }) {
  const parameters = new URLSearchParams();
  if (stage && stage !== "all") parameters.set("stage", stage);
  if (theme && theme !== "all") parameters.set("theme", theme);
  const query = parameters.toString();
  return query ? `/concepts?${query}` : "/concepts";
}

export default async function ConceptsPage({ searchParams }: { searchParams: Promise<{ stage?: string; theme?: string }> }) {
  const snapshot = await getRadarSnapshot();
  const { stage = "all", theme: requestedTheme = "all" } = await searchParams;
  const theme = requestedTheme === "all" || getEngineeringTheme(requestedTheme) ? requestedTheme : "all";
  const establishedAll = snapshot.concepts.filter((concept) => !["candidate", "archived"].includes(concept.stage.toLowerCase()));
  const established = establishedAll.filter((concept) => (
    (stage === "all" || concept.stage.toLowerCase() === stage.toLowerCase())
      && (theme === "all" || concept.themes?.includes(theme))
  ));
  const snapshotDay = dayKey(snapshot.status.generatedAt);
  const snapshotAt = new Date(snapshot.status.generatedAt).getTime();
  const newest = uniqueConcepts([...establishedAll]
    .filter((item) => dayKey(item.createdAt) === snapshotDay)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
  const revised = uniqueConcepts(establishedAll
    .map((concept) => ({ concept, revision: latestMaterialRevisionForDay(concept, snapshotDay) }))
    .filter((entry): entry is { concept: Concept; revision: ConceptRevision } => Boolean(entry.revision))
    .sort((left, right) => revisionTime(right.revision) - revisionTime(left.revision)
      || Number(right.revision.revision || 0) - Number(left.revision.revision || 0)
      || left.concept.slug.localeCompare(right.concept.slug))
    .map((entry) => entry.concept));
  const recentKnowledge = Number.isFinite(snapshotAt)
    ? establishedAll
      .map((concept) => ({ concept, eventAt: recentKnowledgeEventAt(concept, snapshotAt) }))
      .filter((entry): entry is { concept: Concept; eventAt: number } => entry.eventAt !== null)
    : [];
  const warming = Number.isFinite(snapshotAt)
    ? uniqueConcepts(establishedAll
      .map((concept) => recentWarming(concept, snapshotAt))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => right.totalIncrease - left.totalIncrease
        || right.maxIncrease - left.maxIncrease
        || right.latestAt - left.latestAt
        || left.concept.slug.localeCompare(right.concept.slug))
      .map((entry) => entry.concept))
    : [];
  const contested = Number.isFinite(snapshotAt)
    ? uniqueConcepts(establishedAll
      .map((concept) => ({ concept, eventAt: recentControversyEventAt(concept, snapshotAt) }))
      .filter((entry): entry is { concept: Concept; eventAt: number } => entry.eventAt !== null)
      .sort((left, right) => right.eventAt - left.eventAt)
      .map((entry) => entry.concept))
    : [];
  const learningPriority = uniqueConcepts([...recentKnowledge].sort((a, b) => {
    const value = (concept: Concept) => Number(concept.heat ?? concept.temperature) + (concept.dailyDelta ? 18 : 0) - Number(concept.maturity ?? 50) * .15;
    return value(b.concept) - value(a.concept) || b.eventAt - a.eventAt;
  }).map((entry) => entry.concept));

  return (
    <AppShell active="concepts" status={snapshot.status}>
      <header className="page-hero concept-knowledge-hero">
        <div>
          <span className="mono-label">ENGINEERING KNOWLEDGE / REVISION LEDGER</span>
          <h1>Concepts</h1>
          <p>把每天的新证据收敛为可追溯、可质疑、可持续修订的 AI Coding 工程知识。热度表示近期变化，成熟度表示独立证据与机制共识，两者绝不互相替代。</p>
        </div>
        <div className="concept-knowledge-state" aria-label="知识库状态">
          <strong>{establishedAll.length}</strong><span>个正式知识对象</span>
          <small>最近快照 {new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(snapshot.status.generatedAt))}</small>
        </div>
      </header>

      <section className="concept-learning-index" aria-labelledby="learning-index-title">
        <header>
          <div><span className="mono-label">TODAY&apos;S LEARNING QUEUE</span><h2 id="learning-index-title">今天值得改变的工程认知</h2></div>
          <form action="/search" role="search" className="concept-search"><label htmlFor="concept-query">搜索概念或机制</label><input id="concept-query" name="q" type="search" autoComplete="off" placeholder="例如：恢复语义、Agent Harness…" /><button type="submit">搜索</button></form>
        </header>
        <div className="learning-ledger">
          <LearningEntry category="today-new" label="今日新增" concepts={newest} empty="新概念必须先经过名称归一与来源绑定。" />
          <LearningEntry category="today-revised" label="实质修订" concepts={revised} empty="没有新证据时，不制造知识变化。" />
          <LearningEntry category="weekly-warming" label="本周升温" concepts={warming} empty="近七日尚无新的正式修订或来源证据。" />
          <LearningEntry category="weekly-controversy" label="争议" concepts={contested} empty="分歧会保留，直到新证据能够解释冲突。" />
          <LearningEntry category="learning-priority" label="学习优先" concepts={learningPriority} empty="近七日暂无新的正式证据或实质知识修订，不用历史热度填位。" />
        </div>
      </section>

      <section className="concept-catalog" id="concept-ledger" aria-labelledby="concept-ledger-title">
        <header className="concept-catalog-heading">
          <div><span className="mono-label">ESTABLISHED KNOWLEDGE / SOURCE BOUND</span><h2 id="concept-ledger-title">正式概念修订账本</h2></div>
          <nav className="lifecycle-key" aria-label="按生命周期筛选"><Link className={stage === "all" ? "active" : ""} href={conceptsHref({ theme })}>全部</Link>{["Emerging", "Validated", "Contested", "Cooling"].map((item) => <Link className={stage.toLowerCase() === item.toLowerCase() ? "active" : ""} href={conceptsHref({ stage: item.toLowerCase(), theme })} key={item}>{item}</Link>)}</nav>
        </header>
        <nav className="concept-theme-key" aria-label="按工程主题筛选">
          <Link className={theme === "all" ? "active" : ""} href={conceptsHref({ stage })}>全部主题</Link>
          {ENGINEERING_THEMES.map((item) => (
            <Link className={theme === item.id ? "active" : ""} href={conceptsHref({ stage, theme: item.id })} key={item.id}>
              {item.zhName}<small>{item.enName}</small>
            </Link>
          ))}
        </nav>
        <div className="concept-grid">
          {established.map((concept, index) => {
            const heat = Math.round(Number(concept.heat ?? concept.temperature));
            const maturity = typeof concept.maturity === "number" ? Math.round(concept.maturity) : null;
            return (
              <article className="concept-ledger-row" data-concept-slug={concept.slug} data-concept-stage={concept.stage.toLowerCase()} data-established="true" key={concept.slug}>
                <div className="concept-ledger-index"><span>C-{String(index + 1).padStart(2, "0")}</span><b>{stageLabel(concept.stage)}</b></div>
                <div className="concept-ledger-copy"><Link href={`/concepts/${concept.slug}`}>{concept.name}</Link><p>{concept.definition}</p>{Boolean(concept.themes?.length) && <div className="concept-theme-tags">{concept.themes?.map((themeId) => <span key={themeId}>{getEngineeringTheme(themeId)?.zhName || themeId}</span>)}</div>}<small>最近变化 · {concept.dailyDelta || changeDate(concept)}</small></div>
                <dl className="concept-dimensions">
                  <div><dt>热度 Heat</dt><dd>{heat}</dd><i aria-hidden="true"><span style={{ width: `${heat}%` }} /></i></div>
                  <div><dt>成熟度 Maturity</dt><dd>{maturity ?? "待回溯"}</dd>{maturity !== null && <i aria-hidden="true"><span style={{ width: `${maturity}%` }} /></i>}</div>
                </dl>
                <div className="concept-ledger-revision"><span>REV</span><b>{String(concept.revision || 0).padStart(2, "0")}</b><small>{concept.evidence?.length ?? concept.signalCount ?? 0} 条证据</small></div>
              </article>
            );
          })}
          {!established.length && <p className="concept-filter-empty">当前筛选下没有正式概念；候选不会为了填满目录而自动晋升。</p>}
        </div>
      </section>

      {snapshot.candidateConcepts.length > 0 && (
        <section className="candidate-concepts" aria-labelledby="candidate-concepts-title">
          <header>
            <div><span className="mono-label">DISCOVERY QUEUE / NOT YET CANONICAL</span><h2 id="candidate-concepts-title">待溯源概念候选</h2></div>
            <p>候选只表示材料中可能存在新的工程含义。它们不会因热度自动进入正式目录，必须补齐稳定定义、独立来源、机制差异与命名起源。</p>
          </header>
          <div className="candidate-concept-list">
            {snapshot.candidateConcepts.map((candidate) => (
              <article data-concept-stage="candidate" key={candidate.slug}>
                <div className="candidate-concept-meta"><span>{candidate.highestEvidenceLayer === "official" ? "最高证据：官方" : candidate.highestEvidenceLayer === "practitioner" ? "最高证据：实践者" : "当前仅社区"}</span><span>{candidate.signalCount} 个信号 · {candidate.evidenceCount} 条原文</span></div>
                <h3><Link href={`/concepts/${candidate.slug}`}>{candidate.name}</Link></h3><p>{candidate.definition || "待核验：它是否具有稳定定义、是否区别于已有概念，以及谁最早以当前工程含义命名。"}</p>
                <div className="candidate-source-links">{candidate.sources.map((source) => <a href={source.href} target="_blank" rel="noreferrer" key={source.href}><span>{source.layer === "official" ? "官方" : source.layer === "practitioner" ? "实践" : "社区"} · {source.originalTitle || source.name}<span aria-hidden="true"> ↗</span></span><small>{safeHostname(source.href)}</small><span className="sr-only">（在新窗口打开）</span></a>)}</div>
              </article>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
