import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const viewport: Viewport = { themeColor: "#f2f6f8" };

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;

  return {
    title: { default: "Agent Radar — AI Coding 技术情报", template: "%s · Agent Radar" },
    description: "追踪 AI Coding、Agent 工程、多 Agent 编排与新概念的来源、证据和工程含义。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      type: "website",
      title: "Agent Radar — AI Coding 技术情报",
      description: "不追新闻，追踪工程范式的位移。",
      images: [{ url: socialImage, width: 1730, height: 909, alt: "Agent Radar 证据脉冲线" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Agent Radar — AI Coding 技术情报",
      description: "不追新闻，追踪工程范式的位移。",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
