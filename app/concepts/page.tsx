import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { concepts } from "../lib/radar-data";

export default function ConceptsPage() {
  return (
    <AppShell active="concepts">
      <header className="page-hero">
        <div><span className="mono-label">DURABLE MEMORY / NOT A GLOSSARY</span><h1>Concepts</h1><p>概念页记录定义、起源、机制新颖性、工程含义和证据修订，而不是保存一篇静态文章。</p></div>
        <div className="concept-key"><span><i className="key-hot" />升温</span><span><i className="key-stable" />已验证</span></div>
      </header>
      <section className="concept-grid">
        {concepts.map((concept, index) => (
          <Link className="concept-card" href={`/concepts/${concept.slug}`} key={concept.slug}>
            <div className="concept-card-top"><span className="mono-label">C-{String(index + 1).padStart(2, "0")}</span><span>{concept.stage}</span></div>
            <h2>{concept.name}</h2>
            <p>{concept.definition}</p>
            <div className="concept-temperature"><span>RADAR HEAT</span><div><i style={{ width: `${concept.temperature}%` }} /></div><b>{concept.temperature}</b></div>
            <small>{concept.relation}</small>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
