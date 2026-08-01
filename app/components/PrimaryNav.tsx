"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const navItems = [
  ["today", "/today", "TODAY", "今日"],
  ["signals", "/signals", "SIG", "信号"],
  ["concepts", "/concepts", "CON", "概念"],
  ["models", "/models", "MOD", "模型"],
  ["discussions", "/discussions", "COM", "社区"],
  ["graph", "/graph", "MAP", "关系"],
  ["playbooks", "/playbooks", "PLAY", "方法"],
  ["sources", "/sources", "SRC", "来源"],
  ["digests", "/digests", "LOG", "简报"],
] as const;

export function PrimaryNav({ active }: { active: string }) {
  const activeLink = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    activeLink.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav className="side-nav">
      {navItems.map(([id, href, code, label]) => (
        <Link
          href={href}
          className={active === id ? "nav-link active" : "nav-link"}
          key={id}
          aria-current={active === id ? "page" : undefined}
          ref={active === id ? activeLink : undefined}
        >
          <span>{code}</span>
          <b>{label}</b>
        </Link>
      ))}
    </nav>
  );
}
