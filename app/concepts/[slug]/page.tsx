import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { EvidencePulse } from "../../components/EvidencePulse";
import { getRadarSnapshot } from "../../lib/radar-store";

export const dynamic = "force-dynamic";

export default async function ConceptDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getRadarSnapshot();
  const signal = snapshot.signals.find((item) => item.slug === slug);
  const concept = snapshot.concepts.find((item) => item.slug === slug);
  if (!signal && !concept) notFound();
  const title = concept?.name ?? signal?.title.split("：")[0] ?? "Concept";
  const definition = concept?.definition ?? signal?.summary ?? "";
  const nodes = signal?.evidence ?? [
    { label: "概念定义", kind: "origin" as const },
    { label: "工程实践", kind: "implementation" as const },
    { label: "交叉验证", kind: "independent" as const },
  ];

  return (
    <AppShell active="concepts" status={snapshot.status}>
      <div className="concept-detail">
        <nav className="breadcrumb" aria-label="面包屑"><Link href="/concepts">Concepts</Link><span>/</span><span>{title}</span></nav>
        <header className="concept-title">
          <div><span className="mono-label">CONCEPT BRIEF / REVISION 01</span><h1>{title}</h1><p>{definition}</p></div>
          <div className="maturity-dial"><span>MATURITY</span><strong>{concept?.temperature ?? 74}</strong><small>{concept?.stage ?? signal?.stage}</small></div>
        </header>

        <section className="detail-section evidence-timeline">
          <div className="detail-label"><span>01</span><b>证据脉冲</b><small>起源不是最早抓取</small></div>
          <div><EvidencePulse nodes={nodes} />
            <div className="timeline-labels">{nodes.map((node, index) => <span key={node.label}><b>0{index + 1}</b>{node.label}</span>)}</div>
          </div>
        </section>

        <section className="detail-section novelty-section">
          <div className="detail-label"><span>02</span><b>新颖性拆解</b><small>标签与机制分开</small></div>
          <div className="novelty-grid">
            <div><span>LABEL NOVELTY</span><strong>高</strong><p>词汇与叙事方式处于升温阶段。</p></div>
            <div><span>MECHANISM NOVELTY</span><strong>中</strong><p>执行图、状态机和恢复机制已有先例，组合方式正在变化。</p></div>
            <div><span>ADOPTION NOVELTY</span><strong>中高</strong><p>产品与框架开始把它作为显式工作面。</p></div>
          </div>
        </section>

        <section className="detail-section engineering-section">
          <div className="detail-label"><span>03</span><b>工程含义</b><small>从热词到动作</small></div>
          <div>
            <h2>{signal?.implication ?? "把概念写入系统边界、验证动作和运行证据。"}</h2>
            <div className="do-grid"><div><span>适合</span><p>长任务、多阶段状态、并行执行、需要人工审批或失败恢复的流程。</p></div><div><span>不适合</span><p>一次工具调用即可完成、没有持久状态、故障成本很低的简单任务。</p></div></div>
          </div>
        </section>

        <section className="detail-section source-section">
          <div className="detail-label"><span>04</span><b>来源</b><small>事实与推断分层</small></div>
          <div className="source-citations">
            {(signal?.sources ?? []).map((source, index) => <a href={source.href} target="_blank" rel="noreferrer" key={source.href}><span>0{index + 1}</span><b>{source.name}</b><small>{new URL(source.href).hostname}</small><i aria-hidden="true">↗</i></a>)}
            {!signal && <p className="muted-note">此概念页目前只有定义回放，等待加入绑定证据。</p>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
