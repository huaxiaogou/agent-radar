import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { relations } from "../lib/radar-data";

const graphNodes = [
  ["Agent Manager", "node-manager"],
  ["Multi-agent\nOrchestration", "node-orchestration"],
  ["Graph\nEngineering", "node-graph"],
  ["Durable\nExecution", "node-durable"],
  ["Agent Harness", "node-harness"],
  ["Context\nEngineering", "node-context"],
] as const;

export default function GraphPage() {
  return (
    <AppShell active="graph">
      <header className="page-hero compact-hero">
        <div><span className="mono-label">RELATIONSHIP MAP / 6 NODES · 5 EDGES</span><h1>Concept Graph</h1><p>关系是可引用的主张。图用于探索，下面的列表用于精确阅读和无障碍访问。</p></div>
        <Link href="/concepts" className="outline-action">概念索引 <span aria-hidden="true">→</span></Link>
      </header>
      <section className="graph-panel" aria-label="概念关系图">
        <div className="graph-grid" aria-hidden="true">
          <span className="graph-line line-a" /><span className="graph-line line-b" /><span className="graph-line line-c" /><span className="graph-line line-d" /><span className="graph-line line-e" />
          {graphNodes.map(([name, className]) => <div className={`graph-node ${className}`} key={name}>{name.split("\n").map((line) => <span key={line}>{line}</span>)}</div>)}
          <span className="graph-caption caption-a">人的控制面</span><span className="graph-caption caption-b">执行契约</span><span className="graph-caption caption-c">运行底座</span>
        </div>
        <div className="graph-legend"><span><i className="legend-product" />产品形态</span><span><i className="legend-practice" />工程实践</span><span><i className="legend-runtime" />运行能力</span></div>
      </section>
      <section className="relation-list">
        <div className="section-heading"><div><span className="mono-label">ACCESSIBLE RELATION LIST</span><h2>关系证据</h2></div></div>
        {relations.map((relation, index) => <div className="relation-row" key={`${relation.from}-${relation.to}`}><span>0{index + 1}</span><b>{relation.from}</b><i>{relation.type}</i><strong>{relation.to}</strong><small>{relation.note}</small></div>)}
      </section>
    </AppShell>
  );
}
