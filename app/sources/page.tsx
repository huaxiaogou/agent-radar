import { AppShell } from "../components/AppShell";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

const FAMILY_LABELS = {
  official: "官方发现",
  repository: "工程仓库",
  practitioner: "实践者",
  community: "社区",
  research: "研究",
} as const;

export default async function SourcesPage() {
  const snapshot = await getRadarSnapshot();
  const { sources, status } = snapshot;
  return (
    <AppShell active="sources" status={status}>
      <header className="page-hero">
        <div><span className="mono-label">COLLECTION CHANNEL / EVIDENCE LAYER</span><h1>Sources</h1><p>采集通道回答“从哪里发现”，Evidence Layer 回答“这条证据承担什么职责”；独立来源组按组织去重，热度和来源数量都不会替代事实验证。</p></div>
        <div className="source-summary"><div><strong>{status.sourceCoverage.total.configured}</strong><span>Configured · 已配置</span></div><div><strong>{status.sourceCoverage.total.available}</strong><span>Available · 当前可用</span></div><div><strong>{status.sourceCoverage.total.effective}</strong><span>Effective · 当前快照有效</span></div></div>
      </header>
      <section className="source-coverage" aria-label="采集通道覆盖">
        <article className="is-independent-group"><span>独立来源组</span><strong>{status.sourceGroupCoverage.effective}/{status.sourceGroupCoverage.available}/{status.sourceGroupCoverage.configured}</strong><small>当前快照有效 / 可用 / 配置</small></article>
        {Object.entries(FAMILY_LABELS).map(([family, label]) => {
          const bucket = status.sourceCoverage.byFamily[family as keyof typeof FAMILY_LABELS] || { configured: 0, available: 0, effective: 0 };
          return <article key={family}><span>{label}</span><strong>{bucket.effective}/{bucket.available}/{bucket.configured}</strong><small>有效 / 可用 / 配置</small></article>;
        })}
        {(["official", "practitioner", "community"] as const).map((layer) => {
          const bucket = status.sourceCoverage.byLayer[layer] || { configured: 0, available: 0, effective: 0 };
          const label = layer === "official" ? "官方证据" : layer === "practitioner" ? "实践者证据" : "社区证据";
          return <article className="is-evidence-layer" key={`layer-${layer}`}><span>Evidence Layer · {label}</span><strong>{bucket.effective}/{bucket.available}/{bucket.configured}</strong><small>有效 / 可用 / 配置</small></article>;
        })}
      </section>
      <section className="source-table-wrap">
        <div className="source-table-head"><span>来源</span><span>采集通道</span><span>Evidence Layer · 证据层</span><span>优先级</span><span>节奏</span><span>关注范围</span><span>状态</span></div>
        {sources.map((source) => (
          <a className="source-row" href={source.href} target="_blank" rel="noreferrer" key={source.name}>
            <strong>{source.name}<small>{new URL(source.href).hostname}</small></strong>
            <span>{source.family ? FAMILY_LABELS[source.family] : "官方"}</span><span>{source.layer === "official" ? "官方" : source.layer === "practitioner" ? "实践者" : source.layer === "community" ? "社区" : source.class}{source.language ? ` · ${source.language === "zh" ? "中文" : "英文"}` : ""}</span><span className="source-priority">{source.priority}</span><span className="source-cadence">{source.cadence}</span><span>{source.focus}</span><span className={`source-status status-${source.status}`} title={source.lastError || source.lastSuccessAt || undefined}><i />{source.status}</span>
          </a>
        ))}
      </section>
      <aside className="source-method"><span className="mono-label">QUALITY PIPELINE</span><p><b>中英文宽召回</b><i>→</i><b>正文清洗</b><i>→</i><b>证据分层</b><i>→</i><b>LLM 编辑精排</b><i>→</i><b>事件聚类与发布</b></p></aside>
    </AppShell>
  );
}
