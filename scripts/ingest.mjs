#!/usr/bin/env node

import path from "node:path";
import { acquireTaskLock, projectRoot, reconcileAbandonedRuns, releaseTaskLock } from "./task-lock.mjs";

try {
  process.loadEnvFile(path.join(projectRoot, ".env.production"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function triggerFromArgs() {
  const index = process.argv.indexOf("--trigger");
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : "manual";
}

const lockHandle = await acquireTaskLock();
try {
  const { openDatabase } = await import("../radar/database.mjs");
  const database = openDatabase();
  try {
    const reconciliation = await reconcileAbandonedRuns({ database, lockHandle });
    if (reconciliation.reconciledCount) {
      console.warn(`[runs] reconciled-abandoned=${reconciliation.reconciledCount}`);
    }
  } finally {
    database.close();
  }
  const { runIngestion } = await import("../radar/pipeline.mjs");
  const result = await runIngestion({ trigger: triggerFromArgs() });
  const snapshotStatus = { ...(result.snapshot || {}) };
  delete snapshotStatus.signals;
  delete snapshotStatus.discussionPulses;
  console.log(JSON.stringify({
    service: "agent-radar",
    task: "ingest",
    ...result,
    snapshot: snapshotStatus,
  }, null, 2));
} finally {
  await releaseTaskLock(lockHandle);
}
