import { AppShell } from "../components/AppShell";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

export default async function DigestsPage() {
  const snapshot = await getRadarSnapshot();
  return (
    <AppShell active="digests" status={snapshot.status}>
      <header className="page-hero"><div><span className="mono-label">WEEKLY FIELD LOG</span><h1>Digests</h1><p>简报只保存一周内真正改变判断的内容；没有新证据时，宁可不发布。</p></div></header>
      <section className="digest-list">
        {snapshot.digests.map((digest, index) => <article key={digest.period}><div className="digest-period"><span>{digest.period}</span><strong>0{index + 1}</strong></div><div><h2>{digest.title}</h2><p>{digest.summary}</p><small>{digest.signals} 个关联信号 · 已绑定来源</small></div><span className="digest-state">{digest.state}</span></article>)}
      </section>
    </AppShell>
  );
}
