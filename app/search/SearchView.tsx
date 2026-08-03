"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { engineeringThemeSearchTerms } from "../lib/concept-themes";
import type { Concept, RadarSource, RadarStatus, Signal } from "../lib/radar-data";

function conceptSearchHaystack(concept: Concept) {
  return [
    concept.name,
    concept.canonicalName,
    concept.definition,
    concept.nonDefinition,
    concept.problem,
    concept.whyNow,
    concept.origin,
    concept.mechanism,
    concept.architecture,
    concept.dailyDelta,
    ...(concept.aliases || []),
    ...engineeringThemeSearchTerms(concept.themes),
    ...(concept.evolution || []),
    ...(concept.designConstraints || []),
    ...(concept.implementationPatterns || []),
    ...(concept.antiPatterns || []),
    ...(concept.tradeoffs || []),
    ...(concept.failureModes || []),
    ...(concept.securityRisks || []),
    ...(concept.operationalConcerns || []),
    ...(concept.applicability || []),
    ...(concept.nonApplicability || []),
    ...(concept.controversies || []),
  ].filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLocaleLowerCase();
}

export function SearchView({ initialQuery, signals, concepts, sources, status }: {
  initialQuery?: string;
  signals: Signal[];
  concepts: Concept[];
  sources: RadarSource[];
  status: RadarStatus;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const normalized = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalized) return [];
    const formalConceptSlugs = new Set(concepts
      .filter((concept) => concept.stage.toLowerCase() !== "candidate")
      .map((concept) => concept.slug));
    return [
      ...signals.filter((item) => `${item.title} ${item.summary} ${item.topic} ${item.sources.map((source) => source.originalTitle || "").join(" ")}`.toLowerCase().includes(normalized)).map((item) => ({
        type: "SIGNAL",
        title: item.title,
        detail: item.summary,
        href: item.conceptSlug && formalConceptSlugs.has(item.conceptSlug)
          ? `/concepts/${item.conceptSlug}`
          : `/signals#${item.slug}`,
      })),
      ...signals.flatMap((signal) => signal.sources
        .filter((source) => source.layer === "community" && source.originalTitle?.toLowerCase().includes(normalized))
        .map((source) => ({ type: source.language === "zh" ? "中文讨论" : "EN DISCUSSION", title: source.originalTitle!, detail: signal.implication, href: source.href }))),
      ...concepts.filter((item) => formalConceptSlugs.has(item.slug) && conceptSearchHaystack(item).includes(normalized)).map((item) => ({ type: "CONCEPT", title: item.name, detail: item.definition, href: `/concepts/${item.slug}` })),
      ...sources.filter((item) => `${item.name} ${item.focus}`.toLowerCase().includes(normalized)).map((item) => ({ type: "SOURCE", title: item.name, detail: item.focus, href: item.href })),
    ];
  }, [concepts, normalized, signals, sources]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("radar-search")?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function updateQuery(value: string) {
    setQuery(value);
    const nextUrl = new URL(window.location.href);
    if (value.trim()) nextUrl.searchParams.set("q", value);
    else nextUrl.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  return (
    <AppShell active="search" status={status}>
      <section className="search-page">
        <span className="mono-label">SEARCH SIGNALS · DISCUSSIONS · CONCEPTS · SOURCES</span>
        <h1>找一个概念，<br />或一条证据。</h1>
        <label htmlFor="radar-search">搜索雷达</label>
        <div className="search-box"><span aria-hidden="true">⌕</span><input id="radar-search" name="radar-search" type="search" autoComplete="off" aria-keyshortcuts="Meta+K Control+K" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="试试 Agent Manager、Harness、Microsoft…" /><kbd>⌘&nbsp;K</kbd></div>
        {!normalized ? <div className="search-suggestions"><span>建议</span>{["Agent Manager", "多智能体编排", "上下文工程", "Harness"].map((item) => <button type="button" onClick={() => updateQuery(item)} key={item}>{item}</button>)}</div> : (
          <div className="search-results" aria-live="polite">
            <span className="mono-label">{matches.length} RESULTS</span>
            {matches.length ? matches.map((item, index) => item.href.startsWith("http") ? <a href={item.href} target="_blank" rel="noreferrer" key={`${item.type}-${item.title}`}><span>{String(index + 1).padStart(2, "0")} / {item.type}</span><h2>{item.title}</h2><p>{item.detail}</p></a> : <Link href={item.href} key={`${item.type}-${item.title}`}><span>{String(index + 1).padStart(2, "0")} / {item.type}</span><h2>{item.title}</h2><p>{item.detail}</p></Link>) : <div className="empty-search"><h2>没有匹配项</h2><p>换一个术语，或前往 Sources 检查当前覆盖范围。</p></div>}
          </div>
        )}
      </section>
    </AppShell>
  );
}
