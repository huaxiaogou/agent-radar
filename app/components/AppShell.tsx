import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  ["today", "/today", "TODAY", "今日"],
  ["signals", "/signals", "SIG", "信号"],
  ["concepts", "/concepts", "CON", "概念"],
  ["graph", "/graph", "MAP", "关系"],
  ["playbooks", "/playbooks", "PLAY", "方法"],
  ["sources", "/sources", "SRC", "来源"],
  ["digests", "/digests", "LOG", "简报"],
] as const;

export function AppShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="sidebar" aria-label="主要导航">
        <Link href="/today" className="brand" aria-label="Agent Radar 首页">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-type">AR<span>／26</span></span>
        </Link>
        <nav className="side-nav">
          {navItems.map(([id, href, code, label]) => (
            <Link href={href} className={active === id ? "nav-link active" : "nav-link"} key={id} aria-current={active === id ? "page" : undefined}>
              <span>{code}</span>
              <b>{label}</b>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="status-light" aria-hidden="true" />
          <span>回放模式</span>
          <small>Sources verified<br />2026-08-01</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="mono-label">PERSONAL INTELLIGENCE DESK</span>
            <b>AI Coding / Agent Radar</b>
          </div>
          <div className="topbar-actions">
            <span className="snapshot-badge">V1 真实来源回放</span>
            <Link href="/search" className="search-link"><span aria-hidden="true">⌕</span> 搜索</Link>
          </div>
        </header>
        <main id="main-content">{children}</main>
      </div>
    </div>
  );
}
