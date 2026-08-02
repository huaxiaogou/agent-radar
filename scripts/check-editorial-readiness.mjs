#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPublishedArticlesForBackfill, getSnapshotPath, openDatabase } from "../radar/database.mjs";
import { chineseEditorialIssue, isLlmEditorialReady } from "../radar/editorial.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

try {
  process.loadEnvFile(path.join(projectRoot, ".env.production"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function readinessReason(editorial) {
  const analysisMode = editorial?.analysisMode || editorial?.analysis_mode || "未设置";
  if (!['openai', 'deepseek'].includes(analysisMode)) return `analysis_mode=${analysisMode}`;
  return chineseEditorialIssue(editorial) || "编辑字段未就绪";
}

async function readLiveSnapshot() {
  try {
    const snapshot = JSON.parse(await readFile(getSnapshotPath(), "utf8"));
    if (!snapshot || typeof snapshot !== "object" || !snapshot.status || !Array.isArray(snapshot.signals)) {
      throw new Error("现有快照结构无效");
    }
    if (snapshot.status.mode !== "live") return { snapshot: null, issue: `现有快照不是 live：${snapshot.status.mode || "未设置"}` };
    return { snapshot, issue: null };
  } catch (error) {
    if (error?.code === "ENOENT") return { snapshot: null, issue: "现有 live snapshot 不存在" };
    return { snapshot: null, issue: `现有 live snapshot 无效：${error instanceof Error ? error.message : String(error)}` };
  }
}

const database = openDatabase();
try {
  const publishedArticles = getPublishedArticlesForBackfill(database);
  const publicBacklog = publishedArticles.flatMap((row) => {
    if (isLlmEditorialReady(row)) return [];
    return [{ url: row.url, reason: readinessReason(row) }];
  });
  const { snapshot, issue: snapshotIssue } = await readLiveSnapshot();
  const snapshotBacklog = (snapshot?.signals || []).flatMap((signal) => {
    if (isLlmEditorialReady(signal)) return [];
    return [{ slug: signal.slug || "未设置", reason: readinessReason(signal) }];
  });

  if (!publishedArticles.length || snapshotIssue || publicBacklog.length || snapshotBacklog.length) {
    console.error(JSON.stringify({
      service: "agent-radar",
      task: "editorial-readiness",
      status: "blocked",
      databaseIssue: publishedArticles.length ? null : "没有可公开的真实采集文章",
      snapshotIssue,
      publicBacklogCount: publicBacklog.length,
      snapshotBacklogCount: snapshotBacklog.length,
      publicBacklog: publicBacklog.slice(0, 20),
      snapshotBacklog: snapshotBacklog.slice(0, 20),
      remediation: "npm run editorial:backfill",
    }, null, 2));
    console.error("正式数据尚未就绪：请先完成真实采集和历史中文编辑回填，再生成完整 live snapshot。");
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      service: "agent-radar",
      task: "editorial-readiness",
      status: "ok",
      publicArticleCount: getPublishedArticlesForBackfill(database).length,
      liveSnapshotSignalCount: snapshot?.signals.length || 0,
    }, null, 2));
  }
} finally {
  database.close();
}
