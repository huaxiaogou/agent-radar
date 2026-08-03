import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { getRadarSnapshot } from "../lib/radar-store";
import { ConceptGraph } from "./ConceptGraph";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const snapshot = await getRadarSnapshot();
  const nodeCount = new Set(snapshot.relations.flatMap((relation) => [relation.from, relation.to])).size;
  const conceptSlugs = Object.fromEntries(snapshot.concepts.map((concept) => [
    concept.canonicalName || concept.name,
    concept.slug,
  ]));
  return (
    <AppShell active="graph" status={snapshot.status}>
      <header className="page-hero compact-hero">
        <div><span className="mono-label">RELATIONSHIP MAP / {nodeCount} NODES · {snapshot.relations.length} EDGES</span><h1>Concept Graph</h1><p>关系是可引用的主张。图用于探索，下面的列表用于精确阅读和无障碍访问。</p></div>
        <Link href="/concepts" className="outline-action">概念索引 <span aria-hidden="true">→</span></Link>
      </header>
      {snapshot.relations.length ? <>
        <section className="graph-panel" aria-label="概念关系图">
          <ConceptGraph relations={snapshot.relations} conceptSlugs={conceptSlugs} />
          <div className="graph-legend"><span><i className="legend-product" />产品形态</span><span><i className="legend-practice" />工程实践</span><span><i className="legend-runtime" />运行能力</span></div>
        </section>
        <section className="relation-list">
          <div className="section-heading"><div><span className="mono-label">ACCESSIBLE RELATION LIST</span><h2>关系证据</h2></div></div>
          {snapshot.relations.map((relation, index) => (
            <article className="relation-row" key={`${relation.from}-${relation.relationType || relation.type}-${relation.to}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{conceptSlugs[relation.from] ? <Link href={`/concepts/${conceptSlugs[relation.from]}`}>{relation.from}</Link> : relation.from}</b>
              <i>{relation.type}</i>
              <strong>{conceptSlugs[relation.to] ? <Link href={`/concepts/${conceptSlugs[relation.to]}`}>{relation.to}</Link> : relation.to}</strong>
              <div className="relation-detail">
                <p>{relation.note}</p>
                {relation.evidenceUrls?.length ? (
                  <div className="relation-evidence" aria-label="关系证据">
                    <span>置信度 {Math.round((relation.confidence || 0) * 100)}%</span>
                    {relation.evidenceUrls.map((href, evidenceIndex) => (
                      <a href={href} target="_blank" rel="noreferrer" key={href}>原始证据 {evidenceIndex + 1} ↗</a>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      </> : <section className="graph-empty-state" role="status" aria-labelledby="graph-empty-title">
        <span className="mono-label">RELATIONSHIP EVIDENCE PENDING</span>
        <h2 id="graph-empty-title">暂无概念关系</h2>
        <p>等待两个正式概念和可引用证据形成关系后，这里才会发布关系图与证据列表。</p>
        <Link href="/concepts">查看正式概念 <span aria-hidden="true">→</span></Link>
      </section>}
    </AppShell>
  );
}
