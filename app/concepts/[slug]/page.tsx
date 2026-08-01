import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { EvidencePulse } from "../../components/EvidencePulse";
import { getRadarSnapshot } from "../../lib/radar-store";

export const dynamic = "force-dynamic";

export default async function ConceptDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getRadarSnapshot();
  const exactSignal = snapshot.signals.find((item) => item.slug === slug);
  const conceptSlug = exactSignal?.conceptSlug ?? slug;
  const concept = snapshot.concepts.find((item) => item.slug === conceptSlug);
  const relatedSignals = snapshot.signals.filter((item) => (
    item.conceptSlug === conceptSlug ||
    item.slug === slug ||
    item.slug === conceptSlug ||
    item.slug.startsWith(`${conceptSlug}-`)
  ));
  const signal = exactSignal ?? relatedSignals[0];
  if (!signal && !concept) notFound();

  const title = concept?.name ?? signal?.title.split("：")[0] ?? "Concept";
  const definition = concept?.definition ?? signal?.summary ?? "";
  const nodes = relatedSignals
    .flatMap((item) => item.evidence)
    .filter((node, index, values) => values.findIndex((candidate) => candidate.label === node.label && candidate.kind === node.kind) === index)
    .slice(0, 5);
  const signalRows = relatedSignals.map((item) => ({
    item,
    sources: item.sources
      .filter((source, index, values) => values.findIndex((candidate) => candidate.href === source.href) === index),
  }));
  const evidenceHeat = concept?.temperature ?? Math.min(96, 30 + relatedSignals.reduce((total, item) => total + item.evidenceCount, 0) * 8);

  return (
    <AppShell active="concepts" status={snapshot.status}>
      <div className="concept-detail">
        <nav className="breadcrumb" aria-label="面包屑"><Link href="/concepts">Concepts</Link><span>/</span><span>{title}</span></nav>
        <header className="concept-title">
          <div><span className="mono-label">CONCEPT BRIEF / REVISION 01</span><h1>{title}</h1><p>{definition}</p></div>
          <div className="maturity-dial"><span>EVIDENCE HEAT</span><strong>{evidenceHeat}</strong><small>{concept?.stage ?? signal?.stage ?? "待采集"}</small></div>
        </header>

        <section className="detail-section evidence-timeline">
          <div className="detail-label"><span>01</span><b>证据脉冲</b><small>起源不是最早抓取</small></div>
          {nodes.length ? <div><EvidencePulse nodes={nodes} />
            <div className="timeline-labels">{nodes.map((node, index) => <span key={`${node.kind}-${node.label}`}><b>{String(index + 1).padStart(2, "0")}</b>{node.label}</span>)}</div>
          </div> : <p className="muted-note">当前只有概念目录定义，尚未形成可引用的证据脉冲。</p>}
        </section>

        <section className="detail-section related-signal-section">
          <div className="detail-label"><span>02</span><b>相关中文信号</b><small>由采集文章聚类生成</small></div>
          <div className="related-signal-list">
            {signalRows.map(({ item, sources }) => <article key={item.slug}>
              <header><span className="stage">{item.stage}</span><small>{item.recency} · {item.analysisMode === "deepseek" ? "DeepSeek 分析" : item.analysisMode === "openai" ? "OpenAI 分析" : item.analysisMode === "rules" ? "规则分析" : "编辑分析"}</small></header>
              <h2>{item.title}</h2>
              <p>{item.summary}</p>
              <footer className="signal-source-map">
                <b>本条来源</b>
                {sources.map((source) => <a href={source.href} target="_blank" rel="noreferrer" key={source.href}>{source.name}<small>{new URL(source.href).hostname}</small><span aria-hidden="true">↗</span><i className="sr-only">（在新窗口打开）</i></a>)}
              </footer>
            </article>)}
            {!relatedSignals.length && <p className="muted-note">尚无与此概念绑定的采集文章。</p>}
          </div>
        </section>

        <section className="detail-section engineering-section">
          <div className="detail-label"><span>03</span><b>工程含义</b><small>从热词到动作</small></div>
          <div className="engineering-read-list">
            {relatedSignals.map((item, index) => <article key={item.slug}><span>{String(index + 1).padStart(2, "0")} / ENGINEERING READ</span><h2>{item.implication}</h2><small>对应信号：{item.title}</small></article>)}
            {!relatedSignals.length && <p className="muted-note">没有来源支撑时不生成通用“适合 / 不适合”判断。</p>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
