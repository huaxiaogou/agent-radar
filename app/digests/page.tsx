import { AppShell } from "../components/AppShell";

const digests = [
  { period: "2026 / W31", title: "从 Agent Manager 到独立 Agent 工作面", summary: "Google 将 Agent Manager 的核心范式从 IDE 拆出；管理多个异步 Agent 正成为独立产品问题。", signals: 3 },
  { period: "2026 / W30", title: "声明式编排与 Harness 同时进入稳定层", summary: "Microsoft Agent Framework 连续发布 Harness 与声明式工作流，工程重心从 Agent 角色转向运行契约。", signals: 4 },
  { period: "2026 / REPLAY", title: "Graph Engineering 概念溯源样本", summary: "把热门标签拆为图式执行、状态管理、可观测性与失败恢复四类既有机制，等待确认起源。", signals: 5 },
];

export default function DigestsPage() {
  return (
    <AppShell active="digests">
      <header className="page-hero"><div><span className="mono-label">WEEKLY FIELD LOG</span><h1>Digests</h1><p>简报只保存一周内真正改变判断的内容；没有新证据时，宁可不发布。</p></div></header>
      <section className="digest-list">
        {digests.map((digest, index) => <article key={digest.period}><div className="digest-period"><span>{digest.period}</span><strong>0{index + 1}</strong></div><div><h2>{digest.title}</h2><p>{digest.summary}</p><small>{digest.signals} 个关联信号 · 已绑定来源</small></div><span className="digest-state">回放样本</span></article>)}
      </section>
    </AppShell>
  );
}
