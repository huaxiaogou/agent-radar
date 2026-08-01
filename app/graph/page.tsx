import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { getRadarSnapshot } from "../lib/radar-store";
import { ConceptGraph } from "./ConceptGraph";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const snapshot = await getRadarSnapshot();
  const nodeCount = new Set(snapshot.relations.flatMap((relation) => [relation.from, relation.to])).size;
  return (
    <AppShell active="graph" status={snapshot.status}>
      <header className="page-hero compact-hero">
        <div><span className="mono-label">RELATIONSHIP MAP / {nodeCount} NODES · {snapshot.relations.length} EDGES</span><h1>Concept Graph</h1><p>关系是可引用的主张。图用于探索，下面的列表用于精确阅读和无障碍访问。</p></div>
        <Link href="/concepts" className="outline-action">概念索引 <span aria-hidden="true">→</span></Link>
      </header>
      <section className="graph-panel" aria-label="概念关系图">
        <ConceptGraph relations={snapshot.relations} />
        <div className="graph-legend"><span><i className="legend-product" />产品形态</span><span><i className="legend-practice" />工程实践</span><span><i className="legend-runtime" />运行能力</span></div>
      </section>
      <section className="relation-list">
        <div className="section-heading"><div><span className="mono-label">ACCESSIBLE RELATION LIST</span><h2>关系证据</h2></div></div>
        {snapshot.relations.map((relation, index) => <div className="relation-row" key={`${relation.from}-${relation.to}`}><span>0{index + 1}</span><b>{relation.from}</b><i>{relation.type}</i><strong>{relation.to}</strong><small>{relation.note}</small></div>)}
      </section>
    </AppShell>
  );
}
