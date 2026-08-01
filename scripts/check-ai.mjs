#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { deepSeekAnalysis, openAIAnalysis, resolveAnalysisProvider } from "../radar/analyze.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

try {
  process.loadEnvFile(`${projectRoot}/.env.production`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const item = {
  title: "Agent Radar provider verification",
  excerpt: "A coding-agent intelligence pipeline verifies structured analysis, provider identity, and safe fallback behavior.",
  contentText: "",
  sourceName: "Agent Radar self-check",
  sourceClass: "运行验证",
  url: "https://radar.jayjp.com/api/health",
  publishedAt: new Date().toISOString(),
};

try {
  const provider = resolveAnalysisProvider();
  if (provider === "rules") {
    throw new Error("未启用外部 AI；请检查 RADAR_AI_PROVIDER 及对应 API Key");
  }
  const result = provider === "deepseek"
    ? await deepSeekAnalysis(item)
    : await openAIAnalysis(item);
  console.log(JSON.stringify({
    service: "agent-radar",
    task: "ai-provider-check",
    status: "ok",
    provider,
    model: provider === "deepseek"
      ? process.env.RADAR_DEEPSEEK_MODEL || "deepseek-v4-flash"
      : process.env.RADAR_OPENAI_MODEL || "gpt-5.6-terra",
    analysisMode: result.analysisMode,
    repairedCategories: Boolean(result.analysisWarning),
  }, null, 2));
} catch (error) {
  console.error(`AI 供应商检查失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
