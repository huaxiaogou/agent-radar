import Link from "next/link";
import type { Signal } from "../lib/radar-data";
import { EvidencePulse } from "./EvidencePulse";

export function SignalCard({ signal, featured = false }: { signal: Signal; featured?: boolean }) {
  return (
    <article className={`signal-card accent-${signal.accent}${featured ? " featured" : ""}`}>
      <div className="card-topline">
        <span className="mono-label">{signal.eyebrow}</span>
        <span className={`stage stage-${signal.stage.toLowerCase()}`}>{signal.stage}</span>
      </div>
      <h2>{signal.title}</h2>
      <p className="signal-summary">{signal.summary}</p>
      <EvidencePulse nodes={signal.evidence} compact={!featured} />
      <div className="evidence-metrics" aria-label="证据概况">
        <span><b>{signal.evidenceCount}</b> 证据节点</span>
        <span><b>{signal.independentSources}</b> 独立来源</span>
        <span><b>{signal.confidence}</b> 结论状态</span>
      </div>
      <div className="implication">
        <span>ENGINEERING READ</span>
        <p>{signal.implication}</p>
      </div>
      <footer className="signal-footer">
        <div className="source-links">
          {signal.sources.map((source) => (
            <a href={source.href} target="_blank" rel="noreferrer" key={source.href}>{source.name}<span aria-hidden="true"> ↗</span></a>
          ))}
        </div>
        <Link href={`/concepts/${signal.conceptSlug ?? signal.slug}`} className="detail-link">打开分析 <span aria-hidden="true">→</span></Link>
      </footer>
    </article>
  );
}
