"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RadarStatus, Signal } from "../lib/radar-data";
import { AppShell } from "../components/AppShell";
import { SignalCard } from "../components/SignalCard";

const stages = ["全部阶段", "Spark", "Emerging", "Validated", "Cooling"];

export function SignalsView({ initialStage, signals, status }: { initialStage?: string; signals: Signal[]; status: RadarStatus }) {
  const router = useRouter();
  const pathname = usePathname();
  const stage = stages.includes(initialStage ?? "") ? initialStage! : "全部阶段";
  const visible = useMemo(
    () => signals.filter((signal) => stage === "全部阶段" || signal.stage === stage),
    [stage, signals],
  );

  function selectStage(nextStage: string) {
    const nextParams = new URLSearchParams(window.location.search);
    if (nextStage === "全部阶段") nextParams.delete("stage");
    else nextParams.set("stage", nextStage);
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <AppShell active="signals" status={status}>
      <header className="page-hero compact-hero">
        <div><span className="mono-label">EVENT CLUSTERS / EVIDENCE FIRST</span><h1>Signals</h1><p>同一事件只占一个位置；传播数量和独立证据分开计算。</p></div>
        <div className="hero-count"><strong>{visible.length}</strong><span>当前事件簇</span></div>
      </header>
      <section className="filter-bar page-filter" aria-label="趋势阶段筛选">
        <div className="filter-group">
          {stages.map((item) => <button type="button" aria-pressed={stage === item} onClick={() => selectStage(item)} key={item}>{stage === item && <span aria-hidden="true">✓</span>}{item}</button>)}
        </div>
      </section>
      <div className="signal-stream wide-stream">{visible.map((signal) => <SignalCard signal={signal} key={signal.slug} />)}</div>
    </AppShell>
  );
}
