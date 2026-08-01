import { AppShell } from "../components/AppShell";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const snapshot = await getRadarSnapshot();
  const { sources, status } = snapshot;
  return (
    <AppShell active="sources" status={status}>
      <header className="page-hero">
        <div><span className="mono-label">SOURCE REGISTRY / PRIVATE FIRST</span><h1>Sources</h1><p>来源权重决定发现顺序，不决定结论真假。每条重要主张仍需要独立证据和人工判断。</p></div>
        <div className="source-summary"><div><strong>{status.sourceCount}</strong><span>正式注册</span></div><div><strong>{status.healthySourceCount}</strong><span>健康来源</span></div><div><strong>{status.articleCount}</strong><span>累计文章</span></div></div>
      </header>
      <section className="source-table-wrap">
        <div className="source-table-head"><span>来源</span><span>层级</span><span>优先级</span><span>节奏</span><span>关注范围</span><span>状态</span></div>
        {sources.map((source) => (
          <a className="source-row" href={source.href} target="_blank" rel="noreferrer" key={source.name}>
            <strong>{source.name}<small>{new URL(source.href).hostname}</small></strong>
            <span>{source.class}</span><span className="source-priority">{source.priority}</span><span className="source-cadence">{source.cadence}</span><span>{source.focus}</span><span className={`source-status status-${source.status}`} title={source.lastError || source.lastSuccessAt || undefined}><i />{source.status}</span>
          </a>
        ))}
      </section>
      <aside className="source-method"><span className="mono-label">INGESTION ORDER</span><p><b>RSS / Atom</b><i>→</i><b>GitHub Releases</b><i>→</i><b>Page discovery</b><i>→</i><b>去重聚类</b><i>→</i><b>工程分析</b></p></aside>
    </AppShell>
  );
}
