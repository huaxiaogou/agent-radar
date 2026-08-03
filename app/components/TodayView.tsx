"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RadarSnapshot } from "../lib/radar-data";
import { AppShell } from "./AppShell";
import { SignalCard } from "./SignalCard";

const filters = ["全部", "概念", "产品", "工程", "迁移"] as const;

function observationParts(value: string) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "--";
  return { date: `${get("month")}·${get("day")}`, time: `${get("hour")}:${get("minute")} CST` };
}

export function TodayView({ initialTopic, snapshot }: { initialTopic?: string; snapshot: RadarSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const { concepts, signals, status } = snapshot;
  const conceptSlugs = useMemo(() => new Set(concepts
    .filter((concept) => concept.stage.toLowerCase() !== "candidate")
    .map((concept) => concept.slug)), [concepts]);
  const filter = filters.find((item) => item === initialTopic) ?? "全部";
  const filtered = useMemo(
    () => signals.filter((signal) => filter === "全部" || signal.topic === filter),
    [filter, signals],
  );
  const lead = filtered[0];
  const rest = filtered.slice(1);
  const observedAt = status.lastSuccessfulAt || status.generatedAt;
  const observed = observationParts(observedAt);

  function selectFilter(nextFilter: (typeof filters)[number]) {
    const nextParams = new URLSearchParams(window.location.search);
    if (nextFilter === "全部") nextParams.delete("topic");
    else nextParams.set("topic", nextFilter);
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <AppShell active="today" status={status}>
      <section className="radar-intro">
        <div className="intro-copy">
          <p className="mono-label">RADAR WINDOW / LIVE INGESTION</p>
          <h1>今天，不追新闻。<br /><span>追踪工程范式的位移。</span></h1>
          <p className="intro-deck">从官方工程博客、项目发布和一线实践者持续采集，将新变化还原为来源、机制、采用证据与工程边界。</p>
        </div>
        <time className="observation-stamp" dateTime={observedAt} aria-label={`来源最后成功采集于 ${observed.date} ${observed.time}`}>
          <span>LAST VERIFIED</span>
          <strong>{observed.date}</strong>
          <b>{observed.time}</b>
          <small>{status.healthySourceCount}/{status.sourceCount} sources healthy</small>
        </time>
      </section>

      <section className="filter-bar" aria-label="信号筛选">
        <div className="filter-group">
          {filters.map((item) => (
            <button type="button" key={item} aria-pressed={filter === item} onClick={() => selectFilter(item)}>
              {filter === item && <span aria-hidden="true">✓</span>}{item}
            </button>
          ))}
        </div>
        <span className="result-count" aria-live="polite">{filtered.length} 条有效信号</span>
      </section>

      {lead ? (
        <div className="radar-layout">
          <div className="signal-column">
            <SignalCard signal={lead} conceptAvailable={Boolean(lead.conceptSlug && conceptSlugs.has(lead.conceptSlug))} featured />
            {rest.length > 0 && (
              <section className="stream-section">
                <div className="section-heading">
                  <div><span className="mono-label">SIGNAL STREAM</span><h2>继续观察</h2></div>
                  <Link href="/signals">查看全部 <span aria-hidden="true">→</span></Link>
                </div>
                <div className="signal-stream">
                  {rest.map((signal) => <SignalCard signal={signal} conceptAvailable={Boolean(signal.conceptSlug && conceptSlugs.has(signal.conceptSlug))} key={signal.slug} />)}
                </div>
              </section>
            )}
          </div>

          <aside className="context-column" aria-label="趋势上下文">
            <section className="context-panel emerging-panel">
              <div className="panel-heading"><span className="mono-label">EMERGING</span><b>概念升温</b></div>
              <ol className="concept-rank">
                {concepts.slice(0, 5).map((concept, index) => (
                  <li key={concept.slug}>
                    <span className="rank">0{index + 1}</span>
                    <div>
                      <Link href={`/concepts/${concept.slug}`}>{concept.name}</Link>
                      <small>{concept.relation}</small>
                      <span className="heat-track"><i style={{ width: `${concept.temperature}%` }} /></span>
                    </div>
                    <b>{concept.temperature}</b>
                  </li>
                ))}
              </ol>
              <Link href="/concepts" className="panel-link">打开概念索引 <span aria-hidden="true">→</span></Link>
            </section>

            <section className="context-panel source-panel">
              <div className="panel-heading"><span className="mono-label">SOURCE LAYERS</span><b>证据结构</b></div>
              <div className="source-layer"><span>一手工程 / 官方</span><b>优先</b></div>
              <div className="source-layer"><span>实践者 / 独立分析</span><b>交叉</b></div>
              <div className="source-layer"><span>社区 / 搜索发现</span><b>候选</b></div>
              <p>转载不会增加独立来源数。所有“首次”“取代”“生产验证”表述进入人工审核。</p>
              <Link href="/sources" className="panel-link">查看来源健康度 <span aria-hidden="true">→</span></Link>
            </section>

            <section className="watch-note">
              <span className="mono-label">WATCH RULE / 07</span>
              <p>检测项目从活跃开发转为维护、归档或出现官方继任者。</p>
              <b>AutoGen → Agent Framework</b>
            </section>
          </aside>
        </div>
      ) : (
        <section className="empty-state">
          <span className="mono-label">NO MATCH</span>
          <h2>当前筛选没有有效信号</h2>
          <p>换一个主题，或前往 Signals 查看完整事件流。</p>
          <button type="button" onClick={() => selectFilter("全部")}>显示全部</button>
        </section>
      )}
    </AppShell>
  );
}
