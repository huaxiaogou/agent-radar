import Link from "next/link";
import type { Signal } from "../lib/radar-data";
import { EvidencePulse } from "./EvidencePulse";

export function SignalCard({ signal, featured = false }: { signal: Signal; featured?: boolean }) {
  const analysisHref = `/concepts/${signal.conceptSlug ?? signal.slug}`;
  const primarySource = signal.representativeSource ?? signal.sources[0];
  const verificationCopy = signal.verificationState === "cross-verified"
    ? "官方 + 独立来源交叉验证"
    : signal.verificationState === "community-only"
      ? "社区观察 · 等待交叉验证"
      : signal.verificationState === "official-only"
        ? "官方已确认 · 等待独立验证"
        : signal.verificationState === "independently-observed"
          ? "多位实践者独立观察"
          : signal.verificationState === "practitioner-only"
            ? "实践观察 · 等待更多来源"
          : signal.confidence;
  return (
    <article className={`signal-card accent-${signal.accent}${featured ? " featured" : ""}`}>
      <div className="card-topline">
        <span className="mono-label">{signal.eyebrow}</span>
        <span className={`stage stage-${signal.stage.toLowerCase()}`}>{signal.stage}</span>
      </div>
      <h2>{signal.title}</h2>
      <p className="signal-summary">{signal.summary}</p>
      <nav className="signal-summary-actions" aria-label={`${signal.title} 摘要操作`}>
        <Link href={analysisHref}>查看完整分析 <span aria-hidden="true">→</span></Link>
        {primarySource && (
          <a href={primarySource.href} target="_blank" rel="noopener noreferrer">
            阅读原文 <span aria-hidden="true">↗</span>
          </a>
        )}
      </nav>
      <EvidencePulse nodes={signal.evidence} compact={!featured} />
      <div className="evidence-metrics" aria-label="证据概况">
        <span><b>{signal.evidenceCount}</b> 证据节点</span>
        <span><b>{signal.independentSources}</b> 独立来源</span>
        <span><b>{verificationCopy}</b> 结论状态</span>
        {signal.sourceMix && <span><b>官 {signal.sourceMix.official} · 实 {signal.sourceMix.practitioner} · 社 {signal.sourceMix.community}</b> 来源结构</span>}
      </div>
      <div className="implication">
        <span>ENGINEERING READ</span>
        <p>{signal.implication}</p>
      </div>
      <footer className="signal-footer">
        <div className="source-links">
          {signal.sources.map((source) => (
            <a href={source.href} target="_blank" rel="noreferrer" data-source-layer={source.layer} key={source.href}>
              {source.layer === "official" ? "官方" : source.layer === "practitioner" ? "实践" : source.layer === "community" ? "社区" : "来源"} · {source.name}<span aria-hidden="true"> ↗</span>
            </a>
          ))}
        </div>
      </footer>
    </article>
  );
}
