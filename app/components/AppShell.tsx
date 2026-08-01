import Link from "next/link";
import type { ReactNode } from "react";
import type { RadarStatus } from "../lib/radar-data";
import { PrimaryNav } from "./PrimaryNav";

function statusCopy(status?: RadarStatus) {
  if (!status) return { label: "初始数据", badge: "等待首次自动采集", className: "" };
  if (status.runStatus === "failed") return { label: "数据异常", badge: "采集异常 · 使用安全快照", className: "is-delayed" };
  if (status.mode === "seed") return { label: "初始数据", badge: "等待首次自动采集", className: "" };
  if (status.stale) return { label: "数据延迟", badge: "采集延迟 · 保留上次数据", className: "is-delayed" };
  if (status.runStatus === "partial") return { label: "部分更新", badge: "实时采集 · 部分来源异常", className: "is-partial" };
  const analysisLabel = status.analysisMode === "openai"
    ? "OpenAI 分析"
    : status.analysisMode === "deepseek"
      ? "DeepSeek 分析"
      : status.analysisMode === "mixed"
        ? "混合分析"
        : "规则分析";
  return { label: "实时采集", badge: `正式版 · ${analysisLabel}`, className: "is-live" };
}

function verifiedTime(status?: RadarStatus) {
  const value = status?.lastSuccessfulAt || status?.generatedAt;
  if (!value) return "尚未采集";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function AppShell({ active, children, status }: { active: string; children: ReactNode; status?: RadarStatus }) {
  const copy = statusCopy(status);
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="sidebar" aria-label="主要导航">
        <Link href="/today" className="brand" aria-label="Agent Radar 首页">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-type">AR<span>／26</span></span>
        </Link>
        <PrimaryNav active={active} />
        <div className="sidebar-foot">
          <span className={`status-light ${copy.className}`} aria-hidden="true" />
          <span>{copy.label}</span>
          <small>Last successful<br />{verifiedTime(status)}</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="mono-label">PERSONAL INTELLIGENCE DESK</span>
            <b>AI Coding / Agent Radar</b>
          </div>
          <div className="topbar-actions">
            <span className={`snapshot-badge ${copy.className}`}>{copy.badge}</span>
            <Link href="/search" className="search-link"><span aria-hidden="true">⌕</span> 搜索</Link>
          </div>
        </header>
        <main id="main-content">{children}</main>
      </div>
    </div>
  );
}
