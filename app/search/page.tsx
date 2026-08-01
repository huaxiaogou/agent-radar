"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { concepts, signals, sources } from "../lib/radar-data";

export default function SearchPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const normalized = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalized) return [];
    return [
      ...signals.filter((item) => `${item.title} ${item.summary} ${item.topic}`.toLowerCase().includes(normalized)).map((item) => ({ type: "SIGNAL", title: item.title, detail: item.summary, href: `/concepts/${item.slug}` })),
      ...concepts.filter((item) => `${item.name} ${item.definition}`.toLowerCase().includes(normalized)).map((item) => ({ type: "CONCEPT", title: item.name, detail: item.definition, href: `/concepts/${item.slug}` })),
      ...sources.filter((item) => `${item.name} ${item.focus}`.toLowerCase().includes(normalized)).map((item) => ({ type: "SOURCE", title: item.name, detail: item.focus, href: item.href })),
    ];
  }, [normalized]);

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
    <AppShell active="search">
      <section className="search-page">
        <span className="mono-label">SEARCH SIGNALS · CONCEPTS · SOURCES</span>
        <h1>找一个概念，<br />或一条证据。</h1>
        <label htmlFor="radar-search">搜索雷达</label>
        <div className="search-box"><span aria-hidden="true">⌕</span><input id="radar-search" name="radar-search" type="search" autoComplete="off" aria-keyshortcuts="Meta+K Control+K" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="试试 Agent Manager、Harness、Microsoft…" /><kbd>⌘&nbsp;K</kbd></div>
        {!normalized ? <div className="search-suggestions"><span>建议</span>{["Agent Manager", "Graph Engineering", "Harness", "AutoGen"].map((item) => <button type="button" onClick={() => updateQuery(item)} key={item}>{item}</button>)}</div> : (
          <div className="search-results" aria-live="polite">
            <span className="mono-label">{matches.length} RESULTS</span>
            {matches.length ? matches.map((item, index) => item.href.startsWith("http") ? <a href={item.href} target="_blank" rel="noreferrer" key={`${item.type}-${item.title}`}><span>{String(index + 1).padStart(2, "0")} / {item.type}</span><h2>{item.title}</h2><p>{item.detail}</p></a> : <Link href={item.href} key={`${item.type}-${item.title}`}><span>{String(index + 1).padStart(2, "0")} / {item.type}</span><h2>{item.title}</h2><p>{item.detail}</p></Link>) : <div className="empty-search"><h2>没有匹配项</h2><p>换一个术语，或前往 Sources 检查当前覆盖范围。</p></div>}
          </div>
        )}
      </section>
    </AppShell>
  );
}
