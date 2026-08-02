import type { Metadata } from "next";
import { AppShell } from "../components/AppShell";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "社区讨论",
  description: "追踪中文与英文 AI Coding / Agent 社区的工程讨论，并保留证据层级与原文。",
};

function inferredLanguage(value: string) {
  return /[\u3400-\u9fff]/.test(value) ? "zh" : "en";
}

function publishedLabel(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function DiscussionsPage() {
  const snapshot = await getRadarSnapshot();
  const seen = new Set<string>();
  const pulseDiscussions = snapshot.discussionPulses.flatMap((pulse) => {
    if (seen.has(pulse.href)) return [];
    seen.add(pulse.href);
    return [{
      name: pulse.sourceName,
      href: pulse.href,
      originalTitle: pulse.originalTitle,
      language: pulse.language,
      publishedAt: pulse.publishedAt,
      summary: pulse.summary,
      implication: pulse.implication,
      heat: pulse.heat,
      verificationState: pulse.verificationState,
      confidence: pulse.confidence,
    }];
  });
  const signalDiscussions = snapshot.signals.flatMap((signal) => signal.sources
    .filter((source) => source.layer === "community")
    .flatMap((source) => {
      if (seen.has(source.href)) return [];
      seen.add(source.href);
      const originalTitle = source.originalTitle || signal.title;
      return [{
        ...source,
        originalTitle,
        language: source.language || inferredLanguage(originalTitle),
        publishedAt: source.publishedAt || signal.publishedAt,
        summary: signal.summary,
        implication: signal.implication,
        heat: source.heat || signal.heat,
        verificationState: signal.verificationState || "community-only",
        confidence: signal.verificationState === "community-only" ? "待溯源" : "中等",
      }];
    }));
  const discussions = [...pulseDiscussions, ...signalDiscussions]
    .sort((left, right) => new Date(right.publishedAt || 0).getTime()
      - new Date(left.publishedAt || 0).getTime());

  const chineseCount = discussions.filter((discussion) => discussion.language === "zh").length;
  const englishCount = discussions.length - chineseCount;

  return (
    <AppShell active="discussions" status={snapshot.status}>
      <header className="page-hero discussion-hero">
        <div>
          <span className="mono-label">BILINGUAL COMMUNITY PULSE / DISCOVERY, NOT TRUTH</span>
          <h1>社区讨论</h1>
          <p>同时监听中文与英文开发者社区。讨论热度用于发现新问题和失败模式，事实判断仍回到官方与独立实践证据。</p>
        </div>
        <div className="discussion-counts" aria-label="社区讨论语言分布">
          <div><strong>{chineseCount}</strong><span>中文讨论</span></div>
          <div><strong>{englishCount}</strong><span>英文讨论</span></div>
        </div>
      </header>

      <section className="evidence-layers" aria-labelledby="evidence-layers-title">
        <div><span className="mono-label">EVIDENCE LAYERS</span><h2 id="evidence-layers-title">同一主题，三种证据职责</h2></div>
        <ol>
          <li><b>官方</b><span>确认产品、协议、版本与事实变化</span></li>
          <li><b>实践者</b><span>解释机制、工程取舍与真实落地</span></li>
          <li><b>社区</b><span>暴露升温、争议、故障和待验证假设</span></li>
        </ol>
      </section>

      {discussions.length ? (
        <section className="discussion-stream" aria-label="最新社区讨论">
          {discussions.map((discussion) => (
            <article
              className="discussion-card"
              data-discussion-language={discussion.language}
              data-source-layer="community"
              data-heat-score={discussion.heat?.score ?? 0}
              key={discussion.href}
            >
              <header>
                <span className="discussion-language">{discussion.language === "zh" ? "中文" : "ENGLISH"}</span>
                <span>{discussion.name}</span>
                {publishedLabel(discussion.publishedAt) && (
                  <time dateTime={discussion.publishedAt}>
                    {publishedLabel(discussion.publishedAt)} CST
                  </time>
                )}
                <b>社区观察 · {discussion.confidence}</b>
              </header>
              <h2 lang={discussion.language === "zh" ? "zh-CN" : "en"}>{discussion.originalTitle}</h2>
              <p>{discussion.summary}</p>
              <div className="discussion-heat" aria-label={`热度 ${discussion.heat?.score ?? 0}`}>
                <strong>热度 {discussion.heat?.score ?? 0}</strong>
                <span>互动 {discussion.heat?.engagement ?? 0}</span>
                <span>新鲜度 {discussion.heat?.freshness ?? 0}</span>
                <span>独立来源广度 {discussion.heat?.participation ?? 0}</span>
                <b>{discussion.verificationState === "community-only" ? "待溯源" : "待交叉验证"}</b>
              </div>
              <div className="discussion-read">
                <span><small>RADAR READ</small>{discussion.implication}</span>
                <a href={discussion.href} target="_blank" rel="noreferrer"><span>打开社区原文 <span aria-hidden="true">↗</span></span><small>{new URL(discussion.href).hostname}</small><span className="sr-only">（在新窗口打开）</span></a>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="discussion-empty" aria-live="polite">
          <span className="mono-label">WAITING FOR FIRST PULSE</span>
          <h2>等待下一次社区采集</h2>
          <p>社区源已进入每小时调度、按来源 cadence 采集的链路。首条通过相关性、证据分层和工程分析的讨论会出现在这里。</p>
        </section>
      )}
    </AppShell>
  );
}
