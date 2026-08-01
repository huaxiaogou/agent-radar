import { AppShell } from "../components/AppShell";
import { playbooks } from "../lib/radar-data";

export default function PlaybooksPage() {
  return (
    <AppShell active="playbooks">
      <header className="page-hero">
        <div><span className="mono-label">FROM SIGNAL TO PRACTICE</span><h1>Playbooks</h1><p>只有能转成决策、边界和验证动作的概念，才会进入工程方法库。</p></div>
      </header>
      <section className="playbook-list">
        {playbooks.map((item, index) => (
          <article className="playbook-card" key={item.title}>
            <div className="playbook-index"><span>PB</span><strong>0{index + 1}</strong></div>
            <div><span className="mono-label">{item.maturity} · {item.steps} STEPS</span><h2>{item.title}</h2><p>{item.description}</p></div>
            <span className="playbook-arrow" aria-hidden="true">→</span>
          </article>
        ))}
      </section>
      <section className="method-note"><div><span className="mono-label">PUBLISHING GATE</span><h2>方法不是摘要的另一个名字。</h2></div><p>进入 Playbook 前必须具备：明确适用条件、明确不适用条件、一个最小实施路径，以及能够证明结果的验证动作。</p></section>
    </AppShell>
  );
}
