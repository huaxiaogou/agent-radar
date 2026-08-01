"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { concepts, signals } from "../lib/radar-data";
import { AppShell } from "./AppShell";
import { SignalCard } from "./SignalCard";

const filters = ["全部", "概念", "产品", "工程", "迁移"] as const;

export function TodayView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedFilter = searchParams.get("topic");
  const filter = filters.find((item) => item === requestedFilter) ?? "全部";
  const filtered = useMemo(
    () => signals.filter((signal) => filter === "全部" || signal.topic === filter),
    [filter],
  );
  const lead = filtered[0];
  const rest = filtered.slice(1);

  function selectFilter(nextFilter: (typeof filters)[number]) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextFilter === "全部") nextParams.delete("topic");
    else nextParams.set("topic", nextFilter);
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <AppShell active="today">
      <section className="radar-intro">
        <div className="intro-copy">
          <p className="mono-label">RADAR WINDOW / CURATED REPLAY</p>
          <h1>今天，不追新闻。<br /><span>追踪工程范式的位移。</span></h1>
          <p className="intro-deck">将热词还原为来源、机制、采用证据和工程边界。首版以真实来源回放验证信息架构，实时采集尚未启用。</p>
        </div>
        <time className="observation-stamp" dateTime="2026-08-01T10:18:00+08:00" aria-label="来源最后核验于 2026 年 8 月 1 日 10 点 18 分，中国标准时间">
          <span>LAST VERIFIED</span>
          <strong>08·01</strong>
          <b>10:18 CST</b>
          <small>35 sources registered</small>
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
        <span className="result-count" aria-live="polite">{filtered.length} 条回放信号</span>
      </section>

      {lead ? (
        <div className="radar-layout">
          <div className="signal-column">
            <SignalCard signal={lead} featured />
            {rest.length > 0 && (
              <section className="stream-section">
                <div className="section-heading">
                  <div><span className="mono-label">SIGNAL STREAM</span><h2>继续观察</h2></div>
                  <Link href="/signals">查看全部 <span aria-hidden="true">→</span></Link>
                </div>
                <div className="signal-stream">
                  {rest.map((signal) => <SignalCard signal={signal} key={signal.slug} />)}
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
          <h2>当前筛选没有回放信号</h2>
          <p>换一个主题，或前往 Signals 查看完整事件流。</p>
          <button type="button" onClick={() => selectFilter("全部")}>显示全部</button>
        </section>
      )}
    </AppShell>
  );
}
