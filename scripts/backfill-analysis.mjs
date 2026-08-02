#!/usr/bin/env node

import path from "node:path";
import { runAnalysisBackfill } from "../radar/backfill.mjs";
import { openDatabase } from "../radar/database.mjs";
import { resolveAnalysisProvider } from "../radar/provider.mjs";
import { buildSnapshot, writeSnapshotAtomic } from "../radar/snapshot.mjs";
import { acquireTaskLock, projectRoot, releaseTaskLock } from "./task-lock.mjs";

try {
  process.loadEnvFile(path.join(projectRoot, ".env.production"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await acquireTaskLock();
let database;
try {
  const provider = resolveAnalysisProvider();
  if (provider === "rules") throw new Error("editorial:backfill 需要配置 DeepSeek 或 OpenAI，不能使用 rules");

  database = openDatabase();
  const result = await runAnalysisBackfill({
    database,
    concurrency: process.env.RADAR_BACKFILL_CONCURRENCY || 4,
  });
  if (result.failedCount > 0) {
    console.error(JSON.stringify({ service: "agent-radar", task: "editorial-backfill", provider, ...result }, null, 2));
    process.exitCode = 1;
  } else {
    const snapshot = await buildSnapshot(database);
    await writeSnapshotAtomic(snapshot);
    console.log(JSON.stringify({
      service: "agent-radar",
      task: "editorial-backfill",
      provider,
      ...result,
      snapshot: snapshot.status,
    }, null, 2));
  }
} finally {
  database?.close();
  await releaseTaskLock();
}
