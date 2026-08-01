import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

export default async function ConceptsPage() {
  const snapshot = await getRadarSnapshot();
  return (
    <AppShell active="concepts" status={snapshot.status}>
      <header className="page-hero">
        <div><span className="mono-label">DURABLE MEMORY / NOT A GLOSSARY</span><h1>Concepts</h1><p>概念页记录定义、起源、机制新颖性、工程含义和证据修订，而不是保存一篇静态文章。</p></div>
        <div className="concept-key"><span><i className="key-hot" />升温</span><span><i className="key-stable" />已验证</span></div>
      </header>
      <section className="concept-grid">
        {snapshot.concepts.map((concept, index) => (
          <Link className="concept-card" href={`/concepts/${concept.slug}`} key={concept.slug}>
            <div className="concept-card-top"><span className="mono-label">C-{String(index + 1).padStart(2, "0")}</span><span>{concept.stage}</span></div>
            <h2>{concept.name}</h2>
            <p>{concept.definition}</p>
            <div className="concept-temperature"><span>RADAR HEAT</span><div><i style={{ width: `${concept.temperature}%` }} /></div><b>{concept.temperature}</b></div>
            <small>{concept.relation}{typeof concept.signalCount === "number" ? ` · ${concept.signalCount} 个信号` : ""}</small>
          </Link>
        ))}
      </section>
      {snapshot.candidateConcepts.length > 0 && (
        <section className="candidate-concepts" aria-labelledby="candidate-concepts-title">
          <header>
            <div>
              <span className="mono-label">DISCOVERY QUEUE / NOT YET CANONICAL</span>
              <h2 id="candidate-concepts-title">待溯源概念候选</h2>
            </div>
            <p>由分析模型从已收录材料中提出，只表示“现有分类可能不够准确”。它们不会自动进入正式概念目录，必须补齐定义、命名起源和独立工程证据。</p>
          </header>
          <div className="candidate-concept-list">
            {snapshot.candidateConcepts.map((candidate) => (
              <article key={candidate.name}>
                <div className="candidate-concept-meta">
                  <span>{candidate.highestEvidenceLayer === "official" ? "最高证据：官方" : candidate.highestEvidenceLayer === "practitioner" ? "最高证据：实践者" : "当前仅社区"}</span>
                  <span>{candidate.signalCount} 个信号 · {candidate.evidenceCount} 条原文</span>
                </div>
                <h3>{candidate.name}</h3>
                <p>待核验：它是否有稳定定义、是否区别于现有概念，以及谁最早以当前含义命名。</p>
                <div className="candidate-source-links">
                  {candidate.sources.map((source) => (
                    <a href={source.href} target="_blank" rel="noreferrer" key={source.href}>
                      <span>{source.layer === "official" ? "官方" : source.layer === "practitioner" ? "实践" : "社区"} · {source.originalTitle || source.name}<span aria-hidden="true"> ↗</span></span>
                      <small>{new URL(source.href).hostname}</small><span className="sr-only">（在新窗口打开）</span>
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
