import { AppShell } from "../components/AppShell";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const snapshot = await getRadarSnapshot();
  const { sources, status } = snapshot;
  return (
    <AppShell active="sources" status={status}>
      <header className="page-hero">
        <div><span className="mono-label">MULTILINGUAL SOURCE REGISTRY / LAYERED EVIDENCE</span><h1>Sources</h1><p>全球官方、中文团队、独立实践者与中英文社区共同进入发现链路；来源层级决定证据职责，不直接决定结论真假。</p></div>
        <div className="source-summary"><div><strong>{status.sourceCount}</strong><span>正式注册</span></div><div><strong>{status.healthySourceCount}</strong><span>健康来源</span></div><div><strong>{status.articleCount}</strong><span>累计文章</span></div></div>
      </header>
      <section className="source-table-wrap">
        <div className="source-table-head"><span>来源</span><span>证据层</span><span>优先级</span><span>节奏</span><span>关注范围</span><span>状态</span></div>
        {sources.map((source) => (
          <a className="source-row" href={source.href} target="_blank" rel="noreferrer" key={source.name}>
            <strong>{source.name}<small>{new URL(source.href).hostname}</small></strong>
            <span>{source.layer === "official" ? "官方" : source.layer === "practitioner" ? "实践者" : source.layer === "community" ? "社区" : source.class}{source.language ? ` · ${source.language === "zh" ? "中文" : "英文"}` : ""}</span><span className="source-priority">{source.priority}</span><span className="source-cadence">{source.cadence}</span><span>{source.focus}</span><span className={`source-status status-${source.status}`} title={source.lastError || source.lastSuccessAt || undefined}><i />{source.status}</span>
          </a>
        ))}
      </section>
      <aside className="source-method"><span className="mono-label">QUALITY PIPELINE</span><p><b>中英文宽召回</b><i>→</i><b>正文清洗</b><i>→</i><b>证据分层</b><i>→</i><b>LLM 编辑精排</b><i>→</i><b>事件聚类与发布</b></p></aside>
    </AppShell>
  );
}
