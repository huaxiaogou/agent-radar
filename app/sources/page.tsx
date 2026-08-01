import { AppShell } from "../components/AppShell";
import { sources } from "../lib/radar-data";

export default function SourcesPage() {
  return (
    <AppShell active="sources">
      <header className="page-hero">
        <div><span className="mono-label">SOURCE REGISTRY / PRIVATE FIRST</span><h1>Sources</h1><p>来源权重决定发现顺序，不决定结论真假。每条重要主张仍需要独立证据和人工判断。</p></div>
        <div className="source-summary"><div><strong>35</strong><span>首批注册</span></div><div><strong>10</strong><span>此页展示</span></div><div><strong>3</strong><span>证据层级</span></div></div>
      </header>
      <section className="source-table-wrap">
        <div className="source-table-head"><span>来源</span><span>层级</span><span>优先级</span><span>节奏</span><span>关注范围</span><span>状态</span></div>
        {sources.map((source) => (
          <a className="source-row" href={source.href} target="_blank" rel="noreferrer" key={source.name}>
            <strong>{source.name}<small>{new URL(source.href).hostname}</small></strong>
            <span>{source.class}</span><span className="source-priority">{source.priority}</span><span className="source-cadence">{source.cadence}</span><span>{source.focus}</span><span className="source-status"><i />{source.status}</span>
          </a>
        ))}
      </section>
      <aside className="source-method"><span className="mono-label">INGESTION ORDER</span><p><b>RSS / API</b><i>→</i><b>GitHub Releases</b><i>→</i><b>Page diff</b><i>→</i><b>Community discovery</b><i>→</i><b>X + manual import</b></p></aside>
    </AppShell>
  );
}
